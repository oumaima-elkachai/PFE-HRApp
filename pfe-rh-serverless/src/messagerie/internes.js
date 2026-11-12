// src/messagerie/internes.js
//
// Messagerie interne entre salariés.
//
// Distincte de la messagerie de recrutement, qui est indexée par
// candidature et oppose un candidat à la RH. Ici deux salariés de la
// même entreprise échangent, et le fil existe indépendamment de tout
// dossier.
//
// ── Clé du fil ─────────────────────────────────────────────────────
// Les deux identifiants triés, joints par un double tiret bas. Deux
// personnes n'ont donc qu'UN fil, quel que soit celui qui écrit le
// premier. Sans ce tri, Karim→Sonia et Sonia→Karim auraient produit
// deux conversations parallèles, chacune ignorant l'autre.
//
// ── Pourquoi une seule table ───────────────────────────────────────
// Le schéma « boîte de réception » — une table de fils par personne, en
// plus de la table des messages — rend la liste des conversations
// proportionnelle au nombre de fils plutôt qu'au nombre de messages.
// C'est ce qu'il faudrait à grande échelle. Ici, deux index secondaires
// suffisent : la liste coûte deux requêtes et un regroupement en
// mémoire. Le jour où une boîte dépasse quelques milliers de messages,
// c'est cette décision qu'il faudra revoir — elle est isolée dans
// `mesFils`.

const {
  PutCommand, GetCommand, QueryCommand, UpdateCommand, ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, corpsDe } = require("../utils/identite");

const TABLE_MESSAGES = process.env.TABLE_MESSAGES_INTERNES || "MessagesInternes-local";
const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

const INDEX_EXPEDITEUR = "expediteur-index";
const INDEX_DESTINATAIRE = "destinataire-index";

const LONGUEUR_MAX = 2000;
const MESSAGES_PAR_FIL = 200;

// ── Qui peut écrire à qui ──────────────────────────────────────────
//
//            vers │ candidat │ salarié │ RH
//   ──────────────┼──────────┼─────────┼────
//   candidat      │    ✗     │    ✗    │ ✓ (messagerie de recrutement)
//   salarié       │    ✗     │    ✓    │ ✓ (ici)
//   RH            │ ✓ (recr.)│    ✓    │ ✓ (ici)
//
// Ce module ne traite que la colonne « ici ». Le candidat en est exclu
// par deux verrous indépendants : son rôle, refusé explicitement
// ci-dessous, et l'absence de fiche employé — un candidat n'en a pas,
// et les deux participants doivent en avoir une.
//
// La conséquence pratique : un compte RH doit AVOIR une fiche employé
// pour utiliser la messagerie interne. C'est cohérent — une personne
// des ressources humaines est elle-même salariée de l'entreprise — et
// c'est aussi ce qui lui donne accès à ses propres congés et bulletins.

/** Rôles autorisés dans la messagerie interne */
function refusDeRole(moi) {
  if (moi.role === "CANDIDAT") {
    return erreur(
      "La messagerie interne est réservée aux salariés. "
      + "Pour joindre le service recrutement, utilisez le suivi de votre candidature.",
      403
    );
  }
  return null;
}

// ── Clés ───────────────────────────────────────────────────────────

/** Identifiant de fil, stable quel que soit l'ordre des participants */
const filDe = (a, b) => [String(a), String(b)].sort().join("__");

/**
 * Clé de tri : horodatage puis identifiant.
 *
 * Deux messages envoyés dans la même milliseconde écraseraient l'un
 * l'autre si la clé n'était que l'horodatage — DynamoDB remplace sans
 * prévenir quand la clé complète est identique.
 */
const cleTri = (iso, id) => `${iso}#${id}`;

// ── Lectures ───────────────────────────────────────────────────────

async function ficheEmploye(id) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLE_EMPLOYES, Key: { id },
  }));
  return Item || null;
}

/**
 * Toutes les fiches portant cet e-mail.
 *
 * Le jeton Cognito porte un `sub`, l'annuaire manipule des identifiants
 * de fiche : deux espaces distincts, que seul l'e-mail relie. Faute
 * d'index sur l'e-mail, on parcourt la table — et on la parcourt
 * ENTIÈREMENT : un Scan s'arrête à 1 Mo, et sans la boucle une fiche
 * située au-delà passerait pour absente.
 *
 * La comparaison est insensible à la casse et aux espaces : une fiche
 * saisie « Karim@Entreprise.tn » doit répondre à un jeton en minuscules.
 */
