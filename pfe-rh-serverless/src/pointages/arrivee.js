// src/pointages/arrivee.js
// POST /pointages/arrivee
//
// Ouvre un segment : arrivée, retour de pause, ou début de pause selon
// le type demandé. Les règles sont dans journee.js, testées sans
// réseau ; ce fichier ne fait que les appliquer et parler à la base.
//
// ── Attestation de présence : deux méthodes, deux preuves ───────────
//
//   QR + géolocalisation      atteste le LIEU. N'atteste pas qui
//                             pointe : un code photographié se partage.
//
//   Visage + géolocalisation  atteste l'IDENTITÉ. N'atteste pas le
//                             lieu, d'où la position dans les deux cas.
//
// La reconnaissance faciale remplace le QR, jamais la géolocalisation.
//
// ── Pourquoi le visage bloque et la position non ────────────────────
//
// Un visage qui ne correspond pas est un échec binaire : l'identité
// est fausse, le pointage est refusé. Une position est une mesure avec
// une incertitude — refuser à 160 mètres quand l'appareil annonce
// 100 mètres de précision rejetterait des salariés présents. Elle est
// donc consignée et signalée, pas opposée.
//
// Conséquence assumée : un pointage depuis le domicile réussit, et
// apparaît signalé dans le suivi RH.
//
// ── Deux contrôles ajoutés avant l'ouverture ────────────────────────
//
//   1. Les journées laissées ouvertes sont closes (cloture.rattraper).
//      Sans cela, un départ oublié hier fait échouer le pointage
//      d'aujourd'hui en 409 : le segment d'hier est encore ouvert.
//
//   2. Un salarié en congé accordé ne peut pas pointer. L'absence est
//      déjà décidée ; un pointage par-dessus produirait une journée
//      travaillée et un jour de congé décompté pour la même date.

const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, dateAujourdhui, heureLocale } = require("../utils/contexte");
const employes = require("../utils/employe");
const { verifierPresence, traceGeo } = require("../utils/geolocalisation");
const biometrie = require("../biometrie/biometrie");
const conge = require("../utils/conge");
const cloture = require("./cloture");
const journee = require("./journee");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

// Plusieurs passages par jour.
//
// Faux en exploitation : un salarié pointe une arrivée et un départ,
// et les pauses entre les deux. Vrai en développement, sans quoi
// aucun essai n'est possible après le premier pointage de la journée —
// il fallait aller supprimer la ligne en base entre chaque test.
//
// Le drapeau est lu à chaque appel et non figé au chargement : on peut
// l'activer sans redémarrer pendant une séance d'essais.
const multiplesAutorises = () =>
  process.env.POINTAGES_MULTIPLES === "true"
  || process.env.NODE_ENV === "development";

const METHODES = ["QR", "FACIAL"];

// Borne de la durée mesurée côté client. Une valeur venue du
// navigateur n'est pas une mesure de confiance : non bornée, une durée
// aberrante polluerait les médianes du chapitre de comparaison.
const DUREE_MAX_MS = 300000;

