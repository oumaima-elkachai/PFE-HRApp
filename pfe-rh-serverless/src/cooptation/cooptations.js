// src/cooptation/cooptations.js
//
// Cooptation : un salarié recommande quelqu'un, et touche une prime si
// la personne est recrutée.
//
// ── Pourquoi c'est un objet, et pas un courriel ─────────────────────
//
// Une recommandation faite de vive voix ou par message ne laisse rien.
// Six mois plus tard, personne ne sait qui a amené qui, et la prime se
// discute de mémoire. Ici la recommandation porte son auteur, sa date,
// le candidat, le motif, puis la décision et le montant accordé.
//
// ── Qui touche la prime ─────────────────────────────────────────────
//
// Le PARRAIN, c'est-à-dire le salarié qui recommande. Jamais le
// candidat : majorer le salaire d'embauche d'une personne parce
// qu'elle a été recommandée creuserait un écart de rémunération fondé
// sur le réseau et non sur le poste, ce qui est précisément ce qu'une
// grille salariale sert à éviter.
//
// ── Le montant n'est pas automatique ────────────────────────────────
//
// La RH fixe le montant et le mois de versement, au cas par cas. Une
// règle automatique — « 500 dinars par recrutement » — paraît plus
// simple et ne l'est pas : la valeur d'une cooptation dépend du poste,
// de sa difficulté à pourvoir et de l'implication du parrain. Le
// module enregistre la décision, il ne la prend pas.
//
// ── Ce que le salarié doit confirmer ────────────────────────────────
//
// Recommander quelqu'un, c'est transmettre à son employeur le nom,
// l'adresse et parfois le CV d'une personne qui n'est pas partie à la
// relation de travail. C'est un traitement de données personnelles au
// sens de la loi organique n° 2004-63, et la personne concernée a le
// droit de savoir.
//
// Le formulaire exige donc une confirmation explicite : le parrain
// déclare avoir prévenu la personne. Ce n'est pas une formalité — sans
// elle, l'entreprise constitue un fichier de candidats qui ignorent
// qu'ils y figurent.

const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const documents = require("../services/documents");
const notifications = require("../utils/notification");

const TABLE_COOPTATIONS = process.env.TABLE_COOPTATIONS || "Cooptations-local";

// Même configuration que le stockage des bulletins : un seau si la
// variable existe, sinon un dossier local pour le développement.
const BUCKET = process.env.DOCUMENTS_BUCKET;
const s3 = BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

const INDEX_PARRAIN = "parrain-index";
const INDEX_STATUT = "statut-index";

// ── États ───────────────────────────────────────────────────────────

const ENVOYEE = "ENVOYEE";     // le parrain a transmis, la RH n'a rien dit
const EN_COURS = "EN_COURS";   // la RH examine, un entretien est peut-être prévu
const RECRUTEE = "RECRUTEE";   // la personne a été embauchée
const ECARTEE = "ECARTEE";     // la candidature n'a pas abouti

const STATUTS = [ENVOYEE, EN_COURS, RECRUTEE, ECARTEE];

const PRIME_AUCUNE = "AUCUNE";
const PRIME_ACCORDEE = "ACCORDEE";
const PRIME_VERSEE = "VERSEE";

// Lien du parrain avec la personne recommandée. Ce n'est pas
// décoratif : la RH lit une recommandation très différemment selon
// qu'elle vient d'un ancien collègue de travail ou d'un inconnu
// repéré sur un réseau professionnel.
const RELATIONS = {
  ANCIEN_COLLEGUE: "Ancien collègue",
  ETUDES: "Rencontré pendant mes études",
  CONNAISSANCE: "Connaissance personnelle",
  RESEAU: "Repéré sur un réseau professionnel",
  AUTRE: "Autre",
};

const FORMAT_MOIS = /^\d{4}-\d{2}$/;

const normaliserEmail = (v) => String(v ?? "").trim().toLowerCase();

/** Même règle que partout ailleurs : rôle porté par le jeton. */
const estRH = (moi) => estRole(moi, "RH");

// ── Lectures ────────────────────────────────────────────────────────