async function fichesParEmail(email) {
  const cible = String(email || "").trim().toLowerCase();
  if (!cible) return [];

  const trouvees = [];
  let depart;
  do {
    const page = await docClient.send(new ScanCommand({
      TableName: TABLE_EMPLOYES,
      ProjectionExpression: "id, email, nom, prenom, poste, departement, statut",
      ExclusiveStartKey: depart,
    }));
    for (const f of page.Items || []) {
      if (String(f.email || "").trim().toLowerCase() === cible) trouvees.push(f);
    }
    depart = page.LastEvaluatedKey;
  } while (depart);

  return trouvees;
}

// Le même compte interroge la messagerie plusieurs fois par affichage de
// page. Un cache très court évite d'autant de parcours de table, sans
// masquer longtemps une fiche qui vient d'être créée.
const CACHE_MS = 30_000;
const cacheFiches = new Map();

/**
 * Traduit l'identité du jeton en fiche employé.
 *
 * @returns {{ fiche: object }|{ erreur: object }}
 */
async function identiteFiche(moi) {
  const cle = (moi.email || "").trim().toLowerCase();

  if (!cle) {
    return { erreur: erreur(
      "Le jeton ne porte pas d'adresse e-mail, seule information qui relie "
      + "un compte à sa fiche employé. Reconnectez-vous ; si le problème "
      + "persiste, l'attribut e-mail manque dans le groupe Cognito.",
      401
    ) };
  }

  const enCache = cacheFiches.get(cle);
  if (enCache && Date.now() - enCache.a < CACHE_MS) return { fiche: enCache.fiche };

  const fiches = await fichesParEmail(cle);

  if (fiches.length === 0) {
    // Cas typique : un compte créé sans fiche employé. Le message dit
    // quoi faire plutôt que de constater l'absence — c'est la même fiche
    // manquante qui bloque ses congés et ses bulletins.
    return { erreur: erreur(
      `Aucune fiche employé n'est rattachée au compte ${cle}. `
      + `Créez-lui une fiche dans l'espace Employés : c'est elle qui ouvre `
      + `la messagerie interne, les congés et les bulletins.`,
      404
    ) };
  }

  let retenues = fiches;
  if (retenues.length > 1) {
    // Un doublon de saisie est fréquent en base de démonstration. On
    // écarte les fiches inactives, qui sont presque toujours l'ancienne.
    const actives = retenues.filter((f) => (f.statut ?? "actif") === "actif");
    if (actives.length >= 1) retenues = actives;
  }

  if (retenues.length > 1) {
    // Choisir en silence attribuerait les messages à la mauvaise
    // personne, et le fil porterait un identifiant instable d'un
    // affichage à l'autre. Mieux vaut nommer le doublon.
    return { erreur: erreur(
      `${retenues.length} fiches employé portent l'adresse ${cle} `
      + `(${retenues.map((f) => f.id).join(", ")}). `
      + `Supprimez les doublons dans l'espace Employés : tant qu'il y en a `
      + `plusieurs, impossible de savoir à qui attribuer les messages.`,
      409
    ) };
  }

  cacheFiches.set(cle, { fiche: retenues[0], a: Date.now() });
  return { fiche: retenues[0] };
}

const nomDe = (f) =>
  f ? `${f.prenom ?? ""} ${f.nom ?? ""}`.trim() || f.email || "—" : "—";

/** Tous les messages d'un fil, du plus ancien au plus récent */
async function messagesDuFil(filId) {
  const { Items } = await docClient.send(new QueryCommand({
    TableName: TABLE_MESSAGES,
    KeyConditionExpression: "filId = :f",
    ExpressionAttributeValues: { ":f": filId },
    Limit: MESSAGES_PAR_FIL,
    ScanIndexForward: true,
  }));
  return Items || [];
}

/**
 * Les fils d'une personne : messages envoyés et reçus, regroupés.
 *
 * Deux requêtes plutôt qu'une, parce qu'un index secondaire ne peut
 * porter qu'une clé scalaire : on ne peut pas indexer « participe au
 * fil ». Le regroupement se fait donc en mémoire.
 */
