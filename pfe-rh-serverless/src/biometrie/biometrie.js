// src/biometrie/biometrie.js
//
// Reconnaissance faciale pour le pointage : enrôlement, vérification,
// révocation.
//
// ── Choix de conception, à défendre ──────────────────────────────────
//
// 1. Aucune image de visage n'est jamais transmise ni stockée. Le
//    navigateur calcule un descripteur de 128 nombres flottants et
//    n'envoie que lui. L'image reste sur l'appareil.
//
// 2. Le consentement est séparé de celui de l'inscription. Un visage
//    est une donnée biométrique : son traitement exige un accord
//    spécifique, explicite et dissociable, pas une case groupée avec
//    les conditions générales.
//
// 3. L'alternative reste toujours disponible. Un salarié qui refuse
//    pointe par QR et géolocalisation, sans conséquence. C'est ce qui
//    rend le consentement crédible dans une relation de travail, où
//    il n'est jamais pleinement libre.
//
// 4. La révocation efface le descripteur, immédiatement et sans
//    justification à fournir.
//
// 5. Le descripteur est purgé à la sortie des effectifs. Conserver
//    une donnée biométrique après la fin du contrat n'a aucune base.

const { GetCommand, PutCommand, DeleteCommand, UpdateCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");

const TABLE_BIOMETRIE = process.env.TABLE_BIOMETRIE || "Biometrie-local";

// Version de la notice d'information présentée au salarié. Un
// changement de version invalide les consentements antérieurs : on ne
// peut pas consentir à un traitement qu'on n'a pas lu.
const VERSION_NOTICE = "2026-10-2";

// Un descripteur face-api.js compte exactement 128 flottants.
const TAILLE_DESCRIPTEUR = 128;

// Seuil de distance euclidienne. En dessous, deux descripteurs sont
// réputés provenir de la même personne.
//
// ── Pourquoi 0,45 et plus 0,60 ──────────────────────────────────────
//
// 0,60 est la valeur citée dans la littérature de ce modèle, mesurée
// sur des photographies de bonne qualité. Elle place le point de
// fonctionnement là où faux refus et faux acceptés s'équilibrent.
//
// Pour un pointage, les deux erreurs ne coûtent pas la même chose. Un
// faux refus fait pointer par QR : quelques secondes perdues. Un faux
// accepté fait attester la présence d'un absent — la fraude même que
// le dispositif existe pour empêcher, et qui est indétectable après
// coup.
//
// ── Valeur retenue, et sur quelles mesures ──────────────────────────
//
// Première campagne, dispositif AVANT correction — gabarit non
// normalisé, visage éloigné, décision sur une prise unique :
//
//   titulaire                  0,3528
//   tiers (homme barbu)        0,5639   accepté — faux accepté
//   tiers (sosie)              0,4509   accepté — faux accepté
//
// Seconde campagne, APRÈS correction — descripteurs normalisés,
// visage proche exigé, médiane de trois prises :
//
//   titulaire     0,1826  0,2604  0,2681  (dont avec lunettes)
//   tiers         0,3284  0,3374
//
// Les corrections ont divisé les distances légitimes par deux, et les
// deux populations se séparent enfin : pire mesure du titulaire
// 0,2681, meilleure mesure d'un tiers 0,3284. L'écart est de 0,060 et
// le seuil se place au milieu.
//
// 0,30 est donc une valeur mesurée, pas empruntée à la littérature —
// laquelle recommande 0,60 pour ce modèle et aurait accepté les cinq
// imposteurs sur cinq de ces deux campagnes.
//
// Réserve à énoncer : l'écart de 0,060 reste étroit, sur quatre
// mesures légitimes et deux mesures de tiers. Un relevé plus large,
// et avec davantage de personnes, resserrerait l'incertitude. La
// marge est volontairement placée du côté du refus : un refus fait
// pointer par QR, un faux accepté atteste la présence d'un absent.
//
// Le seuil est exposé ici plutôt que caché : un seuil qu'on ne peut
// pas discuter est un seuil qu'on ne peut pas défendre.
const SEUIL_DISTANCE = 0.30;

// Au-delà, le pointage est accepté mais signalé à la RH. Placé juste
// au-dessus de la pire mesure légitime observée : toute mesure
// s'approchant du territoire des tiers laisse une trace, même
// acceptée.
const SEUIL_DOUTE = 0.27;

// Écart maximal entre deux prises d'un même enrôlement. Plus strict
// que le seuil de reconnaissance : un gabarit bâti sur des prises
// divergentes est un gabarit flou, et un gabarit flou accepte tout le
// monde.
const SEUIL_COHERENCE = 0.35;

/**
 * Ramène un descripteur à une longueur de 1.
 *
 * Le modèle produit des vecteurs de longueur très proche de 1, et le
 * seuil suppose cette longueur. La moyenne de plusieurs descripteurs,
 * en revanche, est systématiquement plus courte : la moyenne de
 * vecteurs unitaires non colinéaires tombe à l'intérieur de la
 * sphère.
 *
 * Un gabarit non normalisé rapproche donc TOUTES les distances
 * mesurées contre lui, celles d'un imposteur comprises. C'est une des
 * causes du visage étranger accepté lors de l'essai.
 */
function normaliser(d) {
  let somme = 0;
  for (const v of d) somme += v * v;

  const norme = Math.sqrt(somme);
  if (!Number.isFinite(norme) || norme === 0) return d;

  return d.map((v) => v / norme);
}

/**
 * Distance euclidienne entre deux descripteurs.
 *
 * Le calcul est refait côté serveur plutôt que de faire confiance au
 * verdict du navigateur : un client modifié renverrait « c'est bien
 * moi » sans avoir rien calculé.
 */
function distance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  if (a.length !== b.length) return Infinity;

  let somme = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    somme += d * d;
  }
  return Math.sqrt(somme);
}

