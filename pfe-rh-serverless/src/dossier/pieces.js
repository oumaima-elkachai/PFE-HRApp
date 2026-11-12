// src/dossier/pieces.js
//
// Le dossier du personnel : les pièces que le salarié dépose et que la
// RH valide.
//
// Deux principes qui expliquent la forme du module.
//
// Le salarié n'envoie JAMAIS d'identifiant d'employé. Il agit en son
// propre nom, et son identifiant de fiche est déduit de son jeton par
// `identiteFiche`. Un champ `employeId` dans le corps de la requête
// serait une faille : il suffirait de le changer pour déposer une pièce
// au nom d'un collègue.
//
// Une pièce refusée n'est pas supprimée. Elle garde son commentaire,
// parce qu'un salarié qui redépose doit savoir ce qui n'allait pas.

const { randomUUID } = require("crypto");
const {
  PutCommand, GetCommand, QueryCommand, UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { S3Client } = require("@aws-sdk/client-s3");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, corpsDe, estRh } = require("../utils/identite");
const { identiteFiche } = require("../utils/fiche");
const {
  CATALOGUE, CATALOGUE_DELIVRES, STATUTS, typeConnu, exigeEcheance,
} = require("./catalogue");

const TABLE_PIECES = process.env.TABLE_PIECES_DOSSIER || "PiecesDossier-local";
const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";
const SEAU = process.env.DOCUMENTS_BUCKET;
const INDEX_STATUT = "statut-index";

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo
const TYPES_FICHIER = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  ...(process.env.S3_ENDPOINT
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
});

// ── Stockage ───────────────────────────────────────────────────────
//
// S3 quand le seau est déclaré, le disque local sinon. C'est la
// convention de `src/documents/demandes.js`, et la suivre vaut mieux
// que refuser le dépôt : en développement, personne n'a de seau S3, et
// un module qui répond 503 là où le reste de l'application écrit dans
// `tmp/` n'est pas cohérent.

async function ecrireFichier(cle, buffer, typeMime) {
  if (SEAU) {
    await s3.send(new PutObjectCommand({
      Bucket: SEAU, Key: cle, Body: buffer, ContentType: typeMime,
      ServerSideEncryption: "AES256",
    }));
    return;
  }

  const fs = require("fs/promises");
  const path = require("path");
  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
}

async function lireFichier(cle) {
  if (SEAU) {
    const objet = await s3.send(new GetObjectCommand({ Bucket: SEAU, Key: cle }));
    return Buffer.from(await objet.Body.transformToByteArray());
  }

  const fs = require("fs/promises");
  const path = require("path");
  return fs.readFile(path.join(process.cwd(), "tmp", cle));
}

// ── Outils ─────────────────────────────────────────────────────────

const cleTri = (type, id) => `${type}#${id}`;
const typeDe = (cle) => String(cle).split("#")[0];

/** Une pièce dont l'échéance est passée n'est plus valide, même validée. */
function statutEffectif(piece) {
  if (piece.statut !== "VALIDEE") return piece.statut;
  if (!piece.dateExpiration) return "VALIDEE";
  return piece.dateExpiration < new Date().toISOString().slice(0, 10)
    ? "EXPIREE"
    : "VALIDEE";
}

async function piecesDe(employeId) {
  const { Items } = await docClient.send(new QueryCommand({
    TableName: TABLE_PIECES,
    KeyConditionExpression: "employeId = :e",
    ExpressionAttributeValues: { ":e": employeId },
  }));
  return (Items || []).map((p) => ({ ...p, statut: statutEffectif(p) }));
}

/**
 * L'état du dossier : une ligne par pièce attendue, qu'elle soit déposée
 * ou non. L'absence est une information au moins aussi utile que la
 * présence — c'est elle qui dit au salarié ce qu'il lui reste à faire.
 */
