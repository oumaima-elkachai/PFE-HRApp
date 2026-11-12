// src/situations/depot.js
//
// Couche d'accès aux données des demandes de changement de situation
// familiale, et règles métier pures associées.
//
// Volontairement autonome : elle crée son propre client DynamoDB et ne
// dépend d'aucun helper du projet. Un seul endroit — la constante
// TABLE_EMPLOYES ci-dessous — doit correspondre à ton nommage. Le reste
// des fichiers de ce module passe par ici, donc rien d'autre n'a à être
// vérifié.
//
// Pourquoi deux tables plutôt qu'une : Employes porte l'état VALIDÉ,
// celui que paie.js utilise pour calculer l'impôt. DemandesSituation
// porte ce que le salarié AFFIRME, avec son justificatif, en attente de
// contrôle. Le salarié n'écrit jamais dans la première. Sans ce verrou,
// n'importe qui se déclare chef de famille de quatre enfants handicapés
// et gagne 4 300 TND d'abattements sur un simple formulaire.

const {
  PutCommand, GetCommand, QueryCommand,
  ScanCommand, UpdateCommand, TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

// Le client du projet, et non un second ouvert ici : deux clients dans
// la meme fonction, ce sont deux pools de connexions et deux
// configurations a maintenir en accord.
const { docClient: db } = require("../utils/dynamodb");

// ⚠ À ALIGNER SUR TON NOMMAGE si tes tables ont un préfixe d'étape.
const TABLE_DEMANDES = process.env.TABLE_DEMANDES_SITUATION || "DemandesSituation";
const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes";

const INDEX_EMPLOYE = "employe-index";
const INDEX_STATUT = "statut-index";

// ── Champs pilotés par une demande ─────────────────────────────────
//
// Les noms correspondent exactement à ce que paie.js lit dans
// `situationFamiliale`. Toute divergence ici produirait un abattement
// silencieusement ignoré par le calcul.

const CHAMPS = {
  chefDeFamille:        { type: "booleen" },
  conjointACharge:      { type: "booleen" },
  handicapSalarie:      { type: "booleen" },
  nbEnfants:            { type: "entier", max: 20 },
  nbEnfantsHandicapes:  { type: "entier", max: 20 },
  nbEnfantsEtudiants:   { type: "entier", max: 20 },
};

const NOMS_CHAMPS = Object.keys(CHAMPS);

/**
 * Valide et normalise une situation déclarée.
 *
 * Les bornes hautes sont généreuses (20) et ne sont PAS les plafonds
 * fiscaux. Les plafonds d'abattement — quatre enfants, deux étudiants —
 * s'appliquent dans paie.js, au calcul. Un salarié peut réellement
 * avoir six enfants : sa fiche doit le dire, c'est l'abattement qui
 * s'arrête à quatre. Plafonner ici détruirait une donnée exacte pour
 * une raison fiscale, et le jour où la loi passe à cinq enfants les
 * données seraient déjà tronquées.
 */
function validerSituation(entree = {}) {
  const situation = {};
  const soucis = [];

  // Les champs réellement PRÉSENTS dans la saisie, valides ou non.
  // Sans cette distinction, une valeur invalide produisait deux
  // messages, dont « Aucun champ déclaré » alors qu'un champ l'avait
  // bien été : le salarié corrigeait la mauvaise chose.
  const presents = NOMS_CHAMPS.filter(
    (n) => entree[n] !== undefined && entree[n] !== null
  );

  for (const [nom, regle] of Object.entries(CHAMPS)) {
    const v = entree[nom];
    if (v === undefined || v === null) continue;

    if (regle.type === "booleen") {
      if (typeof v !== "boolean") {
        soucis.push(`${nom} doit être vrai ou faux`);
        continue;
      }
      situation[nom] = v;
    } else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > regle.max) {
        soucis.push(`${nom} doit être un entier entre 0 et ${regle.max}`);
        continue;
      }
      situation[nom] = n;
    }
  }

  if (presents.length === 0) {
    soucis.push("Aucun champ de situation familiale n'a été déclaré");
  }

  // Un enfant handicapé ou étudiant est d'abord un enfant à charge :
  // déclarer trois enfants handicapés et un seul enfant à charge est
  // incohérent, et donnerait un abattement supérieur au droit réel.
  const total = situation.nbEnfants;
  if (total !== undefined) {
    for (const sous of ["nbEnfantsHandicapes", "nbEnfantsEtudiants"]) {
      if (situation[sous] !== undefined && situation[sous] > total) {
        soucis.push(
          `${sous} (${situation[sous]}) ne peut pas dépasser le nombre d'enfants à charge (${total})`
        );
      }
    }
  }

  return { situation, soucis };
}