/** Médiane d'une liste de nombres finis. */
function mediane(valeurs) {
  const t = valeurs.filter(Number.isFinite).sort((x, y) => x - y);
  if (t.length === 0) return Infinity;

  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

// Nombre maximal d'apparences enregistrées pour un même salarié.
//
// ── Pourquoi plusieurs ──────────────────────────────────────────────
//
// Une campagne de mesures l'a établi : le titulaire mesuré sans
// lunettes tombe à 0,156 de son gabarit, et le même titulaire avec
// lunettes remonte à 0,268 puis 0,391 — alors que des tiers se
// situent entre 0,359 et 0,387. Le port de lunettes déplace le point
// d'environ 0,2, soit PLUS que l'écart entre deux personnes
// différentes. La région des yeux pèse lourd dans le descripteur.
//
// Un gabarit unique force donc un choix impossible : soit on exclut
// le titulaire dès qu'il change d'apparence, soit on relâche le seuil
// jusqu'à accepter des tiers. La réponse est d'enregistrer une
// apparence par condition — avec lunettes, sans — et de reconnaître
// si l'une d'elles correspond.
//
// Le nombre est borné : chaque apparence supplémentaire offre une
// chance de plus à un imposteur, donc augmente le taux de faux
// acceptés. Trois couvre les cas réels (lunettes, barbe, coiffure)
// sans transformer le gabarit en passe-partout.
const MAX_GABARITS = 3;

/**
 * Liste des apparences enregistrées, normalisées.
 *
 * Accepte l'ancien format à gabarit unique : les enrôlements faits
 * avant cette évolution restent valables, sans migration.
 */
function gabaritsDe(item) {
  if (Array.isArray(item?.gabarits) && item.gabarits.length > 0) {
    return item.gabarits
      .filter((g) => Array.isArray(g?.valeurs))
      .map((g) => ({
        valeurs: normaliser(g.valeurs),
        libelle: typeof g.libelle === "string" ? g.libelle : "",
      }));
  }

  if (Array.isArray(item?.descripteur)) {
    return [{ valeurs: normaliser(item.descripteur), libelle: "" }];
  }

  return [];
}

/** Un descripteur valide : 128 nombres finis, bornés */
function descripteurValide(d) {
  return Array.isArray(d)
    && d.length === TAILLE_DESCRIPTEUR
    && d.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 10);
}

