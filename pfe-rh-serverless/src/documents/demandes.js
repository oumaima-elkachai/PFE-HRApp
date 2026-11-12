// src/documents/demandes.js
//
// Demandes de documents administratifs : attestation de travail,
// attestation de salaire, certificat de travail, attestation de congés.
//
// Deux chemins mènent à un document : la demande d'un salarié que la
// RH valide, et la délivrance directe par la RH. Dans les deux cas le
// PDF est produit au moment de la signature, jamais avant : les
// données changent entre une demande et son traitement, et c'est la
// situation au moment de la signature qui fait foi.

const { GetCommand, PutCommand, QueryCommand, UpdateCommand } =
  require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const { genererDocument } = require("./pdf");

const TABLE_DEMANDES = process.env.TABLE_DEMANDES_DOCUMENTS || "DemandesDocuments-local";
const TABLE_FACTURES = process.env.TABLE_FACTURES || "Factures-local";
const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";
const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

// `genere` distingue deux familles. Les documents que l'application
// COMPOSE — un PDF produit à la signature — et ceux qu'elle ne fait que
// mettre à disposition : une copie du contrat que le salarié a déposée,
// un bulletin déjà émis, une demande de renouvellement à laquelle la RH
// répond par écrit. Pour les seconds, exiger une CIN complète et
// fabriquer un PDF n'aurait aucun sens.
const TYPES = {
  ATTESTATION_TRAVAIL: {
    libelle: "Attestation de travail",
    description: "Atteste de votre emploi actuel dans l'entreprise",
    // Ce document ne revele aucun montant : il peut etre remis sans
    // precaution particuliere.
    confidentiel: false,
    genere: true,
  },
  ATTESTATION_SALAIRE: {
    libelle: "Attestation de salaire",
    description: "Indique votre rémunération, souvent exigée par les banques",
    confidentiel: true,
    genere: true,
  },
  CERTIFICAT_TRAVAIL: {
    libelle: "Certificat de travail",
    description: "Remis en fin de contrat, mentionne les dates et la fonction",
    confidentiel: false,
    genere: true,
  },
  ATTESTATION_CONGES: {
    libelle: "Attestation de congés",
    description: "Récapitule vos congés pris et votre solde",
    confidentiel: false,
    genere: true,
  },

  COPIE_CONTRAT: {
    libelle: "Copie du contrat de travail",
    description: "Votre exemplaire du contrat, si vous l'avez égaré",
    confidentiel: true,
    genere: false,
  },
  RENOUVELLEMENT_CONTRAT: {
    libelle: "Renouvellement du contrat",
    description: "Demander le renouvellement avant l'échéance de votre contrat",
    confidentiel: false,
    genere: false,
  },
  DUPLICATA_BULLETIN: {
    libelle: "Duplicata de bulletin de paie",
    description: "Un bulletin déjà délivré, à nouveau",
    confidentiel: true,
    genere: false,
  },
};

/** Les documents que l'application compose elle-même */
const estGenere = (type) => TYPES[type]?.genere === true;

/**
 * Dit lesquelles des trois données d'identité civile manquent.
 *
 * Un message qui se contente de les énumérer toutes oblige la RH à
 * deviner laquelle poser : avec trois champs, deux sont souvent déjà là.
 */
function cinIncomplete(identiteCivile) {
  const manquants = [];
  if (!identiteCivile.cin) manquants.push("le numéro de CIN");
  if (!identiteCivile.cinDelivreLe) manquants.push("sa date de délivrance");
  if (!identiteCivile.cinDelivreA) manquants.push("son lieu de délivrance");
  return manquants;
}

const STATUTS = ["EN_ATTENTE", "APPROUVEE", "REFUSEE"];

// Le Code du travail tunisien ouvre droit à un jour ouvrable par mois
// travaillé, plafonné à quinze jours par exercice (article 113).
const JOURS_CONGES_ANNUELS = 15;

const lireCorps = (event) =>
  typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});

// ── Création par un salarié ────────────────────────────────────────

