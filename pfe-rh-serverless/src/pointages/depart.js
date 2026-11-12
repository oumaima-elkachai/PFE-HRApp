// src/pointages/depart.js
// POST /pointages/depart
//
// Ferme le segment ouvert : départ, ou fin de pause. Les règles sont
// dans journee.js, testées sans réseau ; ce fichier ne fait que les
// appliquer et parler à la base.
//
// ── Un PutCommand plutôt qu'un UpdateCommand ────────────────────────
//
// La version précédente nommait un à un les quinze attributs de la
// trace dans une UpdateExpression, avec des suffixes « Depart » pour
// ne pas écraser ceux de l'arrivée. Chaque nouvel attribut demandait
// trois modifications au même endroit, et un oubli ne se voyait qu'en
// relisant la base.
//
// Avec les segments, la trace du départ vit DANS son segment : plus de
// collision possible entre arrivée et départ, donc plus besoin de
// suffixes. On réécrit la journée entière, sous verrou optimiste.
//
// ── La reconnaissance faciale au départ ─────────────────────────────
//
// Elle manquait. Le client proposait la méthode et envoyait les
// descripteurs ; ce fichier ne lisait ni `methode` ni `descripteurs`,
// et fermait le segment sans rien vérifier. Un salarié pouvait donc
// être « pointé en sortie » par n'importe qui ayant accès à sa session.
//
// Le contrôle est maintenant le même qu'à l'arrivée, et pour la même
// raison : c'est l'identité qui est attestée, pas le lieu.
//
// ── Un congé ne bloque pas le départ ────────────────────────────────
//
// L'arrivée refuse un salarié en congé accordé. Le départ, non : si un
// congé a été validé pendant qu'il travaillait, lui interdire de
// fermer son segment le laisserait « en service » indéfiniment. On
// ferme toujours ce qui est ouvert.

const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, dateAujourdhui, heureLocale } = require("../utils/contexte");
const employes = require("../utils/employe");
const { verifierPresence, traceGeo } = require("../utils/geolocalisation");
const biometrie = require("../biometrie/biometrie");
const journee = require("./journee");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

const METHODES = ["QR", "FACIAL"];

// Même borne qu'à l'arrivée : une durée venue du navigateur n'est pas
// une mesure de confiance, et une valeur aberrante fausserait les
// médianes du chapitre de comparaison des deux méthodes.
const DUREE_MAX_MS = 300000;

function dureeMesuree(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), DUREE_MAX_MS);
}

const formaterDuree = (minutes) =>
  `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const aujourdhui = dateAujourdhui();

    // Lecture directe par clé composite : aucun parcours de table.
    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_POINTAGES,
      Key: { employeId: fiche.id, date: aujourdhui },
    }));

    const existante = lu.Item;
    if (!existante) {
      return erreur("Aucun pointage d'arrivée trouvé pour aujourd'hui", 404);
    }

    const version = existante.version ?? 0;

    // L'horodatage vient du serveur, jamais du corps de la requête :
    // une heure transmise par le client se falsifie avec un curl.
    const maintenant = new Date();

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    // ── Attestation d'identité ──
    //
    // Vérifiée AVANT l'écriture, et avant même la position : un visage
    // qui ne correspond pas doit faire échouer la requête sans laisser
    // de trace de passage.
    const methode = METHODES.includes(corps.methode) ? corps.methode : "QR";
    let traceBiometrie = null;

    if (methode === "FACIAL") {
      const verdict = await biometrie.verifier(
        fiche.id,
        corps.descripteurs ?? corps.descripteur
      );

      if (!verdict.reconnu) {
        return erreur(
          `${verdict.motif}. Vous pouvez pointer votre départ par QR et géolocalisation.`,
          403
        );
      }

      traceBiometrie = {
        distance: verdict.distance,
        aVerifier: verdict.aVerifier === true,
        apparence: verdict.apparence ?? null,
      };
    }

    // La vérification précède l'écriture : calculée après, elle ne
    // serait jamais enregistrée.
    const verification = await verifierPresence(corps);
    const trace = traceGeo(verification, corps);

    const resultat = journee.fermer(existante, {
      fin: maintenant.toISOString(),
      // La trace du départ s'ajoute au segment qu'elle ferme. Les
      // champs de l'ouverture ne sont pas écrasés : seuls ceux-ci,
      // préfixés « fin », décrivent la fermeture.
      //
      // `finBiometrie` et non `biometrie` : écrire sans préfixe
      // effacerait la mesure de l'arrivée, et le suivi de dérive du
      // gabarit perdrait la moitié de ses points.
      trace: {
        finMethode: methode,
        finBiometrie: traceBiometrie,
        finDureeMs: dureeMesuree(corps.dureeMs),
        finLatitude: trace.latitude,
        finLongitude: trace.longitude,
        finPrecisionMetres: trace.precisionMetres,
        finSiteCode: trace.siteCode,
        finSiteNom: trace.siteNom,
        finDistanceMetres: trace.distanceMetres,
        finPresenceValidee: trace.presenceValidee,
        finAVerifier: trace.aVerifier,
        finMotifVerification: trace.motifVerification,
      },
    });

    if (!resultat.ok) {
      return erreur(resultat.motif, resultat.statutHttp);
    }

    const ferme = resultat.journee.segments.at(-1);

    const item = {
      ...existante,
      ...resultat.journee,
      modifieLe: maintenant.toISOString(),
      version: version + 1,
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_POINTAGES,
        Item: item,
        // Verrou optimiste : protège contre deux départs envoyés
        // simultanément, qui liraient la même journée et dont le
        // second écraserait le premier avec un état périmé.
        ConditionExpression: version === 0
          ? "attribute_exists(employeId)"
          : "version = :attendue",
        ...(version === 0
          ? {}
          : { ExpressionAttributeValues: { ":attendue": version } }),
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur(
          "Un autre pointage vient d'être enregistré. Rechargez la page.",
          409
        );
      }
      throw e;
    }

    // Comme à l'arrivée : consigné seulement une fois l'écriture
    // acquise, et sans await — le compteur sert au suivi de dérive du
    // gabarit, il ne doit pas retarder la réponse.
    if (methode === "FACIAL") {
      void biometrie.consigner(fiche.id);
    }

    const resume = journee.resume(item, fiche, { maintenant });
    const duree = formaterDuree(resultat.dureeMinutes);

    // Un départ hors zone n'est pas refusé, mais le salarié en est
    // averti : il saura pourquoi la RH le questionne.
    const avertissement = trace.aVerifier
      ? ` Position à vérifier : ${trace.motifVerification ?? "hors zone"}.`
      : "";

    const estPause = (ferme.type ?? journee.TRAVAIL) !== journee.TRAVAIL;

    return succes({
      pointage: item,
      resume,
      duree,
      message: estPause
        ? `Pause terminée à ${heureLocale(maintenant)}. Durée : ${duree}.`
        : `Départ enregistré à ${heureLocale(maintenant)}. `
          + `Travaillé aujourd'hui : ${formaterDuree(item.dureeMinutes)}.${avertissement}`,
    });

  } catch (e) {
    console.error("Erreur pointage départ:", e);
    return erreur("Impossible d'enregistrer le départ");
  }
};