/**
 * Gabarit : moyenne de plusieurs descripteurs, ramenée à une longueur
 * de 1.
 *
 * La moyenne rend le gabarit plus stable qu'une prise unique. La
 * normalisation qui suit n'est pas un détail : sans elle, le gabarit
 * est plus court que les mesures auxquelles on le compare, et toutes
 * les distances s'en trouvent réduites.
 */
function moyenne(descripteurs) {
  const n = descripteurs.length;
  const somme = new Array(TAILLE_DESCRIPTEUR).fill(0);

  for (const d of descripteurs) {
    for (let i = 0; i < TAILLE_DESCRIPTEUR; i += 1) somme[i] += d[i];
  }

  return normaliser(somme.map((v) => v / n));
}

/**
 * Cohérence d'un enrôlement : les prises doivent se ressembler.
 *
 * Trois photos de trois personnes différentes produiraient un gabarit
 * moyen qui ne correspond à personne. Ce contrôle l'empêche.
 */
function prisesCoherentes(descripteurs) {
  for (let i = 0; i < descripteurs.length; i += 1) {
    for (let j = i + 1; j < descripteurs.length; j += 1) {
      if (distance(descripteurs[i], descripteurs[j]) > SEUIL_COHERENCE) {
        return false;
      }
    }
  }
  return true;
}

// ── Enrôlement ──────────────────────────────────────────────────────

/**
 * POST /biometrie/enroler
 *
 * Corps attendu :
 *   descripteurs : trois descripteurs de 128 flottants
 *   consentement : { accepte: true, versionNotice: "..." }
 */