function dureeMesuree(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), DUREE_MAX_MS);
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) {
      return erreur(
        "Aucune fiche employé n'est rattachée à ce compte. Contactez les ressources humaines.",
        404
      );
    }

    // Date calculée dans le fuseau de l'entreprise, jamais en UTC : un
    // pointage à 00h30 à Tunis appartient bien au jour en cours.
    const aujourdhui = dateAujourdhui();
    const maintenant = new Date();

    // ── Journées laissées ouvertes ──
    //
    // Avant toute chose, et sans jamais lever : un oubli d'hier ne doit
    // pas empêcher de pointer aujourd'hui. C'est précisément la
    // situation que ce rattrapage débloque.
    await cloture.rattraper(fiche.id, fiche, aujourdhui);

    // ── Congé en cours ──
    //
    // 403 et non 409 : la demande est bien formée, c'est le droit de
    // pointer qui manque ce jour-là.
    const absence = await conge.enCongeLe(fiche.id, aujourdhui);
    if (absence.enConge) {
      return erreur(conge.messageRefus(absence.conge), 403);
    }

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    // ── Position ──
    // Demandée pour toutes les méthodes. Ne lève jamais : renvoie un
    // verdict que traceGeo consigne, avec son indicateur aVerifier.
    const verification = await verifierPresence(corps);

    // ── Attestation ──
    // Une méthode inconnue retombe sur QR plutôt que d'échouer : un
    // client plus ancien, qui n'envoie pas le champ, continue de
    // fonctionner.
    const methode = METHODES.includes(corps.methode) ? corps.methode : "QR";
    let traceBiometrie = null;

    if (methode === "FACIAL") {
      const verdict = await biometrie.verifier(
        fiche.id,
        corps.descripteurs ?? corps.descripteur
      );

      if (!verdict.reconnu) {
        // 403 et non 401 : le compte est bien authentifié, c'est
        // l'attestation de présence qui échoue. Et le message rappelle
        // l'alternative — un salarié que sa caméra trahit doit pouvoir
        // pointer quand même.
        return erreur(
          `${verdict.motif}. Vous pouvez pointer par QR et géolocalisation.`,
          403
        );
      }

      traceBiometrie = {
        // La distance est consignée : elle permet de repérer un
        // gabarit qui se dégrade — lunettes, coiffure, vieillissement —
        // avant qu'il ne cesse de fonctionner.
        distance: verdict.distance,
        // Une correspondance de justesse est acceptée mais signalée.
        aVerifier: verdict.aVerifier === true,
        apparence: verdict.apparence ?? null,
      };
    }

    // Le code du site n'est pas vérifié côté serveur aujourd'hui. Il
    // est consigné tel que reçu, ce qui rend la trace consultable,
    // mais un code périmé ou recopié passerait : le contrôle réel du
    // pointage par QR est la géolocalisation. À dire tel quel plutôt
    // qu'à laisser croire le contraire.
    const siteCode = typeof corps.siteCode === "string"
      ? corps.siteCode.slice(0, 200)
      : null;

    // ── Journée du jour ──
    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_POINTAGES,
      Key: { employeId: fiche.id, date: aujourdhui },
    }));

    const existante = lu.Item ?? null;
    const version = existante?.version ?? 0;

    const resultat = journee.ouvrir(existante, {
      debut: maintenant.toISOString(),
      type: corps.type ?? journee.TRAVAIL,
      multiplesAutorises: multiplesAutorises(),
      trace: {
        methode,
        siteCode,
        biometrie: traceBiometrie,
        dureeMs: dureeMesuree(corps.dureeMs),
        ...traceGeo(verification, corps),
      },
    });

    if (!resultat.ok) {
      return erreur(resultat.motif, resultat.statutHttp);
    }

    const item = {
      // Clé composite : une seule ligne par salarié et par jour, quel
      // que soit le nombre de segments. Les pointages d'une journée
      // restent donc atomiques — pas de ligne orpheline possible.
      employeId: fiche.id,
      date: aujourdhui,

      employeNom: employes.nomComplet(fiche, moi),
      employeEmail: fiche.email,
      poste: fiche.poste || "",
      departement: fiche.departement || "",

      creeLe: existante?.creeLe ?? maintenant.toISOString(),
      modifieLe: maintenant.toISOString(),
      version: version + 1,

      ...resultat.journee,
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_POINTAGES,
        Item: item,
        // Verrou optimiste. Deux pointages envoyés en même temps —
        // double-clic, onglet dupliqué — liraient la même journée et
        // le second écraserait le premier avec un état périmé. La
        // condition sur la version fait échouer le perdant, qui n'a
        // plus qu'à relire.
        ConditionExpression: version === 0
          ? "attribute_not_exists(employeId)"
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

    // Le pointage est en base : seulement maintenant l'usage du
    // gabarit est un fait. Consigné avant, le compteur grossissait
    // aussi quand l'écriture était refusée juste après, et la page du
    // salarié annonçait des reconnaissances sans pointage pour aller
    // avec.
    //
    // Pas de await : le compteur sert à repérer un gabarit qui se
    // dégrade, il ne doit pas retarder la réponse d'un pointage déjà
    // écrit. consigner() avale ses propres erreurs.
    if (methode === "FACIAL") {
      void biometrie.consigner(fiche.id);
    }

    const resume = journee.resume(item, fiche, { maintenant });

    const libelle = {
      [journee.TRAVAIL]: "Arrivée",
      [journee.PAUSE_DEJEUNER]: "Pause déjeuner",
      [journee.PAUSE_CAFE]: "Pause",
    }[resultat.journee.segments.at(-1).type] ?? "Pointage";

    return succes({
      pointage: item,
      resume,
      message: `${libelle} enregistrée à ${heureLocale(maintenant)}`,
    }, 201);

  } catch (e) {
    console.error("Erreur pointage arrivée:", e);
    return erreur("Impossible d'enregistrer l'arrivée");
  }
};