async function parParrain(parrainId) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_COOPTATIONS,
    IndexName: INDEX_PARRAIN,
    KeyConditionExpression: "parrainId = :p",
    ExpressionAttributeValues: { ":p": parrainId },
    ScanIndexForward: false,
  }));
  return res.Items ?? [];
}

async function parStatut(statut) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_COOPTATIONS,
    IndexName: INDEX_STATUT,
    KeyConditionExpression: "statut = :s",
    ExpressionAttributeValues: { ":s": statut },
    ScanIndexForward: false,
  }));
  return res.Items ?? [];
}

/**
 * Toutes les recommandations, par parcours paginé.
 *
 * Quatre requêtes sur l'index des statuts coûteraient moins cher, mais
 * manqueraient toute recommandation dont le statut serait absent ou
 * mal orthographié — exactement le genre de ligne qu'on cherche quand
 * on consulte la liste complète.
 */
async function toutes() {
  const items = [];
  let suite;

  do {
    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_COOPTATIONS,
      ExclusiveStartKey: suite,
    }));
    items.push(...(res.Items ?? []));
    suite = res.LastEvaluatedKey;
  } while (suite);

  return items;
}

/**
 * Autres recommandations visant la même personne.
 *
 * Deux salariés peuvent recommander le même candidat. C'est un cas
 * fréquent et une source de litige sur la prime : la RH doit le voir
 * AVANT de décider, pas après.
 */
async function autresPour(email, saufId) {
  if (!email) return [];

  const liste = await toutes();
  return liste.filter(
    (c) => c.id !== saufId && normaliserEmail(c.candidatEmail) === normaliserEmail(email)
  );
}

// ── Proposer ────────────────────────────────────────────────────────

/**
 * POST /cooptations
 *
 * Corps : { candidatNom, candidatEmail, candidatTelephone, relation,
 *           commentaire, offreId, offreTitre, candidatPrevenu }
 *
 * @param fichier  CV joint, posé par le routeur (multipart)
 */
exports.proposer = async (event, fichier) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) {
      return erreur(
        `Aucune fiche employé n'est rattachée au compte ${moi.email}. `
        + "La cooptation est réservée aux salariés.",
        404
      );
    }

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const candidatNom = String(corps.candidatNom ?? "").trim();
    const candidatEmail = normaliserEmail(corps.candidatEmail);
    const commentaire = String(corps.commentaire ?? "").trim();
    const relation = RELATIONS[corps.relation] ? corps.relation : "AUTRE";

    if (candidatNom.length < 3) {
      return erreur("Indiquez le nom et le prénom de la personne", 400);
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidatEmail)) {
      return erreur("L'adresse e-mail de la personne est invalide", 400);
    }

    // Le motif est ce sur quoi la RH se décide. Une recommandation sans
    // motif ne vaut pas mieux qu'un CV reçu par la boîte générique, et
    // elle ne mérite alors aucune prime.
    if (commentaire.length < 20) {
      return erreur(
        "Expliquez en quelques mots pourquoi vous recommandez cette personne. "
        + "C'est sur ce motif que les ressources humaines se décideront.",
        400
      );
    }

    // ── Consentement de la personne recommandée ──
    //
    // Refusé en 400 et non ignoré : transmettre les coordonnées de
    // quelqu'un à son employeur sans l'en avoir informé constitue un
    // traitement de données personnelles à son insu.
    if (corps.candidatPrevenu !== true && corps.candidatPrevenu !== "true") {
      return erreur(
        "Confirmez que vous avez prévenu cette personne de votre recommandation. "
        + "Ses coordonnées ne peuvent pas être transmises à son insu.",
        400
      );
    }

    // On ne se recommande pas soi-même.
    if (candidatEmail === normaliserEmail(fiche.email)
      || candidatEmail === normaliserEmail(moi.email)) {
      return erreur("Vous ne pouvez pas vous recommander vous-même", 400);
    }

    // Deux fois la même personne par le même parrain : la seconde
    // n'apporte rien et dédoublerait la prime.
    const siennes = await parParrain(fiche.id);
    const deja = siennes.find(
      (c) => normaliserEmail(c.candidatEmail) === candidatEmail
        && c.statut !== ECARTEE
    );

    if (deja) {
      return erreur(
        `Vous avez déjà recommandé ${deja.candidatNom} le `
        + `${String(deja.creeLe).slice(0, 10)}. Cette recommandation est `
        + "toujours en cours.",
        409
      );
    }

    // Le CV est écrit avant la recommandation : un fichier orphelin se
    // nettoie, une recommandation privée de son CV ne se répare pas.
    let cvKey = null;
    let cvNom = null;

    if (fichier?.buffer?.length) {
      cvKey = await documents.stockerCv(fichier, "cooptations");
      cvNom = fichier.originalname;
    }

    const cooptation = {
      id: randomUUID(),

      parrainId: fiche.id,
      parrainNom: employes.nomComplet(fiche, moi),
      parrainEmail: fiche.email,

      candidatNom,
      candidatEmail,
      candidatTelephone: String(corps.candidatTelephone ?? "").trim() || null,
      cvKey,
      cvNom,

      relation,
      relationLibelle: RELATIONS[relation],
      commentaire: commentaire.slice(0, 2000),

      // Une recommandation peut viser une offre précise ou être
      // spontanée. Les deux sont légitimes : la seconde alimente le
      // vivier pour les ouvertures à venir.
      offreId: corps.offreId || null,
      offreTitre: corps.offreTitre || null,
      spontanee: !corps.offreId,

      statut: ENVOYEE,
      candidatureId: null,

      primeStatut: PRIME_AUCUNE,
      primeMontant: null,
      primeMois: null,
      primeAccordeeLe: null,
      primeAccordeePar: null,
      primeVerseeLe: null,
      primeBulletin: null,

      candidatPrevenu: true,
      creeLe: new Date().toISOString(),
      decideLe: null,
      decidePar: null,
      commentaireRH: null,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_COOPTATIONS,
      Item: cooptation,
    }));

    void notifications.notifier({
      role: "RH",
      type: "COOPTATION",
      titre: "Nouvelle recommandation",
      message: `${cooptation.parrainNom} recommande ${candidatNom}`
        + (cooptation.offreTitre ? ` pour le poste de ${cooptation.offreTitre}` : ""),
      metadata: { cooptationId: cooptation.id },
    });

    return succes({
      cooptation,
      message: "Recommandation transmise aux ressources humaines.",
    }, 201);

  } catch (e) {
    console.error("Erreur proposition de cooptation:", e);
    return erreur("Impossible d'enregistrer la recommandation");
  }
};

