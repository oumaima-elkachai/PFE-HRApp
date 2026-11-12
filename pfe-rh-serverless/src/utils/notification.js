// src/utils/notification.js
//
// Le seul endroit d'où part une notification.
//
// ── Pourquoi ce module existe ───────────────────────────────────────
//
// Six modules écrivaient directement dans la table, chacun avec sa
// propre idée du destinataire. Un relevé de la base l'a montré : sur
// quarante-cinq notifications, le champ `userId` contenait
//
//     « RH »                    un rôle
//     « karim@entreprise.tn »   une adresse e-mail
//     « 7f3a… »                 un identifiant de fiche
//
// Trois conventions pour un seul champ. Le lecteur n'en cherche
// forcément qu'une : les deux autres catégories ne s'affichent jamais,
// sans aucune erreur nulle part. C'est le genre de défaut qui ne se
// trouve pas en relisant le code, parce que chaque fichier, isolé,
// paraît correct.
//
// ── La règle, désormais unique ──────────────────────────────────────
//
// Une notification s'adresse à UNE PERSONNE ou à UN RÔLE. Pas à autre
// chose, et jamais à une adresse e-mail.
//
//     personne →  l'identifiant de sa FICHE employé
//     rôle     →  « ROLE#RH », « ROLE#MANAGER »…
//
// ── Pourquoi la fiche et non le compte ──────────────────────────────
//
// Le code serveur a presque toujours la fiche sous la main : c'est
// elle que renvoie employes.courant(), et c'est elle qui porte le
// poste, le département et le nom. Le compte Cognito, lui, n'est
// accessible qu'au porteur du jeton.
//
// ── Le cas du candidat ──────────────────────────────────────────────
//
// Un candidat n'a pas de fiche employé : il n'est pas salarié. Son
// seul identifiant stable côté application est son adresse. L'e-mail
// reste donc accepté, MAIS pour lui seulement, et en le déclarant.
//
// Ce n'est pas une bonne clé : la base contient huit adresses en
// doublon, et deux personnes partageant une adresse recevraient les
// notifications l'une de l'autre. Pour un salarié, l'e-mail est donc
// refusé — sa fiche existe, il n'y a aucune raison de s'en passer.
//
// La correction de fond serait de donner un identifiant propre aux
// candidats. Elle ne tient pas dans ce module.
//
// ── Pourquoi un préfixe pour les rôles ──────────────────────────────
//
// « RH » seul se confondrait avec l'identifiant d'une fiche qui
// vaudrait « RH ». Improbable, mais le préfixe coûte trois caractères
// et supprime la question. Il rend aussi les deux cas lisibles d'un
// coup d'œil dans la table.