/** Écarts entre la situation validée actuelle et celle qui est déclarée */
function comparer(actuelle = {}, declaree = {}) {
  const changements = [];
  for (const nom of NOMS_CHAMPS) {
    if (declaree[nom] === undefined) continue;
    const avant = actuelle[nom] ?? (CHAMPS[nom].type === "booleen" ? false : 0);
    const apres = declaree[nom];
    if (avant !== apres) changements.push({ champ: nom, avant, apres });
  }
  return changements;
}

/**
 * La demande n'augmente-t-elle aucun droit ?
 *
 * Sert à dispenser de justificatif les seules déclarations qui
 * DIMINUENT le droit — un enfant qui atteint vingt ans, un conjoint qui
 * retrouve un revenu. Il n'y a aucun intérêt à frauder contre soi-même,
 * et exiger une pièce pour cela découragerait les mises à jour
 * honnêtes, qui sont précisément celles dont la paie a besoin.
 */
function seulementEnBaisse(changements) {
  if (changements.length === 0) return false;
  return changements.every(({ avant, apres }) => Number(apres) < Number(avant));
}

// ── Demandes ───────────────────────────────────────────────────────

async function creerDemande({ employeId, email, situation, changements, motif, justificatif }) {
  const demande = {
    id: randomUUID(),
    employeId,
    email,
    situation,
    changements,
    motif: motif || null,
    justificatifKey: justificatif?.cle || null,
    justificatifNom: justificatif?.nom || null,
    statut: "EN_ATTENTE",
    creeLe: new Date().toISOString(),
    traiteLe: null,
    traiteParId: null,
    commentaireRh: null,
  };

  await db.send(new PutCommand({ TableName: TABLE_DEMANDES, Item: demande }));
  return demande;
}

async function demandeParId(id) {
  const { Item } = await db.send(
    new GetCommand({ TableName: TABLE_DEMANDES, Key: { id } })
  );
  return Item || null;
}

async function demandesDeLEmploye(employeId) {
  const { Items } = await db.send(new QueryCommand({
    TableName: TABLE_DEMANDES,
    IndexName: INDEX_EMPLOYE,
    KeyConditionExpression: "employeId = :e",
    ExpressionAttributeValues: { ":e": employeId },
  }));
  return trierRecentDAbord(Items || []);
}

/** Une seule demande en attente par salarié : deux déclarations
 *  contradictoires en file rendraient la validation ambiguë. */
async function demandeEnAttenteDe(employeId) {
  const liste = await demandesDeLEmploye(employeId);
  return liste.find((d) => d.statut === "EN_ATTENTE") || null;
}

async function demandesParStatut(statut) {
  const { Items } = await db.send(new QueryCommand({
    TableName: TABLE_DEMANDES,
    IndexName: INDEX_STATUT,
    KeyConditionExpression: "statut = :s",
    ExpressionAttributeValues: { ":s": statut },
  }));
  return trierRecentDAbord(Items || []);
}

async function toutesLesDemandes() {
  const { Items } = await db.send(new ScanCommand({ TableName: TABLE_DEMANDES }));
  return trierRecentDAbord(Items || []);
}

const trierRecentDAbord = (l) =>
  [...l].sort((a, b) => String(b.creeLe || "").localeCompare(String(a.creeLe || "")));

// ── Validation : le seul chemin qui écrit dans Employes ────────────

/**
 * Applique une situation validée à la fiche employé.
 *
 * `attribute_exists(id)` n'est pas une précaution de style : UpdateItem
 * est un UPSERT en DynamoDB. Sans cette condition, un identifiant erroné
 * ne produit aucune erreur — il CRÉE une fiche employé fantôme, qui
 * ressortira ensuite dans les listes RH et les calculs de paie.
 */