function etatDossier(pieces) {
  const parType = new Map();
  for (const p of pieces) {
    const t = typeDe(p.cleTri);
    if (!parType.has(t)) parType.set(t, []);
    parType.get(t).push(p);
  }

  const lignes = Object.entries(CATALOGUE).map(([type, def]) => {
    // La plus récente fait foi : un redépôt remplace un refus.
    const deposees = (parType.get(type) || [])
      .sort((a, b) => String(b.deposeLe).localeCompare(String(a.deposeLe)));

    return {
      type,
      obligatoire: def.obligatoire,
      multiple: !!def.multiple,
      expire: !!def.expire,
      statut: deposees[0]?.statut ?? "MANQUANTE",
      pieces: deposees.map((p) => ({
        id: p.id,
        nomFichier: p.nomFichier,
        taille: p.taille,
        deposeLe: p.deposeLe,
        statut: p.statut,
        dateExpiration: p.dateExpiration ?? null,
        commentaireRH: p.commentaireRH ?? null,
        valideePar: p.valideePar ?? null,
        valideeLe: p.valideeLe ?? null,
        // Ce que le salarié a lu sur sa propre carte en déposant. La RH
        // compare au scan au lieu de tout retaper ; le salarié relit ce
        // qu'il a saisi.
        cinPropose: p.cinPropose ?? null,
        cinDelivreLePropose: p.cinDelivreLePropose ?? null,
        cinDelivreAPropose: p.cinDelivreAPropose ?? null,
      })),
    };
  });

  const obligatoires = lignes.filter((l) => l.obligatoire);
  const fournies = obligatoires.filter((l) => l.statut === "VALIDEE").length;

  return {
    lignes,
    avancement: {
      obligatoires: obligatoires.length,
      fournies,
      // Un pourcentage calculé ici plutôt que dans la page : deux
      // affichages ne doivent pas pouvoir donner deux chiffres.
      pourcentage: obligatoires.length
        ? Math.round((fournies / obligatoires.length) * 100)
        : 100,
      enAttente: lignes.filter((l) => l.statut === "EN_ATTENTE").length,
      refusees: lignes.filter((l) => l.statut === "REFUSEE").length,
      expirees: lignes.filter((l) => l.statut === "EXPIREE").length,
      manquantes: obligatoires.filter((l) => l.statut === "MANQUANTE").length,
    },
  };
}

// ── Les mentions de la carte d'identité ────────────────────────────
//
// Le numéro de CIN est une mention obligatoire des attestations. Il
// était saisi jusqu'ici dans la modale de délivrance, c'est-à-dire au
// seul moment du parcours où personne n'a la carte sous les yeux.
//
// Il se saisit maintenant là où le scan est lu : le salarié propose les
// valeurs en déposant sa pièce, la RH les confirme en la validant. Une
// proposition vit sur la pièce et jamais sur la fiche — sinon un salarié
// se renommerait tout seul.

const CIN_FORMAT = /^\d{8}$/;

function cinLisible(valeur) {
  return String(valeur ?? "").replace(/[\s.-]/g, "");
}

function dateValide(valeur) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valeur);
}

/**
 * Les trois mentions, lues dans le corps de la requête.
 * @returns {{valeurs: object} | {erreur: object}}
 */
function mentionsCin(corps, suffixe = "") {
  const numero = cinLisible(corps.cin);
  if (!numero) return { valeurs: {} };

  if (!CIN_FORMAT.test(numero)) {
    return {
      erreur: erreur(
        "Le numéro de CIN tunisien compte huit chiffres, sans lettre.",
        400
      ),
    };
  }

  const delivreLe = corps.cinDelivreLe
    ? String(corps.cinDelivreLe).slice(0, 10)
    : null;
  if (delivreLe && !dateValide(delivreLe)) {
    return {
      erreur: erreur("La date de délivrance doit être au format AAAA-MM-JJ", 400),
    };
  }
  if (delivreLe && delivreLe > new Date().toISOString().slice(0, 10)) {
    // Une carte délivrée demain n'existe pas : c'est une faute de frappe
    // dans l'année, et elle se retrouverait imprimée sur une attestation.
    return {
      erreur: erreur("La date de délivrance ne peut pas être dans le futur", 400),
    };
  }

  const lieu = corps.cinDelivreA
    ? String(corps.cinDelivreA).trim().slice(0, 80)
    : null;

  return {
    valeurs: {
      [`cin${suffixe}`]: numero,
      ...(delivreLe ? { [`cinDelivreLe${suffixe}`]: delivreLe } : {}),
      ...(lieu ? { [`cinDelivreA${suffixe}`]: lieu } : {}),
    },
  };
}