exports.enroler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const body = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    // complement : ajoute une apparence au gabarit existant au lieu
    // de le remplacer. C'est ce qui permet d'enregistrer « avec
    // lunettes » sans perdre « sans lunettes ».
    const { descripteurs, consentement, complement, libelle } = body;

    // Le consentement précède tout : sans lui, il n'y a pas de base
    // légale au traitement, et donc rien à enregistrer.
    if (!consentement?.accepte) {
      return erreur(
        "Le traitement de données biométriques exige un consentement explicite",
        400
      );
    }

    if (consentement.versionNotice !== VERSION_NOTICE) {
      return erreur(
        "La notice d'information a changé. Relisez-la avant de consentir.",
        409
      );
    }

    if (!Array.isArray(descripteurs) || descripteurs.length < 3) {
      return erreur("Trois prises de vue sont nécessaires", 400);
    }

    if (!descripteurs.every(descripteurValide)) {
      return erreur("Descripteur biométrique invalide", 400);
    }

    // Normalisés avant tout contrôle : un client qui enverrait des
    // vecteurs de longueur arbitraire faussait sinon le contrôle de
    // cohérence autant que le gabarit.
    const normalises = descripteurs.map(normaliser);

    if (!prisesCoherentes(normalises)) {
      return erreur(
        "Les prises de vue ne correspondent pas entre elles. Recommencez en gardant le visage dans le cadre.",
        400
      );
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const maintenant = new Date().toISOString();

    const nouvelle = {
      // Le gabarit, jamais l'image. Un descripteur n'est pas
      // réversible en photographie par les moyens courants.
      valeurs: moyenne(normalises),
      libelle: typeof libelle === "string" ? libelle.slice(0, 40) : "",
      nbPrises: normalises.length,
      ajouteLe: maintenant,
    };

    // ── Ajout d'une apparence ──
    const existant = complement
      ? (await docClient.send(new GetCommand({
          TableName: TABLE_BIOMETRIE,
          Key: { employeId: fiche.id },
        })).catch(() => ({ Item: null }))).Item
      : null;

    if (complement && (!existant || existant.statut !== "ACTIF")) {
      return erreur(
        "Aucun gabarit à compléter. Faites d'abord un enrôlement complet.",
        409
      );
    }

    if (existant) {
      const deja = gabaritsDe(existant);

      if (deja.length >= MAX_GABARITS) {
        return erreur(
          `Vous avez déjà ${MAX_GABARITS} apparences enregistrées, le maximum. `
          + "Supprimez votre gabarit et refaites l'enrôlement pour repartir.",
          409
        );
      }

      // Une apparence trop proche d'une autre n'apporte rien et
      // dégrade le taux de faux acceptés pour rien.
      const redondante = deja.some(
        (g) => distance(g.valeurs, nouvelle.valeurs) < SEUIL_DISTANCE
      );

      if (redondante) {
        return erreur(
          "Cette apparence ressemble trop à une apparence déjà enregistrée. "
          + "Elle est déjà reconnue, inutile de l'ajouter.",
          409
        );
      }

      const gabarits = [...(existant.gabarits ?? []), nouvelle];

      await docClient.send(new UpdateCommand({
        TableName: TABLE_BIOMETRIE,
        Key: { employeId: fiche.id },
        // Le descripteur du format ancien est retiré au premier ajout :
        // le laisser ferait exister deux sources de vérité.
        UpdateExpression:
          "SET gabarits = :g, derniereModification = :d REMOVE descripteur",
        ExpressionAttributeValues: { ":g": gabarits, ":d": maintenant },
      }));

      return succes({
        enrole: true,
        nbApparences: gabarits.length,
        message: `Apparence ajoutée. ${gabarits.length} apparences enregistrées.`,
      }, 201);
    }

    // ── Premier enrôlement ──
    await docClient.send(new PutCommand({
      TableName: TABLE_BIOMETRIE,
      Item: {
        employeId: fiche.id,
        gabarits: [nouvelle],

        // La trace du consentement fait partie du dossier : sans elle,
        // on ne peut pas démontrer la base légale du traitement.
        consentementLe: maintenant,
        consentementVersion: VERSION_NOTICE,

        enroleLe: maintenant,
        derniereVerification: null,
        nbVerifications: 0,
        statut: "ACTIF",
      },
    }));

    return succes({
      enrole: true,
      nbApparences: 1,
      enroleLe: maintenant,
      message:
        "Reconnaissance faciale activée. Vous pouvez la désactiver à tout moment "
        + "depuis votre profil, sans justification.",
    }, 201);

  } catch (e) {
    console.error("Erreur enrôlement biométrique:", e);
    return erreur("Impossible d'enregistrer l'enrôlement");
  }
};

// ── Vérification ────────────────────────────────────────────────────

/**
 * Vérifie un descripteur contre le gabarit enregistré.
 *
 * Appelée par le pointage, pas exposée directement : une route de
 * vérification isolée permettrait de tester des descripteurs jusqu'à
 * trouver celui qui passe.
 *
 * Ne lève jamais : renvoie un verdict que l'appelant interprète.
 */