exports.demander = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const { type, motif, destinataire } = lireCorps(event);

    if (!TYPES[type]) {
      return erreur(`Type invalide. Valeurs : ${Object.keys(TYPES).join(", ")}`, 400);
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    // Une demande identique deja en attente : inutile d'en empiler une
    // seconde, la RH traiterait deux fois le meme besoin.
    const existantes = await docClient.send(new QueryCommand({
      TableName: TABLE_DEMANDES,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      FilterExpression: "#t = :t AND #s = :s",
      ExpressionAttributeNames: { "#t": "type", "#s": "statut" },
      ExpressionAttributeValues: { ":e": fiche.id, ":t": type, ":s": "EN_ATTENTE" },
    }));

    if ((existantes.Items || []).length > 0) {
      return erreur("Une demande de ce type est déjà en attente de traitement", 409);
    }

    const demande = {
      id: uuidv4(),
      employeId: fiche.id,
      employeNom: `${fiche.prenom} ${fiche.nom}`,
      employeEmail: fiche.email,
      poste: fiche.poste || "",
      departement: fiche.departement || "",
      type,
      typeLibelle: TYPES[type].libelle,
      motif: motif || "",
      destinataire: destinataire || "",
      statut: "EN_ATTENTE",
      origine: "SALARIE",
      demandeLe: new Date().toISOString(),
      demandeParId: moi.userId,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_DEMANDES, Item: demande }));

    return succes({
      demande,
      message: "Demande transmise aux ressources humaines",
    }, 201);
  } catch (e) {
    console.error("Erreur demande de document:", e);
    return erreur("Impossible d'enregistrer la demande");
  }
};

// ── Délivrance directe par la RH ───────────────────────────────────
// Un salarié qui part en mission a besoin de son attestation le jour
// même : la RH ne doit pas attendre qu'il en fasse la demande.

exports.delivrer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const { employeId, type, destinataire, cin, cinDelivreLe, cinDelivreA } =
      lireCorps(event);

    if (!employeId) return erreur("employeId requis", 400);
    if (!TYPES[type]) {
      return erreur(`Type invalide. Valeurs : ${Object.keys(TYPES).join(", ")}`, 400);
    }

    const fiche = await employes.parId(employeId);
    if (!fiche) return erreur("Fiche employé introuvable", 404);

    // Les données de CIN transmises enrichissent la fiche : la RH ne
    // les ressaisira pas à la prochaine attestation.
    const identiteCivile = {
      cin: cin || fiche.cin,
      cinDelivreLe: cinDelivreLe || fiche.cinDelivreLe,
      cinDelivreA: cinDelivreA || fiche.cinDelivreA,
    };

    // Seuls les documents composés par l'application portent l'identité
    // civile : réclamer une CIN pour remettre une copie de contrat
    // bloquerait sans raison.
    if (estGenere(type)) {
      const manquants = cinIncomplete(identiteCivile);
      if (manquants.length > 0) {
        return erreur(
          `Pour générer cette attestation, il manque ${manquants.join(", ")}. `
          + `Saisissez ces informations dans le formulaire : elles seront `
          + `enregistrées sur la fiche et ne seront plus à ressaisir.`,
          400
        );
      }
    }

    if (cin || cinDelivreLe || cinDelivreA) {
      await enregistrerIdentite(fiche.id, identiteCivile);
    }

    const complete = { ...fiche, ...identiteCivile };
    const id = uuidv4();
    const maintenant = new Date().toISOString();

    let pdfKey = null;
    if (estGenere(type)) {
      const contexte = await rassemblerDonnees(type, complete);
      const pdf = await genererDocument(type, {
        employe: complete,
        destinataire: destinataire || null,
        ...contexte,
      });

      pdfKey = cheminPdf(complete.id, type, id);
      await ecrirePdf(pdfKey, pdf);
    }

    const demande = {
      id,
      employeId: complete.id,
      employeNom: `${complete.prenom} ${complete.nom}`,
      employeEmail: complete.email,
      poste: complete.poste || "",
      departement: complete.departement || "",
      type,
      typeLibelle: TYPES[type].libelle,
      motif: "",
      destinataire: destinataire || "",
      // Délivré d'office : la demande naît déjà approuvée.
      statut: "APPROUVEE",
      origine: "RH",
      demandeLe: maintenant,
      traiteLe: maintenant,
      traiteParId: moi.userId,
      traitePar: `${moi.prenom || ""} ${moi.nom || ""}`.trim() || moi.email,
      // Pas de clé nulle en base : son absence est ce qui dit à la page
      // qu'il n'y a pas de bouton de téléchargement à afficher.
      ...(pdfKey ? { pdfKey } : {}),
    };

    await docClient.send(new PutCommand({ TableName: TABLE_DEMANDES, Item: demande }));

    return succes({
      demande,
      message: pdfKey
        ? `${TYPES[type].libelle} générée et mise à disposition`
        : `${TYPES[type].libelle} enregistrée. Ce document n'est pas composé par `
          + `l'application : remettez-le au salarié par vos moyens habituels.`,
    }, 201);
  } catch (e) {
    console.error("Erreur délivrance de document:", e);
    return erreur("Impossible de générer le document : " + e.message);
  }
};