async function appliquerALaFiche(employeId, situation) {
  const noms = {};
  const valeurs = { ":maj": new Date().toISOString() };
  const sets = ["majLe = :maj"];

  for (const [nom, v] of Object.entries(situation)) {
    if (!NOMS_CHAMPS.includes(nom)) continue;  // jamais de champ arbitraire
    noms[`#${nom}`] = nom;
    valeurs[`:${nom}`] = v;
    sets.push(`#${nom} = :${nom}`);
  }

  await db.send(new UpdateCommand({
    TableName: TABLE_EMPLOYES,
    Key: { id: employeId },
    UpdateExpression: `SET ${sets.join(", ")}`,
    ExpressionAttributeNames: Object.keys(noms).length ? noms : undefined,
    ExpressionAttributeValues: valeurs,
    ConditionExpression: "attribute_exists(id)",
  }));
}

async function marquerTraitee(id, { statut, traiteParId, commentaireRh }) {
  const { Attributes } = await db.send(new UpdateCommand({
    TableName: TABLE_DEMANDES,
    Key: { id },
    UpdateExpression:
      "SET statut = :s, traiteLe = :t, traiteParId = :p, commentaireRh = :c",
    ExpressionAttributeValues: {
      ":s": statut,
      ":t": new Date().toISOString(),
      ":p": traiteParId,
      ":c": commentaireRh || null,
      ":attente": "EN_ATTENTE",
    },
    // Empêche deux validations concurrentes de la même demande.
    ConditionExpression: "attribute_exists(id) AND statut = :attente",
    ReturnValues: "ALL_NEW",
  }));
  return Attributes;
}

/**
 * Approuve une demande ET applique la situation, en une seule écriture
 * atomique.
 *
 * Pourquoi une transaction et non deux appels successifs : si l'un
 * réussit et l'autre échoue, l'application devient incohérente dans un
 * sens ou dans l'autre. Marquer d'abord la demande traitée, puis échouer
 * sur la fiche, donne un salarié qui croit sa déclaration acceptée alors
 * que sa paie l'ignore. Écrire d'abord la fiche, puis échouer sur la
 * demande, laisse une demande que la RH validera une seconde fois. Les
 * deux conditions — la fiche existe, la demande est toujours en attente —
 * sont évaluées dans la même transaction, donc soit tout passe, soit
 * rien ne bouge.
 */
async function approuverEtAppliquer(demande, { traiteParId, commentaireRh }) {
  const noms = {};
  const valeurs = { ":maj": new Date().toISOString() };
  const sets = ["majLe = :maj"];

  for (const [nom, v] of Object.entries(demande.situation || {})) {
    if (!NOMS_CHAMPS.includes(nom)) continue;  // jamais de champ arbitraire
    noms[`#${nom}`] = nom;
    valeurs[`:${nom}`] = v;
    sets.push(`#${nom} = :${nom}`);
  }

  await db.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_EMPLOYES,
          Key: { id: demande.employeId },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ExpressionAttributeNames: Object.keys(noms).length ? noms : undefined,
          ExpressionAttributeValues: valeurs,
          // UpdateItem est un UPSERT : sans cette condition, un
          // identifiant erroné CRÉERAIT une fiche employé fantôme au
          // lieu d'échouer.
          ConditionExpression: "attribute_exists(id)",
        },
      },
      {
        Update: {
          TableName: TABLE_DEMANDES,
          Key: { id: demande.id },
          UpdateExpression:
            "SET statut = :approuve, traiteLe = :t, traiteParId = :p, commentaireRh = :c",
          ExpressionAttributeValues: {
            ":approuve": "APPROUVE",
            ":t": new Date().toISOString(),
            ":p": traiteParId,
            ":c": commentaireRh || null,
            ":attente": "EN_ATTENTE",
          },
          ConditionExpression: "attribute_exists(id) AND statut = :attente",
        },
      },
    ],
  }));
}

async function ficheEmploye(employeId) {
  const { Item } = await db.send(
    new GetCommand({ TableName: TABLE_EMPLOYES, Key: { id: employeId } })
  );
  return Item || null;
}

module.exports = {
  TABLE_DEMANDES, TABLE_EMPLOYES, INDEX_EMPLOYE, INDEX_STATUT,
  CHAMPS, NOMS_CHAMPS,
  validerSituation, comparer, seulementEnBaisse,
  creerDemande, demandeParId, demandesDeLEmploye, demandeEnAttenteDe,
  demandesParStatut, toutesLesDemandes,
  appliquerALaFiche, approuverEtAppliquer, marquerTraitee, ficheEmploye,
};