const { randomUUID } = require("node:crypto");
const { PutCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./dynamodb");

const TABLE_NOTIFICATIONS =
  process.env.TABLE_NOTIFICATIONS || "Notifications-local";

const PREFIXE_ROLE = "ROLE#";

// Durée de vie par défaut. Le champ est en SECONDES, format attendu
// par le TTL de DynamoDB — en millisecondes, l'échéance tomberait en
// l'an 56 000 et rien ne serait jamais effacé.
const DUREE_DEFAUT_JOURS = 90;

const ROLES_CONNUS = ["RH", "ADMIN", "MANAGER"];

/** Reconnaît une adresse e-mail, pour la refuser avec un message utile. */
const ressembleAUnEmail = (v) => typeof v === "string" && v.includes("@");

/**
 * Clé de destinataire pour un rôle.
 *
 *     cleRole("rh")  →  "ROLE#RH"
 */
function cleRole(role) {
  const propre = String(role ?? "").trim().toUpperCase();
  if (!propre) throw new Error("Rôle vide");
  return `${PREFIXE_ROLE}${propre}`;
}

/** Vrai si la clé désigne un rôle et non une personne. */
const estCleRole = (cle) => String(cle ?? "").startsWith(PREFIXE_ROLE);

/**
 * Toutes les clés qu'un lecteur doit interroger pour une personne.
 *
 * Une seule requête ne suffit pas, pour deux raisons.
 *
 * ── Un rôle n'est pas une personne ──────────────────────────────────
 *
 * Un responsable RH reçoit ses notifications personnelles ET celles
 * adressées à son rôle. Ce sont deux destinataires différents, donc
 * deux clés.
 *
 * ── L'existant n'est pas normalisé ──────────────────────────────────
 *
 * Quarante-cinq notifications sont déjà en base, écrites par six
 * modules avec trois conventions. La liste inclut donc les formes
 * anciennes :
 *
 *     « RH »      tel quel, écrit par frais/notes.js aujourd'hui
 *     « ROLE#RH » la forme normalisée de ce module
 *
 * Interroger les deux fait fonctionner l'ensemble SANS toucher aux
 * six émetteurs. C'est un compromis assumé : la dette reste, mais
 * elle n'empêche plus rien, et elle se résorbe émetteur par émetteur
 * sans que rien ne casse entre-temps.
 *
 *     clesLecture({ email: "a@b.tn", employeId: "7f3a…", roles: ["RH"] })
 *       →  ["a@b.tn", "7f3a…", "ROLE#RH", "RH"]
 */
function clesLecture({ email, employeId, roles = [] } = {}) {
  const liste = [];

  // L'e-mail d'abord : c'est la clé des notifications de candidats,
  // et la plus ancienne forme en base.
  if (email) liste.push(String(email).trim().toLowerCase());
  if (employeId) liste.push(String(employeId));

  const tableau = Array.isArray(roles) ? roles : [roles];
  for (const r of tableau) {
    if (!r) continue;
    liste.push(cleRole(r));
    // Forme ancienne, à retirer quand les six émetteurs seront passés
    // par ce module.
    liste.push(String(r).trim().toUpperCase());
  }

  // Sans doublon : une même clé interrogée deux fois rendrait les
  // mêmes lignes, et le lecteur afficherait la notification en double.
  return [...new Set(liste)];
}

/**
 * Rôles portés par un utilisateur, quelle que soit la forme.
 *
 * Le jeton les expose tantôt dans `groups`, tantôt dans `roles`,
 * tantôt dans un `role` unique — c'est déjà ce que gère estRole() dans
 * utils/contexte. Lire une seule de ces formes ferait disparaître les
 * notifications de rôle pour la moitié des comptes.
 */
function rolesDe(utilisateur) {
  const brut = utilisateur?.groups ?? utilisateur?.roles ?? utilisateur?.role ?? [];
  return (Array.isArray(brut) ? brut : [brut])
    .filter(Boolean)
    .map((r) => String(r).trim().toUpperCase());
}

/**
 * Construit la notification sans l'écrire.
 *
 * Séparée de l'écriture pour être vérifiable sans base de données :
 * c'est la construction du destinataire qui porte le défaut qu'on
 * corrige ici, pas l'appel à DynamoDB.
 */
function construire(entree) {
  const {
    employeId,
    role,
    email,
    type,
    titre,
    message = "",
    metadata = {},
    expireJours = DUREE_DEFAUT_JOURS,
  } = entree ?? {};

  const fournis = [employeId, role, email].filter(Boolean).length;

  if (fournis > 1) {
    throw new Error(
      "Une notification s'adresse à UN destinataire : employeId, role ou email."
    );
  }

  if (fournis === 0) {
    throw new Error(
      "Destinataire manquant : précisez employeId, role ou email."
    );
  }

  if (email && !ressembleAUnEmail(email)) {
    throw new Error(`« ${email} » n'est pas une adresse e-mail.`);
  }

  // Le message nomme la valeur fautive : « destinataire invalide »
  // enverrait chercher le défaut au mauvais endroit.
  if (ressembleAUnEmail(employeId)) {
    throw new Error(
      `« ${employeId} » est une adresse e-mail, pas un identifiant de fiche. `
      + "L'e-mail n'est pas unique dans cette base et ne peut pas servir de "
      + "destinataire. Résolvez-le en fiche avec employes.parEmail()."
    );
  }

  if (!type) throw new Error("Type de notification manquant");
  if (!titre) throw new Error("Titre de notification manquant");

  const destinataire = role ? cleRole(role)
    : email ? String(email).trim().toLowerCase()
    : String(employeId);

  const genre = role ? "ROLE" : email ? "EMAIL" : "EMPLOYE";

  return {
    id: randomUUID(),

    // `userId` reste la clé de partition de la table : la renommer
    // demanderait de recréer la table et de migrer les lignes. Elle
    // porte désormais une valeur normalisée, ce qui suffit.
    userId: destinataire,

    // Deux champs de plus, pour la lisibilité et le débogage. Ils ne
    // servent à aucune requête : ils évitent d'avoir à deviner, en
    // lisant la table, si « ROLE#RH » est un rôle ou un nom bizarre.
    destinataireType: genre,
    destinataireRef: role ? String(role).toUpperCase() : destinataire,

    type,
    titre,
    message,
    metadata,

    lu: false,
    creeLe: new Date().toISOString(),

    // En secondes depuis l'époque : c'est le format du TTL DynamoDB.
    expireLe: Math.floor(Date.now() / 1000) + expireJours * 24 * 3600,
  };
}

/**
 * Envoie une notification.
 *
 * ── N'échoue jamais ─────────────────────────────────────────────────
 *
 * Une notification accompagne une action ; elle ne la conditionne pas.
 * Une décision de congé enregistrée ne doit pas être annulée parce que
 * la table des notifications est indisponible. L'erreur est donc
 * journalisée et avalée, et l'appelant reçoit `false`.
 *
 * Une erreur de PROGRAMMATION — destinataire manquant, e-mail passé
 * en identifiant — est traitée autrement : elle est journalisée avec
 * sa cause, parce qu'elle ne se corrigera pas toute seule.
 *
 * @returns {Promise<boolean>} true si la ligne est écrite
 */
async function notifier(entree) {
  let notification;

  try {
    notification = construire(entree);
  } catch (e) {
    console.error(`Notification mal formée (${e.message}) :`, entree);
    return false;
  }

  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NOTIFICATIONS,
      Item: notification,
    }));
    return true;
  } catch (e) {
    console.error("Notification non écrite :", e.message);
    return false;
  }
}