// ── Consultation ───────────────────────────────────────────────────

exports.lister = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters || {};

    // La RH voit la file d'attente ; un employe ne voit que ses
    // propres demandes, restriction portee par la cle de partition.
    if (estRole(moi, "RH")) {
      if (params.employeId) {
        const res = await docClient.send(new QueryCommand({
          TableName: TABLE_DEMANDES,
          IndexName: "employe-index",
          KeyConditionExpression: "employeId = :e",
          ExpressionAttributeValues: { ":e": params.employeId },
          ScanIndexForward: false,
        }));
        return succes({ demandes: res.Items || [] });
      }

      // Sans paramètre de statut, la RH reçoit toute la file. Le
      // défaut précédent était EN_ATTENTE, ce qui faisait afficher
      // zéro document délivré alors qu'il y en avait.
      const statut = params.statut ? String(params.statut).toUpperCase() : null;

      if (!statut) {
        const parStatut = await Promise.all(
          STATUTS.map((s) =>
            docClient.send(new QueryCommand({
              TableName: TABLE_DEMANDES,
              IndexName: "statut-index",
              KeyConditionExpression: "#s = :s",
              ExpressionAttributeNames: { "#s": "statut" },
              ExpressionAttributeValues: { ":s": s },
              ScanIndexForward: false,
            })).then((r) => r.Items || []).catch(() => [])
          )
        );
        return succes({ demandes: parStatut.flat(), types: TYPES });
      }

      if (!STATUTS.includes(statut)) {
        return erreur(`statut doit valoir ${STATUTS.join(", ")}`, 400);
      }

      const res = await docClient.send(new QueryCommand({
        TableName: TABLE_DEMANDES,
        IndexName: "statut-index",
        KeyConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "statut" },
        ExpressionAttributeValues: { ":s": statut },
        ScanIndexForward: false,
      }));
      return succes({ demandes: res.Items || [], types: TYPES });
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return succes({ demandes: [], types: TYPES });

    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_DEMANDES,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      ExpressionAttributeValues: { ":e": fiche.id },
      ScanIndexForward: false,
    }));

    return succes({ demandes: res.Items || [], types: TYPES });
  } catch (e) {
    console.error("Erreur liste des demandes:", e);
    return erreur("Impossible de charger les demandes");
  }
};

/** Catalogue des documents disponibles, pour alimenter le formulaire */
exports.typesDisponibles = async () => succes({ types: TYPES });

// ── Traitement par la RH ───────────────────────────────────────────