// ── Consulter ───────────────────────────────────────────────────────

/**
 * GET /cooptations?statut=
 *
 * Un salarié ne voit que les siennes. La restriction passe par la clé
 * de partition de l'index, pas par un filtre d'affichage : il n'existe
 * aucun chemin de code renvoyant celles d'autrui.
 */
exports.lister = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters ?? {};

    if (!estRH(moi)) {
      const fiche = await employes.courant(moi);
      if (!fiche) return succes({ cooptations: [], total: 0 });

      const liste = await parParrain(fiche.id);

      // Le salarié voit l'état de ses recommandations et le montant de
      // sa prime — c'est sa rémunération. Il ne voit pas les
      // commentaires internes de la RH sur le candidat.
      return succes({
        cooptations: liste.map(({ commentaireRH, ...reste }) => reste),
        total: liste.length,
      });
    }

    const statut = params.statut ? String(params.statut).toUpperCase() : null;

    const liste = statut && STATUTS.includes(statut)
      ? await parStatut(statut)
      : await toutes();

    liste.sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));

    return succes({ cooptations: liste, total: liste.length });

  } catch (e) {
    console.error("Erreur liste des cooptations:", e);
    return erreur("Impossible de lire les recommandations");
  }
};

/**
 * GET /cooptations/:id — réservé à la RH
 *
 * Renvoie aussi les autres recommandations visant la même personne :
 * c'est ce qui permet de trancher une prime disputée en connaissance
 * de cause.
 */
exports.detail = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRH(moi)) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant manquant", 400);

    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_COOPTATIONS,
      Key: { id },
    }));

    if (!lu.Item) return erreur("Recommandation introuvable", 404);

    const autres = await autresPour(lu.Item.candidatEmail, id);

    return succes({
      cooptation: lu.Item,
      autresRecommandations: autres.map((c) => ({
        id: c.id,
        parrainNom: c.parrainNom,
        creeLe: c.creeLe,
        statut: c.statut,
        primeStatut: c.primeStatut,
      })),
    });

  } catch (e) {
    console.error("Erreur détail de cooptation:", e);
    return erreur("Impossible de lire la recommandation");
  }
};