async function mesFils(moiId) {
  const [envoyes, recus] = await Promise.all([
    docClient.send(new QueryCommand({
      TableName: TABLE_MESSAGES,
      IndexName: INDEX_EXPEDITEUR,
      KeyConditionExpression: "expediteurId = :m",
      ExpressionAttributeValues: { ":m": moiId },
      ScanIndexForward: false,
    })),
    docClient.send(new QueryCommand({
      TableName: TABLE_MESSAGES,
      IndexName: INDEX_DESTINATAIRE,
      KeyConditionExpression: "destinataireId = :m",
      ExpressionAttributeValues: { ":m": moiId },
      ScanIndexForward: false,
    })),
  ]);

  const tous = [...(envoyes.Items || []), ...(recus.Items || [])];

  const fils = new Map();
  for (const m of tous) {
    const estMien = m.expediteurId === moiId;
    const autreId = estMien ? m.destinataireId : m.expediteurId;
    const autreNom = estMien ? m.destinataireNom : m.expediteurNom;

    const existant = fils.get(m.filId);
    const plusRecent = !existant || m.envoyeLe > existant.dernierMessage.envoyeLe;

    fils.set(m.filId, {
      filId: m.filId,
      autreId,
      autreNom,
      dernierMessage: plusRecent
        ? { contenu: m.contenu, envoyeLe: m.envoyeLe, deMoi: estMien }
        : existant.dernierMessage,
      // Non lus : ceux qui me sont adressés et que je n'ai pas ouverts.
      nonLus: (existant?.nonLus ?? 0) + (!estMien && !m.lu ? 1 : 0),
    });
  }

  return [...fils.values()].sort((a, b) =>
    String(b.dernierMessage.envoyeLe).localeCompare(String(a.dernierMessage.envoyeLe)));
}

/** Marque comme lus les messages reçus d'un fil */
async function marquerLus(filId, moiId, messages) {
  const aMarquer = messages.filter((m) => m.destinataireId === moiId && !m.lu);
  if (aMarquer.length === 0) return 0;

  // Une écriture par message : BatchWrite ne sait pas mettre à jour un
  // attribut, seulement remplacer l'item entier, ce qui écraserait un
  // champ ajouté entre-temps.
  await Promise.all(aMarquer.map((m) => docClient.send(new UpdateCommand({
    TableName: TABLE_MESSAGES,
    Key: { filId: m.filId, cleTri: m.cleTri },
    UpdateExpression: "SET lu = :vrai, luLe = :t",
    ExpressionAttributeValues: { ":vrai": true, ":t": new Date().toISOString() },
    ConditionExpression: "attribute_exists(filId)",
  })).catch((e) => {
    // Un message disparu entre la lecture et la mise à jour ne doit pas
    // faire échouer l'ouverture du fil.
    if (e.name !== "ConditionalCheckFailedException") throw e;
  })));

  return aMarquer.length;
}

// ── GET /messages/internes ─────────────────────────────────────────

async function handlerFils(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!moi.sub) return erreur("Le jeton ne porte aucun identifiant utilisateur", 401);
  const refus = refusDeRole(moi);
  if (refus) return refus;

  // Le jeton porte un `sub` Cognito ; tout ce module raisonne en
  // identifiants de FICHE, ceux que manipule l'annuaire. On traduit une
  // fois ici, et `moi.sub` est un identifiant de fiche au-delà.
  const traduite = await identiteFiche(moi);
  if (traduite.erreur) return traduite.erreur;
  moi.sub = traduite.fiche.id;
  moi.fiche = traduite.fiche;

  const fils = await mesFils(moi.sub);

  return succes({
    fils,
    total: fils.length,
    nonLus: fils.reduce((s, f) => s + f.nonLus, 0),
  });
}

// ── GET /messages/internes/:employeId ──────────────────────────────

async function handlerFil(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!moi.sub) return erreur("Le jeton ne porte aucun identifiant utilisateur", 401);

  const refus = refusDeRole(moi);
  if (refus) return refus;

  const autreId = event.pathParameters?.employeId;
  if (!autreId) return erreur("Identifiant du collègue manquant", 400);

  const traduite = await identiteFiche(moi);
  if (traduite.erreur) return traduite.erreur;
  moi.sub = traduite.fiche.id;
  moi.fiche = traduite.fiche;

  if (autreId === moi.sub) {
    return erreur("Vous ne pouvez pas ouvrir un fil avec vous-même", 400);
  }

  const autre = await ficheEmploye(autreId);
  if (!autre) {
    return erreur(`Aucun collaborateur ne porte l'identifiant ${autreId}`, 404);
  }

  const filId = filDe(moi.sub, autreId);
  const messages = await messagesDuFil(filId);
  const marques = await marquerLus(filId, moi.sub, messages);

  return succes({
    filId,
    interlocuteur: {
      id: autreId,
      nom: nomDe(autre),
      poste: autre.poste ?? null,
      departement: autre.departement ?? null,
      email: autre.email ?? null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      auteurNom: m.expediteurNom,
      contenu: m.contenu,
      envoyeLe: m.envoyeLe,
      // `lu` du point de vue de l'expéditeur : mes messages à moi
      // portent l'accusé de lecture, ceux reçus viennent d'être lus.
      lu: m.expediteurId === moi.sub ? !!m.lu : true,
      deMoi: m.expediteurId === moi.sub,
    })),
    marquesLus: marques,
  });
}