// ── GET /dossier/mes-pieces ────────────────────────────────────────

async function handlerMesPieces(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const t = await identiteFiche(moi);
  if (t.erreur) return t.erreur;

  const etat = etatDossier(await piecesDe(t.fiche.id));

  return succes({
    employe: {
      id: t.fiche.id,
      nom: `${t.fiche.prenom ?? ""} ${t.fiche.nom ?? ""}`.trim(),
      poste: t.fiche.poste ?? null,
      // Le numéro de CIN vit sur la fiche, pas sur une pièce : c'est une
      // donnée, pas un document. La page l'affiche pour que le salarié
      // voie qu'il manque, parce que son absence bloque la délivrance
      // des attestations.
      cin: t.fiche.cin ?? null,
    },
    ...etat,
    // Les deux catalogues descendent avec la réponse : la page ne
    // redéclare aucune liste, et les références légales n'existent qu'à
    // un seul endroit.
    catalogue: CATALOGUE,
    catalogueDelivres: CATALOGUE_DELIVRES,
  });
}

// ── POST /dossier/pieces ───────────────────────────────────────────

async function handlerDeposer(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const t = await identiteFiche(moi);
  if (t.erreur) return t.erreur;

  const corps = corpsDe(event);
  const type = String(corps.type ?? "").trim();
  const dateExpiration = corps.dateExpiration
    ? String(corps.dateExpiration).slice(0, 10)
    : null;

  if (!typeConnu(type)) {
    return erreur(
      `Type de pièce inconnu : « ${type || "(vide)"} ». `
      + `Types acceptés : ${Object.keys(CATALOGUE).join(", ")}.`,
      400
    );
  }

  if (exigeEcheance(type) && !dateExpiration) {
    return erreur(
      `${CATALOGUE[type].libelle} porte une date de validité. `
      + `Indiquez-la : sans elle, impossible de vous prévenir avant qu'elle expire.`,
      400
    );
  }
  if (dateExpiration && !/^\d{4}-\d{2}-\d{2}$/.test(dateExpiration)) {
    return erreur("La date de validité doit être au format AAAA-MM-JJ", 400);
  }
  if (dateExpiration && dateExpiration < new Date().toISOString().slice(0, 10)) {
    return erreur("La date de validité est déjà passée", 400);
  }

  // ── Le fichier ──
  const mime = String(corps.typeMime ?? "").toLowerCase();
  const extension = TYPES_FICHIER[mime];
  if (!extension) {
    return erreur(
      `Format refusé : ${mime || "inconnu"}. Acceptés : PDF, JPEG, PNG.`,
      400
    );
  }

  const base64 = String(corps.fichier ?? "").replace(/^data:[^,]+,/, "");
  if (!base64) return erreur("Aucun fichier reçu", 400);

  let binaire;
  try {
    binaire = Buffer.from(base64, "base64");
  } catch {
    return erreur("Le fichier est illisible", 400);
  }
  if (binaire.length === 0) return erreur("Le fichier est vide", 400);
  if (binaire.length > TAILLE_MAX) {
    return erreur(
      `Le fichier pèse ${(binaire.length / 1024 / 1024).toFixed(1)} Mo, `
      + `la limite est de ${TAILLE_MAX / 1024 / 1024} Mo.`,
      400
    );
  }

  // Les mentions proposées par le salarié. Suffixées `Propose` : elles
  // n'entrent sur la fiche que lorsque la RH les confirme.
  const propose = type === "CIN" ? mentionsCin(corps, "Propose") : { valeurs: {} };
  if (propose.erreur) return propose.erreur;

  const id = randomUUID();
  const cle = `dossier/${t.fiche.id}/${type}/${id}.${extension}`;

  // S3 d'abord, DynamoDB ensuite : une ligne qui pointe vers un fichier
  // absent donnerait un bouton de téléchargement qui échoue. L'inverse
  // ne laisse qu'un fichier orphelin, invisible et sans conséquence.
  await s3.send(new PutObjectCommand({
    Bucket: SEAU,
    Key: cle,
    Body: binaire,
    ContentType: mime,
  }));

  const piece = {
    employeId: t.fiche.id,
    cleTri: cleTri(type, id),
    id,
    type,
    statut: "EN_ATTENTE",
    s3Cle: cle,
    nomFichier: String(corps.nomFichier ?? `${type}.${extension}`).slice(0, 180),
    typeMime: mime,
    taille: binaire.length,
    deposeLe: new Date().toISOString(),
    deposeParEmail: moi.email ?? null,
    ...(dateExpiration ? { dateExpiration } : {}),
    ...propose.valeurs,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_PIECES, Item: piece }));

  return succes({
    message: `${CATALOGUE[type].libelle} déposée. La RH la validera.`,
    piece: { id, type, statut: "EN_ATTENTE", deposeLe: piece.deposeLe },
  }, 201);
}