exports.traiter = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    const { statut, commentaire, cin, cinDelivreLe, cinDelivreA } = lireCorps(event);

    if (!id) return erreur("id requis", 400);
    if (!["APPROUVEE", "REFUSEE"].includes(statut)) {
      return erreur("statut doit valoir APPROUVEE ou REFUSEE", 400);
    }

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_DEMANDES, Key: { id },
    }));
    if (!res.Item) return erreur("Demande introuvable", 404);
    if (res.Item.statut !== "EN_ATTENTE") {
      return erreur("Cette demande a déjà été traitée", 409);
    }

    const demande = res.Item;
    const maintenant = new Date().toISOString();

    let pdfKey = null;

    if (statut === "APPROUVEE" && estGenere(demande.type)) {
      const fiche = await employes.parId(demande.employeId);
      if (!fiche) return erreur("Fiche employé introuvable", 404);

      const identiteCivile = {
        cin: cin || fiche.cin,
        cinDelivreLe: cinDelivreLe || fiche.cinDelivreLe,
        cinDelivreA: cinDelivreA || fiche.cinDelivreA,
      };

      // Une attestation tunisienne sans CIN complète est refusée au
      // guichet : mieux vaut bloquer ici que délivrer un papier mort.
      // Le message nomme ce qui manque — avec trois champs, deux sont
      // souvent déjà sur la fiche.
      const manquants = cinIncomplete(identiteCivile);
      if (manquants.length > 0) {
        return erreur(
          `Pour générer cette attestation, il manque ${manquants.join(", ")} `
          + `du salarié. Saisissez ces informations dans le formulaire de `
          + `traitement : elles seront enregistrées sur sa fiche et ne seront `
          + `plus à ressaisir.`,
          400
        );
      }

      if (cin || cinDelivreLe || cinDelivreA) {
        await enregistrerIdentite(fiche.id, identiteCivile);
      }

      // Le document reflete la situation au moment de la signature,
      // pas celle du jour de la demande.
      const complete = { ...fiche, ...identiteCivile };
      const contexte = await rassemblerDonnees(demande.type, complete);
      const pdf = await genererDocument(demande.type, {
        employe: complete,
        destinataire: demande.destinataire || null,
        ...contexte,
      });

      // Un seul écrit : l'ancien code appelait aussi stockerCv, qui
      // déposait une copie sous une clé aléatoire jamais relue.
      pdfKey = cheminPdf(demande.employeId, demande.type, id);
      await ecrirePdf(pdfKey, pdf);
    }

    const misAJour = {
      ...demande,
      statut,
      commentaireRH: commentaire || "",
      traiteLe: maintenant,
      traiteParId: moi.userId,
      traitePar: `${moi.prenom || ""} ${moi.nom || ""}`.trim() || moi.email,
      ...(pdfKey ? { pdfKey } : {}),
    };

    await docClient.send(new PutCommand({ TableName: TABLE_DEMANDES, Item: misAJour }));

    return succes({
      demande: misAJour,
      message: statut === "APPROUVEE"
        ? "Document généré et mis à disposition"
        : "Demande refusée",
    });
  } catch (e) {
    console.error("Erreur traitement de la demande:", e);
    return erreur("Impossible de traiter la demande : " + e.message);
  }
};

// ── Annulation par le salarié ──────────────────────────────────────
//
// Une demande partie par erreur — mauvais type, mauvais destinataire —
// n'a pas à occuper la file de la RH ni à obliger le salarié à en
// expliquer le retrait. Il la retire lui-même, tant qu'elle n'est pas
// traitée.
//
// Le statut ANNULEE n'est pas ajouté à STATUTS : la file de la RH
// interroge précisément cette liste, et une demande annulée n'a rien à
// y faire. Elle reste visible au salarié, qui voit ce qu'il a retiré.

exports.annuler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    if (!id) return erreur("id requis", 400);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_DEMANDES, Key: { id },
    }));
    if (!res.Item) return erreur("Demande introuvable", 404);

    const demande = res.Item;

    // La RH peut retirer une demande ; un salarié, seulement les
    // siennes. Sans ce contrôle, un identifiant deviné suffirait à
    // annuler la demande d'un collègue.
    if (!estRole(moi, "RH")) {
      const fiche = await employes.courant(moi);
      if (!fiche || fiche.id !== demande.employeId) {
        return erreur("Cette demande n'est pas la vôtre", 403);
      }
    }

    if (demande.statut !== "EN_ATTENTE") {
      return erreur(
        demande.statut === "ANNULEE"
          ? "Cette demande est déjà annulée"
          : `Cette demande a déjà été traitée le `
            + `${new Date(demande.traiteLe).toLocaleDateString("fr-FR")} : `
            + `elle ne peut plus être annulée.`,
        409
      );
    }

    const misAJour = {
      ...demande,
      statut: "ANNULEE",
      annuleLe: new Date().toISOString(),
      annuleParId: moi.userId,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_DEMANDES, Item: misAJour }));

    return succes({ demande: misAJour, message: "Demande annulée" });
  } catch (e) {
    console.error("Erreur annulation de la demande:", e);
    return erreur("Impossible d'annuler la demande");
  }
};