/**
 * GET /cooptations/:id/cv — réservé à la RH
 *
 * Même forme que `demandes.telecharger` : on ne renvoie pas une
 * réponse HTTP mais la clé du fichier et le nom à donner au
 * téléchargement. C'est le routeur qui va chercher l'octet et le
 * pousse au navigateur, exactement comme pour les attestations.
 *
 * Le CV n'est jamais exposé au salarié qui a recommandé, même si
 * c'est lui qui l'a déposé : une fois transmis, le dossier appartient
 * au candidat et à la RH.
 */
exports.telechargerCv = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRH(moi)) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant manquant", 400);

    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_COOPTATIONS,
      Key: { id },
    }));

    if (!lu.Item) return erreur("Recommandation introuvable", 404);
    if (!lu.Item.cvKey) return erreur("Aucun CV joint à cette recommandation", 404);

    const corps = await lireFichier(lu.Item.cvKey);
    if (!corps) return erreur("Le CV n'est plus disponible", 404);

    // Le nom d'origine peut être « doc1.pdf ». Six mois plus tard,
    // dans un dossier de téléchargements, ça ne veut plus rien dire.
    const extension = String(lu.Item.cvNom || "").split(".").pop().toLowerCase();
    const connue = TYPES_FICHIER[extension];

    return {
      corps,
      nom: `CV - ${lu.Item.candidatNom}.${connue ? extension : "pdf"}`,
      type: connue || "application/pdf",
    };

  } catch (e) {
    console.error("Erreur téléchargement du CV de cooptation:", e);
    return erreur("Impossible de récupérer le CV");
  }
};

const TYPES_FICHIER = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * Relit un fichier déposé, du seau ou du disque.
 *
 * Miroir exact de ce que fait `stockerPdf` à l'écriture : si
 * DOCUMENTS_BUCKET existe on passe par S3, sinon par `tmp/`. Renvoie
 * null quand le fichier a disparu — un CV effacé du seau ne doit pas
 * faire tomber la fiche entière.
 */
async function lireFichier(cle) {
  try {
    if (s3) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
      return Buffer.from(await obj.Body.transformToByteArray());
    }
    return await fs.readFile(path.join(process.cwd(), "tmp", cle));
  } catch (e) {
    console.error(`CV introuvable au stockage (${cle}) :`, e.name || e);
    return null;
  }
}

// ── Décider ─────────────────────────────────────────────────────────

/**
 * PATCH /cooptations/:id — réservé à la RH
 *
 * Corps : { statut, commentaire, candidatureId }
 */
exports.decider = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRH(moi)) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant manquant", 400);

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const statut = String(corps.statut ?? "").toUpperCase();
    if (!STATUTS.includes(statut)) {
      return erreur(`statut doit valoir : ${STATUTS.join(", ")}`, 400);
    }

    const commentaire = String(corps.commentaire ?? "").trim();

    // Un refus sans explication laisse le parrain sans réponse, et
    // décourage la recommandation suivante.
    if (statut === ECARTEE && commentaire.length < 3) {
      return erreur("Expliquez brièvement pourquoi la candidature n'aboutit pas", 400);
    }

    const maintenant = new Date().toISOString();

    let majour;
    try {
      majour = await docClient.send(new UpdateCommand({
        TableName: TABLE_COOPTATIONS,
        Key: { id },
        UpdateExpression:
          "SET statut = :s, decideLe = :d, decidePar = :p, commentaireRH = :c"
          + (corps.candidatureId ? ", candidatureId = :cand" : ""),
        ConditionExpression: "attribute_exists(id)",
        ExpressionAttributeValues: {
          ":s": statut,
          ":d": maintenant,
          ":p": moi.email ?? moi.sub ?? "RH",
          ":c": commentaire || null,
          ...(corps.candidatureId ? { ":cand": corps.candidatureId } : {}),
        },
        ReturnValues: "ALL_NEW",
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur("Recommandation introuvable", 404);
      }
      throw e;
    }

    const cooptation = majour.Attributes;

    const texte = {
      [EN_COURS]: "Votre recommandation est à l'étude",
      [RECRUTEE]: "La personne que vous avez recommandée est recrutée",
      [ECARTEE]: "Votre recommandation n'a pas abouti",
      [ENVOYEE]: "Votre recommandation a été reçue",
    }[statut];

    void notifications.notifier({
      employeId: cooptation.parrainId,
      type: "COOPTATION_TRAITEE",
      titre: texte,
      message: `${cooptation.candidatNom}`
        + (commentaire ? ` — ${commentaire}` : ""),
      metadata: { cooptationId: cooptation.id, statut },
    });

    return succes({
      cooptation,
      message: statut === RECRUTEE
        ? "Recrutement enregistré. Vous pouvez maintenant accorder la prime."
        : "Décision enregistrée.",
    });

  } catch (e) {
    console.error("Erreur décision de cooptation:", e);
    return erreur("Impossible d'enregistrer la décision");
  }
};