// ── GET /dossier/pieces/:id/fichier ────────────────────────────────

async function handlerFichier(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const pieceId = event.pathParameters?.id;
  if (!pieceId) return erreur("Identifiant de pièce manquant", 400);

  // Le propriétaire de la pièce, ou la RH. On résout d'abord la fiche de
  // l'appelant : sans elle, un salarié pourrait lire la pièce d'un autre
  // en devinant un identifiant.
  const employeId = event.queryStringParameters?.employeId;

  let proprietaireId;
  if (estRh(moi) && employeId) {
    proprietaireId = employeId;
  } else {
    const t = await identiteFiche(moi);
    if (t.erreur) return t.erreur;
    proprietaireId = t.fiche.id;
  }

  const pieces = await piecesDe(proprietaireId);
  const piece = pieces.find((p) => p.id === pieceId);

  if (!piece) {
    return erreur(
      estRh(moi) && employeId
        ? `Aucune pièce ${pieceId} dans le dossier de cet employé.`
        : `Aucune pièce ${pieceId} dans votre dossier.`,
      404
    );
  }

  const objet = await s3.send(new GetObjectCommand({
    Bucket: SEAU, Key: piece.s3Cle,
  }));
  const octets = Buffer.from(await objet.Body.transformToByteArray());

  return {
    statusCode: 200,
    headers: {
      "Content-Type": piece.typeMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${piece.nomFichier}"`,
    },
    body: octets.toString("base64"),
    isBase64Encoded: true,
  };
}

// ── GET /dossier/employes/:employeId/pieces  (RH) ──────────────────