// ── Téléchargement ─────────────────────────────────────────────────

exports.telecharger = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_DEMANDES, Key: { id },
    }));
    if (!res.Item) return erreur("Demande introuvable", 404);

    const demande = res.Item;

    // Un employe ne peut telecharger que ses propres documents
    if (!estRole(moi, "RH")) {
      const fiche = await employes.courant(moi);
      if (!fiche || fiche.id !== demande.employeId) {
        return erreur("Accès refusé", 403);
      }
    }

    if (demande.statut !== "APPROUVEE" || !demande.pdfKey) {
      return erreur("Aucun document disponible pour cette demande", 404);
    }

    return { pdfKey: demande.pdfKey, nom: `${demande.typeLibelle}.pdf` };
  } catch (e) {
    console.error("Erreur téléchargement du document:", e);
    return erreur("Impossible de récupérer le document");
  }
};

// ── Données annexes ────────────────────────────────────────────────

/** Informations complementaires selon le type de document */
async function rassemblerDonnees(type, fiche) {
  if (type === "ATTESTATION_SALAIRE") {
    // Les trois derniers bulletins donnent une image fidele de la
    // remuneration, primes et heures supplementaires comprises.
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_FACTURES,
      IndexName: "employe-periode-index",
      KeyConditionExpression: "employeId = :e",
      ExpressionAttributeValues: { ":e": fiche.id },
      ScanIndexForward: false,
      Limit: 3,
    })).catch(() => ({ Items: [] }));

    return { bulletins: res.Items || [] };
  }

  if (type === "ATTESTATION_CONGES") {
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_CONGES,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      ExpressionAttributeValues: { ":e": fiche.id },
    })).catch(() => ({ Items: [] }));

    const annee = String(new Date().getFullYear());

    // Seuls les congés approuvés de l'exercice en cours sont décomptés
    const pris = (res.Items || [])
      .filter((c) => c.statut === "APPROUVE" && String(c.dateDebut).startsWith(annee))
      .reduce((s, c) => s + (c.nbJours || 0), 0);

    // Le droit se construit au prorata des mois travaillés, plafonné
    // à quinze jours par exercice.
    const embauche = fiche.dateEmbauche ? new Date(fiche.dateEmbauche) : null;
    let acquis = JOURS_CONGES_ANNUELS;

    if (embauche && String(embauche.getFullYear()) === annee) {
      const moisTravailles = 12 - embauche.getMonth();
      acquis = Math.min(JOURS_CONGES_ANNUELS, moisTravailles);
    }

    return { soldeConges: { acquis, pris } };
  }

  return {};
}

/** Enregistre l'identité civile sur la fiche, pour les prochaines fois */
async function enregistrerIdentite(employeId, identiteCivile) {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_EMPLOYES,
    Key: { id: employeId },
    UpdateExpression:
      "SET cin = :c, cinDelivreLe = :d, cinDelivreA = :l, majLe = :m",
    ExpressionAttributeValues: {
      ":c": identiteCivile.cin,
      ":d": identiteCivile.cinDelivreLe,
      ":l": identiteCivile.cinDelivreA,
      ":m": new Date().toISOString(),
    },
  })).catch((e) => {
    // L'échec de cet enregistrement ne doit pas empêcher la
    // délivrance : la RH ressaisira au prochain document.
    console.error("Identité civile non enregistrée :", e.message);
  });
}

const cheminPdf = (employeId, type, demandeId) =>
  `documents/${new Date().getFullYear()}/${employeId}_${type}_${demandeId.slice(0, 8)}.pdf`;

async function ecrirePdf(cle, buffer) {
  const fs = require("fs/promises");
  const path = require("path");
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

  if (process.env.DOCUMENTS_BUCKET) {
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    await s3.send(new PutObjectCommand({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Key: cle,
      Body: buffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }));
    return;
  }

  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
}

module.exports.TYPES = TYPES;
module.exports.STATUTS = STATUTS;