// ── POST /messages/internes/:employeId ─────────────────────────────

async function handlerEnvoyer(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!moi.sub) return erreur("Le jeton ne porte aucun identifiant utilisateur", 401);

  const refus = refusDeRole(moi);
  if (refus) return refus;

  const autreId = event.pathParameters?.employeId;
  if (!autreId) return erreur("Identifiant du collègue manquant", 400);

  const traduite = await identiteFiche(moi);
  if (traduite.erreur) return traduite.erreur;
  moi.sub = traduite.fiche.id;
  moi.fiche = traduite.fiche;

  if (autreId === moi.sub) {
    return erreur("Vous ne pouvez pas vous écrire à vous-même", 400);
  }

  const contenu = String(corpsDe(event).contenu ?? "").trim();
  if (!contenu) return erreur("Le message est vide", 400);
  if (contenu.length > LONGUEUR_MAX) {
    return erreur(`Le message dépasse ${LONGUEUR_MAX} caractères`, 400);
  }

  // La fiche de l'expéditeur a déjà été résolue plus haut ; seule celle
  // du destinataire reste à lire. Elle est lue AVANT d'écrire : un fil ne
  // doit pas pouvoir s'ouvrir vers un identifiant inexistant, sinon
  // l'expéditeur croit avoir écrit à quelqu'un.
  const expediteur = moi.fiche;
  const destinataire = await ficheEmploye(autreId);

  if (!destinataire) {
    return erreur(`Aucun collaborateur ne porte l'identifiant ${autreId}`, 404);
  }

  const id = randomUUID();
  const envoyeLe = new Date().toISOString();

  const message = {
    filId: filDe(moi.sub, autreId),
    cleTri: cleTri(envoyeLe, id),
    id,
    envoyeLe,
    expediteurId: moi.sub,
    expediteurNom: nomDe(expediteur),
    destinataireId: autreId,
    destinataireNom: nomDe(destinataire),
    contenu,
    lu: false,
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_MESSAGES,
    Item: message,
    // La clé de tri contient un identifiant unique : la condition
    // garantit qu'aucun message existant n'est remplacé.
    ConditionExpression: "attribute_not_exists(filId)",
  }));

  return succes({
    message: {
      id, auteurNom: message.expediteurNom, contenu,
      envoyeLe, lu: false, deMoi: true,
    },
  }, 201);
}

// ── Pannes d'infrastructure ────────────────────────────────────────

/**
 * Traduit une table ou un index absent en message actionnable.
 *
 * Sans cela, `ResourceNotFoundException` remonte jusqu'au gestionnaire
 * d'erreurs d'Express et sort en « 500 Erreur serveur » — un message
 * qui n'apprend rien et oblige à fouiller les journaux. Or c'est la
 * panne la plus probable au premier lancement : le module est posé, les
 * routes sont branchées, mais le script de création n'a pas été lancé.
 */
function pannePrevisible(e) {
  if (e?.name !== "ResourceNotFoundException") return null;

  const surUnIndex = /index/i.test(e.message || "");
  return erreur(
    surUnIndex
      ? `Un index secondaire de la table ${TABLE_MESSAGES} est introuvable. `
        + `La table existe mais ses index ${INDEX_EXPEDITEUR} et `
        + `${INDEX_DESTINATAIRE} manquent : relancez le script de création `
        + `après avoir supprimé la table, ou ajoutez les index.`
      : `La table ${TABLE_MESSAGES} est introuvable. Lancez `
        + `creer-table-messages-internes.js, qui la crée avec ses deux index. `
        + `Si elle porte un autre nom chez vous, déclarez `
        + `TABLE_MESSAGES_INTERNES.`,
    503
  );
}

/** Enveloppe un handler pour transformer les pannes connues en messages */
function protege(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      const panne = pannePrevisible(e);
      if (panne) {
        console.error(`[messagerie interne] ${e.name} : ${e.message}`);
        return panne;
      }
      throw e;
    }
  };
}

module.exports = {
  handlerFils: protege(handlerFils),
  handlerFil: protege(handlerFil),
  handlerEnvoyer: protege(handlerEnvoyer),
  // Exportés pour les tests et pour une éventuelle réutilisation
  filDe, cleTri, mesFils, messagesDuFil, marquerLus,
  fichesParEmail, identiteFiche,
  TABLE_MESSAGES, INDEX_EXPEDITEUR, INDEX_DESTINATAIRE, LONGUEUR_MAX,
};