async function verifier(employeId, descripteur) {
  // Accepte une prise unique ou un lot. Un lot vaut mieux : une prise
  // malheureuse — bougé, clignement en cours, ombre portée — s'écarte
  // du gabarit dans une direction arbitraire, ce qui provoque des
  // refus injustifiés, mais aussi, plus rarement, un rapprochement
  // fortuit vers le gabarit de quelqu'un d'autre.
  const lot = Array.isArray(descripteur) && Array.isArray(descripteur[0])
    ? descripteur
    : [descripteur];

  if (lot.length === 0 || !lot.every(descripteurValide)) {
    return { reconnu: false, motif: "Descripteur invalide", distance: null };
  }

  const mesures = lot.map(normaliser);

  const res = await docClient.send(new GetCommand({
    TableName: TABLE_BIOMETRIE,
    Key: { employeId },
  })).catch(() => ({ Item: null }));

  const item = res.Item;

  if (!item || item.statut !== "ACTIF") {
    return {
      reconnu: false,
      motif: "Aucun gabarit enregistré pour ce compte",
      distance: null,
    };
  }

  const gabarits = gabaritsDe(item);

  if (gabarits.length === 0) {
    return {
      reconnu: false,
      motif: "Gabarit illisible",
      distance: null,
    };
  }

  // Le calcul est refait ici : le verdict du navigateur ne fait pas
  // foi. Les gabarits sont renormalisés à la lecture, pour que ceux
  // enregistrés avant la correction soient comparés sur la même
  // échelle que les nouveaux.
  //
  // Pour chaque apparence enregistrée, la MÉDIANE des mesures — et
  // non la meilleure : retenir la plus favorable des trois prises
  // donnerait trois chances à un imposteur.
  //
  // Entre les apparences, en revanche, le MINIMUM : chacune est une
  // façon légitime dont le titulaire se présente, et il suffit que
  // l'une corresponde. C'est la contrepartie assumée du multi-
  // apparence — chaque apparence ajoutée augmente un peu le taux de
  // faux acceptés, d'où le plafond de MAX_GABARITS.
  const parGabarit = gabarits.map((g) => ({
    libelle: g.libelle,
    distances: mesures.map((m) => distance(m, g.valeurs)),
  }));

  let retenu = parGabarit[0];
  let d = mediane(retenu.distances);

  for (const candidat of parGabarit.slice(1)) {
    const med = mediane(candidat.distances);
    if (med < d) { d = med; retenu = candidat; }
  }

  const distances = retenu.distances;

  if (d > SEUIL_DISTANCE) {
    return {
      reconnu: false,
      motif: "Le visage ne correspond pas au gabarit enregistré",
      distance: Number(d.toFixed(4)),
      // Les distances individuelles aident à comprendre un refus :
      // trois valeurs proches signent un visage différent, trois
      // valeurs dispersées un problème de prise de vue.
      distances: distances.map((x) => Number(x.toFixed(4))),
      // Toutes les apparences essayées, pour qu'un refus dû à un
      // changement d'apparence se distingue d'un refus d'identité.
      parApparence: parGabarit.map((g) => ({
        libelle: g.libelle,
        distance: Number(mediane(g.distances).toFixed(4)),
      })),
    };
  }

  // Le compteur d'usage n'est PAS incrémenté ici : voir consigner().
  //
  // Il l'était, et cette fonction avait deux défauts qui venaient du
  // même endroit. mesurer(), le panneau de développement qui annonce
  // « sans enregistrer de pointage », appelle verifier() : chaque
  // mesure gonflait donc le compteur du salarié en contredisant le
  // texte affiché. Et une reconnaissance suivie d'un pointage refusé —
  // arrivée déjà pointée, position hors zone — comptait quand même.
  //
  // verifier() répond à une question ; elle ne doit pas écrire
  // d'histoire. Seul l'appelant sait si le pointage a réellement été
  // enregistré, donc c'est à lui de le consigner.

  return {
    reconnu: true,
    // Une correspondance de justesse mérite un œil : elle est valide,
    // mais proche du seuil.
    aVerifier: d > SEUIL_DOUTE,
    distance: Number(d.toFixed(4)),
    distances: distances.map((x) => Number(x.toFixed(4))),
    nbMesures: mesures.length,
    // L'apparence qui a correspondu : utile pour voir qu'un salarié
    // passe toujours par celle « avec lunettes », donc que son
    // gabarit principal mériterait d'être refait.
    apparence: retenu.libelle || null,
    motif: d > SEUIL_DOUTE
      ? `Correspondance faible (distance ${d.toFixed(3)})`
      : null,
  };
}