/**
 * Envoie plusieurs notifications en une fois.
 *
 * BatchWrite plafonne à vingt-cinq éléments par requête : au-delà,
 * DynamoDB rejette la requête entière. Le découpage est fait ici pour
 * que l'appelant n'ait pas à y penser — et parce qu'un appelant qui
 * notifie « toute l'équipe » ne sait pas combien ils sont.
 *
 * @returns {Promise<number>} nombre de notifications écrites
 */
async function notifierPlusieurs(entrees) {
  const valides = [];

  for (const entree of entrees ?? []) {
    try {
      valides.push(construire(entree));
    } catch (e) {
      console.error(`Notification mal formée (${e.message}) :`, entree);
    }
  }

  if (valides.length === 0) return 0;

  let ecrites = 0;

  for (let i = 0; i < valides.length; i += 25) {
    const lot = valides.slice(i, i + 25);

    try {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NOTIFICATIONS]: lot.map((Item) => ({ PutRequest: { Item } })),
        },
      }));
      ecrites += lot.length;
    } catch (e) {
      console.error("Lot de notifications non écrit :", e.message);
    }
  }

  return ecrites;
}

module.exports = {
  notifier,
  notifierPlusieurs,
  construire,
  clesLecture,
  rolesDe,
  cleRole,
  estCleRole,
  PREFIXE_ROLE,
  ROLES_CONNUS,
  TABLE_NOTIFICATIONS,
  DUREE_DEFAUT_JOURS,
};