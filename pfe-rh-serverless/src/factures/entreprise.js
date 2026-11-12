// src/factures/entreprise.js
//
// L'identité de l'employeur : ce qui s'imprime en tête des bulletins de
// paie et des attestations.
//
// ── Pourquoi ce module change ──────────────────────────────────────
//
// Il lisait des variables d'environnement. Deux problèmes.
//
// 1. La RH ne peut pas corriger une adresse sans redéployer. Or c'est
//    exactement le genre de ligne qui change : un déménagement, un
//    changement de gérant, un capital augmenté.
//
// 2. `attestation-pdf.js` lit `ent.mf`, `ent.ville` et `ent.telephone`.
//    L'ancien module exportait `matriculeFiscal`, et ni ville ni
//    téléphone. Conséquence : l'en-tête des attestations imprimait
//    « — » à la place du matricule fiscal, même avec ENTREPRISE_MF
//    renseigné. Le bulletin de paie, lui, marchait : `bulletin-pdf.js`
//    lit bien `matriculeFiscal`. Deux générateurs, deux noms pour le
//    même champ.
//
// Le module expose donc les DEUX noms, avec la même valeur. Aucun des
// deux générateurs de PDF n'a besoin d'être touché.
//
// ── Compatibilité ──────────────────────────────────────────────────
//
// `require("./entreprise")` renvoie toujours un objet dont `.nom`,
// `.adresse`, `.matriculeFiscal` et `.cnss` sont lisibles tout de
// suite, alimentés par les variables d'environnement. Le code existant
// continue de marcher sans modification.
//
// Pour obtenir les valeurs saisies par la RH, il faut attendre la base :
//
//     const entreprise = require("./entreprise");
//     const ent = await entreprise.charger();
//
// ── Une seule entreprise, mais la porte reste ouverte ──────────────
//
// L'enregistrement porte un `id`. Aujourd'hui il n'y en a qu'un, et
// tous les salariés en dépendent implicitement. Le jour où
// l'application sert plusieurs sociétés, c'est un `entrepriseId` sur la
// fiche employé et un filtre sur les requêtes — pas une réécriture.

const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, corpsDe, estRh } = require("../utils/identite");

const TABLE_ENTREPRISE = process.env.TABLE_ENTREPRISE || "Entreprise-local";

// L'identifiant de l'enregistrement unique. Une constante et non un
// UUID : on doit pouvoir le relire sans l'avoir noté quelque part.
const ID = "ENTREPRISE";

// Le cache évite une lecture DynamoDB par PDF généré. Soixante
// secondes : assez pour une édition de bulletins en lot, assez court
// pour qu'une correction de la RH se voie sans redémarrer.
const DUREE_CACHE = 60 * 1000;

let cache = null;
let cacheExpire = 0;

// ── Les champs ─────────────────────────────────────────────────────
//
// `obligatoire` vaut pour l'enregistrement, pas pour le démarrage :
// l'application se lance sans, et c'est la page de réglages qui exige.

const CHAMPS = {
  nom:            { libelle: "Raison sociale",        max: 120, obligatoire: true },
  formeJuridique: { libelle: "Forme juridique",       max: 120 },
  capital:        { libelle: "Capital social",        max: 60 },
  adresse:        { libelle: "Adresse",               max: 160, obligatoire: true },
  codePostal:     { libelle: "Code postal",           max: 10 },
  ville:          { libelle: "Ville",                 max: 60,  obligatoire: true },
  telephone:      { libelle: "Téléphone",             max: 40 },
  email:          { libelle: "Courriel",              max: 120 },
  mf:             { libelle: "Matricule fiscal",      max: 40,  obligatoire: true },
  rne:            { libelle: "Identifiant RNE",       max: 40 },
  cnss:           { libelle: "Affiliation CNSS",      max: 40,  obligatoire: true },
  gerant:         { libelle: "Gérant",                max: 120 },
  signataire:     { libelle: "Signataire des attestations", max: 120 },
};

const OBLIGATOIRES = Object.entries(CHAMPS)
  .filter(([, d]) => d.obligatoire)
  .map(([nom]) => nom);

// ── Les formats tunisiens ──────────────────────────────────────────
//
// Ces contrôles AVERTISSENT, ils ne refusent pas. Une règle plus
// stricte que l'administration ferait refuser un matricule valide que
// l'application serait seule à juger mal formé, et la RH n'aurait aucun
// moyen de passer outre. Mieux vaut une remarque qu'un mur.