// ── État et révocation ──────────────────────────────────────────────

/** GET /biometrie/etat */
exports.etat = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_BIOMETRIE,
      Key: { employeId: fiche.id },
    })).catch(() => ({ Item: null }));

    const gabarit = res.Item;

    // Le descripteur lui-même n'est jamais renvoyé : le salarié n'en a
    // aucun usage, et le transmettre l'exposerait inutilement.
    return succes({
      enrole: Boolean(gabarit && gabarit.statut === "ACTIF"),
      enroleLe: gabarit?.enroleLe ?? null,
      consentementLe: gabarit?.consentementLe ?? null,
      consentementVersion: gabarit?.consentementVersion ?? null,
      nbVerifications: gabarit?.nbVerifications ?? 0,
      derniereVerification: gabarit?.derniereVerification ?? null,

      // Les apparences enregistrées, par leur libellé seulement : le
      // salarié a besoin de savoir lesquelles existent pour en
      // ajouter une, jamais de leurs valeurs.
      apparences: gabaritsDe(gabarit).map((g) => g.libelle || 'sans précision'),
      maxApparences: MAX_GABARITS,

      // Un changement de notice se signale : le consentement porte sur
      // une version précise de l'information donnée.
      noticeAJour: gabarit?.consentementVersion === VERSION_NOTICE,
      versionNoticeCourante: VERSION_NOTICE,
    });

  } catch (e) {
    console.error("Erreur état biométrique:", e);
    return erreur("Impossible de lire l'état d'enrôlement");
  }
};

/**
 * DELETE /biometrie
 *
 * Révocation par le salarié. Aucune justification demandée, aucune
 * confirmation de la RH : un consentement qu'on ne peut pas retirer
 * librement n'est pas un consentement.
 */
exports.revoquer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    // Suppression, pas désactivation : un gabarit conservé « au cas
    // où » serait un traitement sans base légale.
    await docClient.send(new DeleteCommand({
      TableName: TABLE_BIOMETRIE,
      Key: { employeId: fiche.id },
    }));

    return succes({
      enrole: false,
      message:
        "Votre gabarit facial a été supprimé. Vous pointerez désormais "
        + "par QR et géolocalisation.",
    });

  } catch (e) {
    console.error("Erreur révocation biométrique:", e);
    return erreur("Impossible de supprimer le gabarit");
  }
};

/**
 * Purge à la sortie des effectifs.
 *
 * Appelée lors du passage d'un salarié au statut inactif. Conserver un
 * gabarit biométrique après la fin du contrat n'a aucune base.
 */
async function purger(employeId) {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_BIOMETRIE,
    Key: { employeId },
  })).catch(() => { /* absence de gabarit : rien à purger */ });
}

/**
 * POST /biometrie/mesurer — DÉVELOPPEMENT UNIQUEMENT
 *
 * Renvoie la distance mesurée sans enregistrer de pointage.
 *
 * ── Pourquoi elle existe ────────────────────────────────────────────
 *
 * Le pointage est limité à une arrivée par jour, ce qui rend
 * impossible la récolte de mesures nécessaire pour choisir le seuil
 * sur des données plutôt qu'au jugé. Cette route permet de mesurer
 * autant de fois que voulu, titulaire et tiers, et de fixer le seuil
 * dans l'écart constaté.
 *
 * ── Pourquoi elle ne doit jamais être déployée ──────────────────────
 *
 * Une route qui renvoie une distance transforme la base en oracle :
 * on peut soumettre des descripteurs par essais successifs et
 * s'approcher du gabarit sans jamais avoir vu le visage. C'est
 * exactement l'attaque que l'absence de route de vérification
 * publique empêche.
 *
 * D'où le verrou sur l'environnement, en premier et sans condition.
 * Un 404 plutôt qu'un 403 : en production, cette route ne doit pas
 * même révéler qu'elle a existé.
 */