async function handlerDossierEmploye(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const employeId = event.pathParameters?.employeId;
  if (!employeId) return erreur("Identifiant de l'employé manquant", 400);

  const { Item: fiche } = await docClient.send(new GetCommand({
    TableName: TABLE_EMPLOYES, Key: { id: employeId },
  }));
  if (!fiche) return erreur(`Aucune fiche employé ${employeId}`, 404);

  const etat = etatDossier(await piecesDe(employeId));

  return succes({
    employe: {
      id: fiche.id,
      nom: `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim(),
      poste: fiche.poste ?? null,
      departement: fiche.departement ?? null,
      email: fiche.email ?? null,
      cin: fiche.cin ?? null,
      cinDelivreLe: fiche.cinDelivreLe ?? null,
      cinDelivreA: fiche.cinDelivreA ?? null,
      // La trace de la vérification : la page affiche « relevé le … par
      // … », ce qui évite de redemander un numéro déjà contrôlé.
      cinVerifieLe: fiche.cinVerifieLe ?? null,
      cinVerifiePar: fiche.cinVerifiePar ?? null,
    },
    ...etat,
    catalogue: CATALOGUE,
  });
}

// ── PUT /dossier/pieces/:id  (RH valide ou refuse) ─────────────────

async function handlerTraiter(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const pieceId = event.pathParameters?.id;
  const corps = corpsDe(event);
  const employeId = String(corps.employeId ?? "").trim();
  const decision = String(corps.statut ?? "").trim().toUpperCase();
  const commentaire = String(corps.commentaireRH ?? "").trim();

  if (!pieceId || !employeId) {
    return erreur("employeId et l'identifiant de la pièce sont requis", 400);
  }
  if (!["VALIDEE", "REFUSEE"].includes(decision)) {
    return erreur("La décision doit être VALIDEE ou REFUSEE", 400);
  }
  if (decision === "REFUSEE" && !commentaire) {
    // Un refus sans motif oblige le salarié à redéposer au hasard.
    return erreur("Un refus doit porter un motif : le salarié doit savoir quoi corriger", 400);
  }

  const pieces = await piecesDe(employeId);
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return erreur(`Aucune pièce ${pieceId} dans ce dossier`, 404);

  // Valider une carte d'identité sans relever son numéro laisse le
  // dossier dans l'état même qu'on cherche à corriger : la pièce est
  // verte, et aucune attestation ne sort. On le relève donc ici, le seul
  // endroit où le scan et le champ sont au même écran.
  let mentions = { valeurs: {} };
  if (piece.type === "CIN" && decision === "VALIDEE") {
    mentions = mentionsCin(corps);
    if (mentions.erreur) return mentions.erreur;

    // Les TROIS mentions, et pas seulement le numéro. `pdf.js` refuse
    // de produire la moindre attestation sans la date et le lieu de
    // délivrance :
    //
    //   if (!employe?.cin || !employe?.cinDelivreLe || !employe?.cinDelivreA)
    //     throw new Error("… sont requis pour générer une attestation.");
    //
    // N'exiger que le numéro laisserait la RH valider, croire que c'est
    // réglé, et découvrir l'échec au moment d'éditer le document — avec
    // une erreur qui ne dit pas où le corriger.
    const manque = [];
    if (!mentions.valeurs.cin) manque.push("le numéro");
    if (!mentions.valeurs.cinDelivreLe) manque.push("la date de délivrance");
    if (!mentions.valeurs.cinDelivreA) manque.push("le lieu de délivrance");

    if (manque.length > 0) {
      const { Item: fiche } = await docClient.send(new GetCommand({
        TableName: TABLE_EMPLOYES, Key: { id: employeId },
      }));
      const ficheComplete = !!(fiche?.cin && fiche?.cinDelivreLe && fiche?.cinDelivreA);

      if (!ficheComplete) {
        const liste = manque.length === 1
          ? manque[0]
          : `${manque.slice(0, -1).join(", ")} et ${manque[manque.length - 1]}`;
        return erreur(
          `Relevez ${liste} avant de valider : les trois mentions sont `
          + `obligatoires pour délivrer une attestation, et c'est ici que `
          + `le scan est sous vos yeux.`,
          400
        );
      }
    }
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLE_PIECES,
    Key: { employeId, cleTri: piece.cleTri },
    UpdateExpression:
      "SET statut = :s, commentaireRH = :c, valideePar = :p, valideeLe = :t",
    ExpressionAttributeValues: {
      ":s": decision,
      ":c": commentaire || null,
      ":p": moi.email ?? "RH",
      ":t": new Date().toISOString(),
    },
    // Sans cette condition, un identifiant erroné CRÉERAIT une ligne :
    // UpdateItem est un upsert.
    ConditionExpression: "attribute_exists(employeId)",
  }));

  // La pièce d'abord, la fiche ensuite. Si l'écriture de la fiche
  // échoue, la pièce est validée et le numéro manque — état visible et
  // rattrapable. L'inverse donnerait un numéro sur la fiche sans pièce
  // validée pour le justifier, ce qui est une donnée sans source.
  // Les trois ensemble : écrire le seul numéro mettrait `null` dans la
  // date et le lieu, et effacerait des mentions déjà vérifiées.
  if (mentions.valeurs.cin && mentions.valeurs.cinDelivreLe
      && mentions.valeurs.cinDelivreA) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_EMPLOYES,
      Key: { id: employeId },
      UpdateExpression:
        "SET cin = :cin, cinDelivreLe = :le, cinDelivreA = :lieu, "
        + "cinVerifieLe = :quand, cinVerifiePar = :qui",
      ExpressionAttributeValues: {
        ":cin": mentions.valeurs.cin,
        ":le": mentions.valeurs.cinDelivreLe,
        ":lieu": mentions.valeurs.cinDelivreA,
        // Qui a recopié, et quand. Une donnée d'identité sans trace de
        // vérification ne vaut rien devant un contrôle.
        ":quand": new Date().toISOString(),
        ":qui": moi.email ?? "RH",
      },
      ConditionExpression: "attribute_exists(id)",
    }));
  }

  return succes({
    message: decision === "VALIDEE"
      ? `${CATALOGUE[piece.type]?.libelle ?? "Pièce"} validée.`
      : `${CATALOGUE[piece.type]?.libelle ?? "Pièce"} refusée, motif transmis au salarié.`,
  });
}