const FORMATS = {
  mf: {
    motif: /^\d{7}\/[A-Z]\/[A-Z]\/\d{3}$/,
    attendu: "sept chiffres puis trois groupes, par exemple 1234567/A/M/000",
  },
  cnss: {
    motif: /^\d{8}-\d{2}$/,
    attendu: "huit chiffres, un tiret, deux chiffres, par exemple 12345678-19",
  },
  email: {
    motif: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    attendu: "une adresse de la forme contact@exemple.tn",
  },
  telephone: {
    motif: /^\+?[\d\s().-]{8,}$/,
    attendu: "un numéro, par exemple +216 71 000 000",
  },
};

// ── Les domaines de messagerie ─────────────────────────────────────
//
// C'est le lien entre l'entreprise et ses salariés. Un employé dont
// l'email professionnel finit par un domaine déclaré appartient à
// l'entreprise. Avec une seule société cela sert surtout à valider
// l'email à la création — et à attraper les fautes de frappe, qui sont
// la première cause de salarié qui ne reçoit jamais ses notifications.

function normaliserDomaine(valeur) {
  return String(valeur ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function domainesDe(valeur) {
  const brut = Array.isArray(valeur)
    ? valeur
    : String(valeur ?? "").split(/[\s,;]+/);

  const vus = new Set();
  for (const d of brut.map(normaliserDomaine)) {
    // Un domaine sans point n'est pas un domaine : « terra » laisserait
    // passer n'importe quel email interne mal saisi.
    if (d && d.includes(".") && !/\s/.test(d)) vus.add(d);
  }
  return [...vus].slice(0, 10);
}

/**
 * L'email appartient-il à l'entreprise ?
 * Sans domaine déclaré, on ne refuse rien : l'absence de réglage ne
 * doit pas empêcher de créer un salarié.
 */
function emailAppartient(email, domaines) {
  const liste = domainesDe(domaines);
  if (liste.length === 0) return true;

  const apres = String(email ?? "").trim().toLowerCase().split("@")[1];
  if (!apres) return false;

  return liste.some((d) => apres === d || apres.endsWith(`.${d}`));
}

// ── Le cachet ──────────────────────────────────────────────────────
//
// L'image se range dans l'enregistrement lui-même, en base64, et non
// sur S3. Un cachet pèse quelques dizaines de kilo-octets, la page le
// réduit à 600 px avant de l'envoyer, et une ligne DynamoDB en accepte
// 400 Ko. Ça évite un seau, une route de lecture binaire et une
// dépendance de plus pour une seule image qui ne change jamais.
//
// La limite est volontairement basse : au-delà, c'est une photo qu'on
// essaie de déposer, pas un cachet.

const CACHET_OCTETS_MAX = 200 * 1024;
const CACHET_TYPES = ["image/png", "image/jpeg"];

/**
 * @returns {{valeurs: object} | {erreur: object}}
 */
function cachetDe(brut = {}) {
  // `null` explicite : la RH retire son cachet.
  if (brut.cachet === null) {
    return { valeurs: { cachet: null, cachetTypeMime: null, cachetDeposeLe: null } };
  }
  if (!brut.cachet) return { valeurs: {} };

  const typeMime = String(brut.cachetTypeMime ?? "").toLowerCase();
  if (!CACHET_TYPES.includes(typeMime)) {
    return { erreur: erreur("Le cachet doit être une image PNG ou JPEG.", 400) };
  }

  // Le préfixe `data:` si la page a envoyé l'URL complète.
  const base64 = String(brut.cachet).replace(/^data:[^,]+,/, "");
  const octets = Math.floor((base64.length * 3) / 4);

  if (octets > CACHET_OCTETS_MAX) {
    return {
      erreur: erreur(
        `Le cachet pèse ${Math.round(octets / 1024)} Ko. La limite est de `
        + `${CACHET_OCTETS_MAX / 1024} Ko : réduisez l'image avant de la déposer.`,
        400
      ),
    };
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { erreur: erreur("Le cachet n'est pas une image lisible.", 400) };
  }

  return {
    valeurs: {
      cachet: base64,
      cachetTypeMime: typeMime,
      cachetDeposeLe: new Date().toISOString(),
    },
  };
}

// ── Mise en forme ──────────────────────────────────────────────────

function texte(valeur, max) {
  return String(valeur ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normaliser(brut = {}) {
  const net = {};
  for (const [nom, def] of Object.entries(CHAMPS)) {
    net[nom] = texte(brut[nom], def.max);
  }
  net.domaines = domainesDe(brut.domaines);
  return net;
}

function champsManquants(e = {}) {
  return OBLIGATOIRES
    .filter((nom) => !String(e[nom] ?? "").trim())
    .map((nom) => ({ champ: nom, libelle: CHAMPS[nom].libelle }));
}

function remarques(e = {}) {
  const liste = [];
  for (const [nom, f] of Object.entries(FORMATS)) {
    const valeur = String(e[nom] ?? "").trim();
    if (valeur && !f.motif.test(valeur)) {
      liste.push({
        champ: nom,
        message: `${CHAMPS[nom].libelle} : format inhabituel. On attend ${f.attendu}.`,
      });
    }
  }
  return liste;
}

/**
 * L'objet tel que les générateurs de PDF le consomment.
 *
 * `mf` et `matriculeFiscal` portent la même valeur : le premier pour
 * `attestation-pdf.js`, le second pour `bulletin-pdf.js`. C'est de la
 * redondance assumée, et elle évite de toucher deux fichiers qui
 * marchent.
 *
 * `ville` contient la ligne postale complète — « 1053 Tunis » — parce
 * que c'est ce que l'en-tête imprime à la suite de l'adresse. Le nom
 * seul reste disponible dans `villeNom`.
 */
function pourPdf(e = {}) {
  const ligneVille = [e.codePostal, e.ville].filter(Boolean).join(" ");

  return {
    ...e,
    ville: ligneVille,
    villeNom: e.ville || "",
    matriculeFiscal: e.mf || "",
    mf: e.mf || "",
  };
}

// ── Le repli : les variables d'environnement ───────────────────────
//
// Elles restent lues, pour deux raisons. Un déploiement déjà configuré
// ne doit pas perdre son en-tête le jour du changement de module. Et en
// développement, personne n'a envie de remplir un formulaire avant de
// pouvoir générer un bulletin.

const DEPUIS_ENV = normaliser({
  nom: process.env.ENTREPRISE_NOM || "Octopus Plus",
  formeJuridique: process.env.ENTREPRISE_FORME,
  capital: process.env.ENTREPRISE_CAPITAL,
  adresse: process.env.ENTREPRISE_ADRESSE,
  codePostal: process.env.ENTREPRISE_CODE_POSTAL,
  ville: process.env.ENTREPRISE_VILLE,
  telephone: process.env.ENTREPRISE_TELEPHONE,
  email: process.env.ENTREPRISE_EMAIL,
  mf: process.env.ENTREPRISE_MF,
  rne: process.env.ENTREPRISE_RNE,
  cnss: process.env.ENTREPRISE_CNSS,
  gerant: process.env.ENTREPRISE_GERANT,
  signataire: process.env.ENTREPRISE_SIGNATAIRE,
  domaines: process.env.ENTREPRISE_DOMAINES,
});

// ── Lecture ────────────────────────────────────────────────────────

/**
 * L'identité à imprimer. La base si elle a été renseignée, les
 * variables d'environnement sinon.
 *
 * Ne lève jamais : un bulletin de paie ne doit pas échouer parce que
 * DynamoDB répond mal. Dans ce cas on imprime ce qu'on a.
 */
async function charger({ force = false } = {}) {
  if (!force && cache && Date.now() < cacheExpire) return cache;

  let enregistre = null;
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_ENTREPRISE, Key: { id: ID },
    }));
    enregistre = Item || null;
  } catch (e) {
    console.error(
      `[entreprise] Lecture impossible (${e.name}) : on imprime les `
      + `valeurs d'environnement.`
    );
  }

  // Champ par champ et non l'un OU l'autre : une entreprise enregistrée
  // sans téléphone doit pouvoir garder celui de l'environnement.
  const fusion = { ...DEPUIS_ENV };
  if (enregistre) {
    for (const nom of Object.keys(CHAMPS)) {
      if (String(enregistre[nom] ?? "").trim()) fusion[nom] = enregistre[nom];
    }
    if (enregistre.domaines?.length) fusion.domaines = enregistre.domaines;
  }

  cache = pourPdf({
    ...fusion,
    id: ID,
    enregistre: !!enregistre,
    modifieLe: enregistre?.modifieLe ?? null,
    modifiePar: enregistre?.modifiePar ?? null,
    // Le cachet ne passe pas par la boucle ci-dessus : ce n'est pas un
    // champ texte, et il n'a pas de repli par variable d'environnement.
    cachet: enregistre?.cachet ?? null,
    cachetTypeMime: enregistre?.cachetTypeMime ?? null,
    cachetDeposeLe: enregistre?.cachetDeposeLe ?? null,
  });
  cacheExpire = Date.now() + DUREE_CACHE;
  return cache;
}