exports.mesurer = async (event) => {
  if (process.env.NODE_ENV === "production") {
    return erreur("Route inconnue", 404);
  }

  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const body = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const verdict = await verifier(fiche.id, body.descripteurs ?? body.descripteur);

    return succes({
      ...verdict,
      seuilDistance: SEUIL_DISTANCE,
      seuilDoute: SEUIL_DOUTE,
      // Étiquette libre, pour distinguer les séries dans le relevé :
      // « titulaire », « tiers », « lunettes », « contre-jour ».
      etiquette: typeof body.etiquette === "string"
        ? body.etiquette.slice(0, 40) : null,
      mesureLe: new Date().toISOString(),
    });

  } catch (e) {
    console.error("Erreur mesure biométrique:", e);
    return erreur("Impossible de mesurer");
  }
};

/**
 * GET /biometrie/statistiques — réservé à la RH
 *
 * Donne le taux d'adoption sans jamais exposer qui est enrôlé : savoir
 * que trente salariés sur cinquante ont accepté suffit au pilotage,
 * nommer les vingt qui ont refusé exposerait leur choix.
 */
exports.statistiques = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) {
      return erreur("Réservé aux ressources humaines", 403);
    }

    const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_BIOMETRIE,
      // Projection volontairement minimale : la RH n'a pas besoin de
      // savoir qui est enrôlé, seulement combien.
      ProjectionExpression: "statut, enroleLe",
    })).catch(() => ({ Items: [] }));

    const gabarits = res.Items || [];

    return succes({
      nbEnroles: gabarits.filter((g) => g.statut === "ACTIF").length,
      versionNotice: VERSION_NOTICE,
      seuilDistance: SEUIL_DISTANCE,
    });

  } catch (e) {
    console.error("Erreur statistiques biométriques:", e);
    return erreur("Impossible de lire les statistiques");
  }
};

/**
 * Consigne un usage réel du gabarit : un pointage effectivement
 * enregistré par reconnaissance faciale.
 *
 * À appeler APRÈS l'écriture du pointage, jamais avant. Un compteur
 * incrémenté sur l'intention plutôt que sur le fait finit par
 * contredire la table des pointages, et c'est la page du salarié qui
 * porte la contradiction.
 *
 * Ne lève jamais : un compteur d'usage ne doit pas faire échouer un
 * pointage déjà écrit. L'échec est silencieux par choix — le pointage,
 * lui, est en base.
 */
async function consigner(employeId) {
  if (!employeId) return;

  await docClient.send(new UpdateCommand({
    TableName: TABLE_BIOMETRIE,
    Key: { employeId },
    UpdateExpression:
      "SET derniereVerification = :d, nbVerifications = if_not_exists(nbVerifications, :zero) + :un",
    // Le gabarit doit encore exister : sans cette condition, un
    // salarié qui se désinscrit entre la vérification et l'écriture
    // verrait DynamoDB recréer sa ligne — un enregistrement
    // biométrique ressuscité par un compteur.
    ConditionExpression: "attribute_exists(employeId)",
    ExpressionAttributeValues: {
      ":d": new Date().toISOString(),
      ":zero": 0,
      ":un": 1,
    },
  })).catch(() => { /* le compteur n'est pas critique */ });
}

module.exports.verifier = verifier;
module.exports.consigner = consigner;
module.exports.purger = purger;
module.exports.distance = distance;
module.exports.normaliser = normaliser;
module.exports.mediane = mediane;
module.exports.descripteurValide = descripteurValide;
module.exports.VERSION_NOTICE = VERSION_NOTICE;
module.exports.SEUIL_DISTANCE = SEUIL_DISTANCE;
module.exports.SEUIL_DOUTE = SEUIL_DOUTE;
module.exports.SEUIL_COHERENCE = SEUIL_COHERENCE;
module.exports.MAX_GABARITS = MAX_GABARITS;