// ── GET /dossier/a-valider  (RH) ───────────────────────────────────

async function handlerAValider(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const { Items } = await docClient.send(new QueryCommand({
    TableName: TABLE_PIECES,
    IndexName: INDEX_STATUT,
    KeyConditionExpression: "statut = :s",
    ExpressionAttributeValues: { ":s": "EN_ATTENTE" },
    ScanIndexForward: false,
  }));

  // Le nom de l'employé est lu fiche par fiche plutôt que recopié dans la
  // pièce : un nom recopié devient faux au premier changement d'état civil.
  const parEmploye = new Map();
  for (const p of Items || []) {
    if (!parEmploye.has(p.employeId)) parEmploye.set(p.employeId, []);
    parEmploye.get(p.employeId).push(p);
  }

  const dossiers = [];
  for (const [employeId, liste] of parEmploye) {
    const { Item: fiche } = await docClient.send(new GetCommand({
      TableName: TABLE_EMPLOYES, Key: { id: employeId },
    }));
    dossiers.push({
      employeId,
      nom: fiche ? `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim() : "(fiche supprimée)",
      poste: fiche?.poste ?? null,
      pieces: liste.map((p) => ({
        id: p.id, type: p.type, nomFichier: p.nomFichier,
        deposeLe: p.deposeLe, taille: p.taille,
        // Ce que le salarié a lu sur sa propre carte : la RH n'a plus
        // qu'à comparer au scan au lieu de tout retaper.
        cinPropose: p.cinPropose ?? null,
        cinDelivreLePropose: p.cinDelivreLePropose ?? null,
        cinDelivreAPropose: p.cinDelivreAPropose ?? null,
      })),
    });
  }

  return succes({
    dossiers: dossiers.sort((a, b) => a.nom.localeCompare(b.nom)),
    total: (Items || []).length,
  });
}

// ── Pannes prévisibles ─────────────────────────────────────────────

function pannePrevisible(e) {
  if (e.name === "ResourceNotFoundException") {
    return erreur(
      `La table ${TABLE_PIECES} est introuvable. Lancez `
      + `creer-table-pieces-dossier.js, qui la crée avec son index. Si elle `
      + `porte un autre nom chez vous, déclarez TABLE_PIECES_DOSSIER.`,
      503
    );
  }
  if (e.name === "NoSuchBucket" || e.name === "NotFound") {
    return erreur(
      `Le seau S3 « ${SEAU} » est introuvable. Vérifiez DOCUMENTS_BUCKET.`,
      503
    );
  }
  if (e.name === "AccessDenied" || e.name === "AccessDeniedException") {
    return erreur(
      `Accès refusé par AWS sur ${SEAU}. La politique IAM doit autoriser `
      + `s3:PutObject et s3:GetObject sur arn:aws:s3:::${SEAU}/dossier/*.`,
      503
    );
  }
  return null;
}

function protege(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      const panne = pannePrevisible(e);
      if (panne) {
        console.error(`[dossier] ${e.name} : ${e.message}`);
        return panne;
      }
      throw e;
    }
  };
}

module.exports = {
  handlerMesPieces: protege(handlerMesPieces),
  handlerDeposer: protege(handlerDeposer),
  handlerFichier: protege(handlerFichier),
  handlerDossierEmploye: protege(handlerDossierEmploye),
  handlerTraiter: protege(handlerTraiter),
  handlerAValider: protege(handlerAValider),
  // Exportés pour les tests
  etatDossier, statutEffectif, piecesDe, cleTri, typeDe, mentionsCin,
  TABLE_PIECES, INDEX_STATUT, STATUTS,
};