function oublierCache() {
  cache = null;
  cacheExpire = 0;
}

// ── GET /entreprise ────────────────────────────────────────────────
//
// Lisible par tout utilisateur authentifié : la raison sociale et
// l'adresse figurent sur chaque document que le salarié reçoit déjà.
// L'écriture, elle, est réservée à la RH.

async function handlerLire(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const e = await charger({ force: true });
  const rh = estRh(moi);

  // Le cachet ne part en entier que vers la RH, qui doit le revoir pour
  // le remplacer. Un salarié n'a aucune raison de recevoir l'image du
  // cachet de sa société à chaque chargement de page : c'est deux cents
  // kilo-octets et une pièce qu'on imite facilement.
  const { cachet, ...sansCachet } = e;

  return succes({
    entreprise: rh ? e : { ...sansCachet, cachet: null },
    aUnCachet: !!cachet,
    champs: CHAMPS,
    manquants: champsManquants(e),
    remarques: remarques(e),
    modifiable: rh,
  });
}

// ── PUT /entreprise ────────────────────────────────────────────────

async function handlerEnregistrer(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const net = normaliser(corpsDe(event));
  const manquants = champsManquants(net);

  if (manquants.length > 0) {
    // Enregistrer une identité incomplète produirait des attestations
    // avec des « — » à la place des mentions obligatoires, et personne
    // ne s'en apercevrait avant qu'un salarié se fasse refuser au
    // guichet.
    return erreur(
      `Ces mentions sont obligatoires sur les attestations et les `
      + `bulletins : ${manquants.map((m) => m.libelle).join(", ")}.`,
      400
    );
  }

  const image = cachetDe(corpsDe(event));
  if (image.erreur) return image.erreur;

  // `PutCommand` REMPLACE la ligne entière. Sans cette relecture, le
  // premier enregistrement qui suit un dépôt de cachet l'effacerait
  // sans que personne ne s'en aperçoive avant la prochaine attestation.
  let actuel = null;
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_ENTREPRISE, Key: { id: ID },
    }));
    actuel = Item || null;
  } catch {
    actuel = null;
  }

  const enregistrement = {
    ...net,
    id: ID,
    // L'ancien cachet, sauf si la requête en apporte un nouveau ou
    // demande son retrait.
    cachet: actuel?.cachet ?? null,
    cachetTypeMime: actuel?.cachetTypeMime ?? null,
    cachetDeposeLe: actuel?.cachetDeposeLe ?? null,
    ...image.valeurs,
    modifieLe: new Date().toISOString(),
    modifiePar: moi.email ?? "RH",
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_ENTREPRISE, Item: enregistrement,
  }));

  oublierCache();
  const e = await charger({ force: true });

  return succes({
    message: image.valeurs.cachet
      ? "Identité enregistrée. Le cachet s'imprimera sur les prochaines attestations."
      : "Identité de l'entreprise enregistrée.",
    entreprise: e,
    aUnCachet: !!e.cachet,
    remarques: remarques(e),
  });
}