// ── Accorder la prime ───────────────────────────────────────────────

/**
 * POST /cooptations/:id/prime — réservé à la RH
 *
 * Corps : { montant, mois }   mois au format « AAAA-MM »
 *
 * La prime n'est pas versée ici : elle est DUE. Le versement se fait à
 * la génération du bulletin du mois indiqué, et c'est seulement là
 * qu'elle devient VERSEE. Séparer les deux permet d'accorder une prime
 * en novembre pour le bulletin de décembre, et rend la régénération
 * d'un bulletin reproductible.
 */
exports.accorderPrime = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRH(moi)) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant manquant", 400);

    const corps = typeof event.body === "string"
      ? JSON.parse(event.body) : (event.body || {});

    const montant = Number(corps.montant);
    const mois = String(corps.mois ?? "").trim();

    if (!Number.isFinite(montant) || montant <= 0) {
      return erreur("Le montant de la prime doit être un nombre positif", 400);
    }

    if (!FORMAT_MOIS.test(mois)) {
      return erreur("Le mois de versement doit être au format AAAA-MM", 400);
    }

    const lu = await docClient.send(new GetCommand({
      TableName: TABLE_COOPTATIONS,
      Key: { id },
    }));

    const cooptation = lu.Item;
    if (!cooptation) return erreur("Recommandation introuvable", 404);

    if (cooptation.statut !== RECRUTEE) {
      return erreur(
        "La prime ne peut être accordée qu'une fois la personne recrutée. "
        + `Cette recommandation est au statut ${cooptation.statut}.`,
        409
      );
    }

    // Une prime déjà versée est sur un bulletin émis : la modifier
    // rendrait ce bulletin faux sans que personne ne le voie.
    if (cooptation.primeStatut === PRIME_VERSEE) {
      return erreur(
        `Cette prime a déjà été versée sur le bulletin ${cooptation.primeBulletin ?? ""} `
        + "du mois " + cooptation.primeMois + ". "
        + "Pour la corriger, passez par une régularisation de paie.",
        409
      );
    }

    const maintenant = new Date().toISOString();

    const majour = await docClient.send(new UpdateCommand({
      TableName: TABLE_COOPTATIONS,
      Key: { id },
      UpdateExpression:
        "SET primeStatut = :ps, primeMontant = :m, primeMois = :mois, "
        + "primeAccordeeLe = :d, primeAccordeePar = :p",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: {
        ":ps": PRIME_ACCORDEE,
        ":m": montant,
        ":mois": mois,
        ":d": maintenant,
        ":p": moi.email ?? moi.sub ?? "RH",
      },
      ReturnValues: "ALL_NEW",
    }));

    void notifications.notifier({
      employeId: cooptation.parrainId,
      type: "COOPTATION_PRIME",
      titre: "Prime de cooptation accordée",
      message: `${montant.toFixed(3)} TND pour la recommandation de `
        + `${cooptation.candidatNom}, sur votre bulletin de ${mois}.`,
      metadata: { cooptationId: id, montant, mois },
    });

    return succes({
      cooptation: majour.Attributes,
      message: `Prime de ${montant.toFixed(3)} TND accordée, `
        + `à verser sur le bulletin de ${mois}.`,
    });

  } catch (e) {
    console.error("Erreur attribution de prime:", e);
    return erreur("Impossible d'accorder la prime");
  }
};

// ── Interface avec la paie ──────────────────────────────────────────

/**
 * Primes de cooptation à porter sur un bulletin.
 *
 * ── Pourquoi les primes DÉJÀ versées sont incluses ──────────────────
 *
 * On pourrait ne rendre que les primes au statut ACCORDEE, et les
 * passer à VERSEE une fois le bulletin écrit. Régénérer ce même
 * bulletin — ce qui arrive, pour corriger une absence ou un taux —
 * ne retrouverait alors plus la prime, et le nouveau bulletin serait
 * inférieur à l'original sans que rien ne l'explique.
 *
 * On retient donc toute prime affectée à CE mois, accordée ou déjà
 * versée. Le calcul redevient une fonction de son mois, donc
 * reproductible.
 *
 * @returns {Promise<{ total: number, lignes: object[] }>}
 */
async function primesDues(parrainId, mois) {
  if (!parrainId || !FORMAT_MOIS.test(String(mois ?? ""))) {
    return { total: 0, lignes: [] };
  }

  try {
    const liste = await parParrain(parrainId);

    const retenues = liste.filter(
      (c) => c.primeMois === mois
        && (c.primeStatut === PRIME_ACCORDEE || c.primeStatut === PRIME_VERSEE)
        && Number.isFinite(Number(c.primeMontant))
    );

    return {
      total: retenues.reduce((s, c) => s + Number(c.primeMontant), 0),
      lignes: retenues.map((c) => ({
        id: c.id,
        candidatNom: c.candidatNom,
        montant: Number(c.primeMontant),
        accordeeLe: c.primeAccordeeLe,
      })),
    };
  } catch (e) {
    // Une prime manquante sur un bulletin se voit et se corrige ; un
    // bulletin qui ne se génère pas bloque la paie du mois.
    console.error("Lecture des primes de cooptation impossible :", e);
    return { total: 0, lignes: [] };
  }
}

/**
 * Marque les primes comme versées, une fois le bulletin écrit.
 *
 * Appelée APRÈS l'écriture du bulletin, jamais avant : marquée en
 * amont, une prime passerait à VERSEE même si la génération échouait
 * ensuite, et elle disparaîtrait du bulletin suivant.
 *
 * N'échoue jamais : le bulletin est déjà émis, et une marque
 * manquante se rattrape, alors qu'une erreur remontée ici annulerait
 * une paie correcte.
 */
async function marquerVersees(lignes, reference) {
  let marquees = 0;

  for (const ligne of lignes ?? []) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_COOPTATIONS,
        Key: { id: ligne.id },
        UpdateExpression:
          "SET primeStatut = :v, primeVerseeLe = :d, primeBulletin = :b",
        // Ne repasse pas sur une prime déjà versée : la date et le
        // numéro de bulletin de l'original doivent être conservés.
        ConditionExpression: "primeStatut = :accordee",
        ExpressionAttributeValues: {
          ":v": PRIME_VERSEE,
          ":d": new Date().toISOString(),
          ":b": reference ?? null,
          ":accordee": PRIME_ACCORDEE,
        },
      }));
      marquees += 1;
    } catch (e) {
      if (e.name !== "ConditionalCheckFailedException") {
        console.error(`Prime ${ligne.id} non marquée versée :`, e.message);
      }
    }
  }

  return marquees;
}

module.exports.primesDues = primesDues;
module.exports.marquerVersees = marquerVersees;
module.exports.autresPour = autresPour;

module.exports.ENVOYEE = ENVOYEE;
module.exports.EN_COURS = EN_COURS;
module.exports.RECRUTEE = RECRUTEE;
module.exports.ECARTEE = ECARTEE;
module.exports.STATUTS = STATUTS;
module.exports.RELATIONS = RELATIONS;
module.exports.PRIME_AUCUNE = PRIME_AUCUNE;
module.exports.PRIME_ACCORDEE = PRIME_ACCORDEE;
module.exports.PRIME_VERSEE = PRIME_VERSEE;
module.exports.TABLE_COOPTATIONS = TABLE_COOPTATIONS;