// ── Pannes prévisibles ─────────────────────────────────────────────

function protege(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        console.error(`[entreprise] Table ${TABLE_ENTREPRISE} absente.`);
        return erreur(
          "La table de l'entreprise n'existe pas encore. Lancez "
          + "`node scripts/creer-table-entreprise.js`.",
          503
        );
      }
      if (e.name === "ValidationException") {
        return erreur("Donnée refusée par la base de données", 400);
      }
      throw e;
    }
  };
}

// ── L'avertissement au démarrage ───────────────────────────────────
//
// Conservé de l'ancien module, mais il ne parle plus que des variables
// d'environnement : si la RH a rempli la page de réglages, la base
// prend le dessus et l'avertissement n'a plus de sens. Il est donc
// formulé comme une invitation à remplir la page, pas comme une faute.

if (champsManquants(DEPUIS_ENV).length > 0) {
  console.warn(
    `[entreprise] Identité incomplète dans les variables `
    + `d'environnement : `
    + `${champsManquants(DEPUIS_ENV).map((m) => m.libelle).join(", ")}. `
    + `Si la RH a rempli la page Réglages › Entreprise, ceci est sans `
    + `conséquence. Sinon, les attestations porteront des « — ».`
  );
}

// ── Exports ────────────────────────────────────────────────────────
//
// L'objet garde en surface les champs de l'ancien module, pour que
// `require("./entreprise").nom` continue de répondre sans `await`.

module.exports = Object.assign(pourPdf({ ...DEPUIS_ENV, id: ID }), {
  charger,
  oublierCache,
  handlerLire: protege(handlerLire),
  handlerEnregistrer: protege(handlerEnregistrer),

  // Exportés pour les tests et pour la création d'un salarié
  emailAppartient,
  domainesDe,
  cachetDe,
  CACHET_OCTETS_MAX,
  normaliser,
  normaliserDomaine,
  champsManquants,
  remarques,
  pourPdf,
  CHAMPS,
  OBLIGATOIRES,
  TABLE_ENTREPRISE,
  ID,
});