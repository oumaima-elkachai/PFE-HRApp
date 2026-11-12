// src/frais/notes.js
//
// Notes de frais : declaration par le salarie, validation par la RH,
// remboursement sur le bulletin suivant.
//
// Point de droit important : un remboursement de frais professionnels
// n'est pas un element de remuneration. Il n'entre donc ni dans
// l'assiette CNSS ni dans le revenu imposable, contrairement a une
// prime. Il s'ajoute au net apres cotisations.

const { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const documents = require("../services/documents");
const { v4: uuidv4 } = require("uuid");

const TABLE_NOTES = process.env.TABLE_NOTES_FRAIS || "NotesFrais-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";

const CATEGORIES = {
  TRANSPORT: { libelle: "Transport", plafond: 500 },
  REPAS: { libelle: "Repas", plafond: 50 },
  HEBERGEMENT: { libelle: "Hébergement", plafond: 300 },
  FOURNITURES: { libelle: "Fournitures", plafond: 200 },
  FORMATION: { libelle: "Formation", plafond: 2000 },
  AUTRE: { libelle: "Autre", plafond: null },
};

// REMBOURSEE marque le passage sur un bulletin : sans cet etat, une
// note validee serait remboursee a chaque generation de paie.
const STATUTS = ["SOUMISE", "APPROUVEE", "REFUSEE", "REMBOURSEE"];

const periodeDe = (iso) => String(iso).slice(0, 7);

async function notifier({ userId, type, titre, message, metadata }) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NOTIFICATIONS,
    Item: {
      id: uuidv4(), userId, type, titre, message,
      lu: false,
      creeLe: new Date().toISOString(),
      expireLe: Math.floor(Date.now() / 1000) + 90 * 86400,
      metadata: metadata || {},
    },
  }));
}

// ── Déclaration ────────────────────────────────────────────────────

exports.declarer = async (event, fichier) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const { categorie, montant, dateDepense, description } = body;

    if (!CATEGORIES[categorie]) {
      return erreur(`Catégorie invalide. Valeurs : ${Object.keys(CATEGORIES).join(", ")}`, 400);
    }

    const somme = Number(montant);
    if (!somme || somme <= 0) return erreur("Le montant doit être positif", 400);

    if (!dateDepense) return erreur("La date de la dépense est requise", 400);

    // Une depense future n'a pas de justificatif possible
    if (dateDepense > new Date().toISOString().slice(0, 10)) {
      return erreur("La date de la dépense ne peut pas être future", 400);
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    // Le justificatif conditionne le remboursement : sans piece, la
    // depense n'est pas opposable a l'administration fiscale.
    let justificatifKey = null;
    let justificatifNom = null;
    if (fichier?.buffer?.length) {
      justificatifKey = await documents.stockerCv(fichier, "frais");
      justificatifNom = fichier.originalname;
    }

    const maintenant = new Date().toISOString();
    const plafond = CATEGORIES[categorie].plafond;

    const note = {
      id: uuidv4(),
      employeId: fiche.id,
      employeNom: `${fiche.prenom} ${fiche.nom}`,
      employeEmail: fiche.email,
      departement: fiche.departement || null,
      categorie,
      categorieLibelle: CATEGORIES[categorie].libelle,
      montant: Math.round(somme * 1000) / 1000,
      devise: "TND",
      dateDepense,
      periode: periodeDe(dateDepense),
      description: description || "",
      justificatifKey,
      justificatifNom,
      // Un depassement ne bloque pas la declaration : il attire
      // l'attention de la RH, qui tranche.
      depassePlafond: plafond !== null && somme > plafond,
      plafondCategorie: plafond,
      statut: "SOUMISE",
      creeLe: maintenant,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NOTES, Item: note }));

    await notifier({
      userId: "RH",
      type: "NOTE_FRAIS",
      titre: "Note de frais à valider",
      message: `${note.employeNom} déclare ${note.montant.toFixed(3)} TND — ${note.categorieLibelle}`,
      metadata: { noteId: note.id },
    }).catch(() => {});

    return succes({ note, message: "Note de frais transmise" }, 201);
  } catch (e) {
    console.error("Erreur déclaration de frais:", e);
    return erreur("Impossible d'enregistrer la note de frais");
  }
};

// ── Consultation ───────────────────────────────────────────────────

exports.lister = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters || {};

    if (estRole(moi, "RH")) {
      if (params.employeId) {
        const res = await docClient.send(new QueryCommand({
          TableName: TABLE_NOTES,
          IndexName: "employe-index",
          KeyConditionExpression: "employeId = :e",
          ExpressionAttributeValues: { ":e": params.employeId },
          ScanIndexForward: false,
        }));
        return succes({ notes: res.Items || [], categories: CATEGORIES });
      }

      const res = await docClient.send(new QueryCommand({
        TableName: TABLE_NOTES,
        IndexName: "statut-index",
        KeyConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "statut" },
        ExpressionAttributeValues: { ":s": params.statut || "SOUMISE" },
        ScanIndexForward: false,
      }));

      const notes = res.Items || [];
      return succes({
        notes,
        categories: CATEGORIES,
        total: notes.reduce((s, n) => s + n.montant, 0),
      });
    }

    const fiche = await employes.courant(moi);
    if (!fiche) return succes({ notes: [], categories: CATEGORIES });

    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_NOTES,
      IndexName: "employe-index",
      KeyConditionExpression: "employeId = :e",
      ExpressionAttributeValues: { ":e": fiche.id },
      ScanIndexForward: false,
    }));

    const notes = res.Items || [];

    return succes({
      notes,
      categories: CATEGORIES,
      resume: {
        enAttente: notes.filter((n) => n.statut === "SOUMISE").reduce((s, n) => s + n.montant, 0),
        aRembourser: notes.filter((n) => n.statut === "APPROUVEE").reduce((s, n) => s + n.montant, 0),
        rembourse: notes.filter((n) => n.statut === "REMBOURSEE").reduce((s, n) => s + n.montant, 0),
      },
    });
  } catch (e) {
    console.error("Erreur liste des notes de frais:", e);
    return erreur("Impossible de charger les notes de frais");
  }
};

// ── Traitement ─────────────────────────────────────────────────────

exports.traiter = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const { statut, commentaire, montantAccorde } = body;

    if (!["APPROUVEE", "REFUSEE"].includes(statut)) {
      return erreur("statut doit valoir APPROUVEE ou REFUSEE", 400);
    }

    const res = await docClient.send(new GetCommand({ TableName: TABLE_NOTES, Key: { id } }));
    if (!res.Item) return erreur("Note de frais introuvable", 404);
    if (res.Item.statut !== "SOUMISE") return erreur("Cette note a déjà été traitée", 409);

    const note = res.Item;
    const maintenant = new Date().toISOString();

    // La RH peut rembourser partiellement : un depassement de plafond
    // se ramene alors au montant autorise plutot que d'etre refuse.
    const montantRetenu = statut === "APPROUVEE" && montantAccorde
      ? Math.min(Number(montantAccorde), note.montant)
      : note.montant;

    const misAJour = {
      ...note,
      statut,
      montantAccorde: statut === "APPROUVEE" ? montantRetenu : 0,
      commentaireRH: commentaire || "",
      traiteLe: maintenant,
      traiteParId: moi.userId,
      traitePar: `${moi.prenom} ${moi.nom}`.trim() || moi.email,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NOTES, Item: misAJour }));

    await notifier({
      userId: note.employeEmail,
      type: "NOTE_FRAIS_TRAITEE",
      titre: statut === "APPROUVEE" ? "Note de frais approuvée" : "Note de frais refusée",
      message: statut === "APPROUVEE"
        ? `${montantRetenu.toFixed(3)} TND seront remboursés sur votre prochain bulletin.`
        : `Votre note de ${note.montant.toFixed(3)} TND a été refusée. ${commentaire || ""}`,
      metadata: { noteId: id },
    }).catch(() => {});

    return succes({
      note: misAJour,
      message: statut === "APPROUVEE"
        ? `Approuvée pour ${montantRetenu.toFixed(3)} TND`
        : "Note refusée",
    });
  } catch (e) {
    console.error("Erreur traitement de la note:", e);
    return erreur("Impossible de traiter la note de frais");
  }
};

exports.supprimer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    const res = await docClient.send(new GetCommand({ TableName: TABLE_NOTES, Key: { id } }));
    if (!res.Item) return erreur("Note de frais introuvable", 404);

    const note = res.Item;
    const fiche = await employes.courant(moi);

    if (!estRole(moi, "RH") && (!fiche || fiche.id !== note.employeId)) {
      return erreur("Accès refusé", 403);
    }

    // Une note traitee appartient a l'historique comptable : elle ne
    // se supprime plus.
    if (note.statut !== "SOUMISE") {
      return erreur("Une note déjà traitée ne peut pas être supprimée", 409);
    }

    if (note.justificatifKey) {
      await documents.supprimerDocument(note.justificatifKey).catch(() => {});
    }

    await docClient.send(new DeleteCommand({ TableName: TABLE_NOTES, Key: { id } }));

    return succes({ message: "Note de frais supprimée" });
  } catch (e) {
    console.error("Erreur suppression de la note:", e);
    return erreur("Impossible de supprimer la note");
  }
};

// ── Intégration à la paie ──────────────────────────────────────────

/**
 * Notes approuvees et non encore remboursees d'un salarie.
 * Appelee par le generateur de bulletins.
 */
async function remboursementsEnAttente(employeId) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NOTES,
    IndexName: "employe-index",
    KeyConditionExpression: "employeId = :e",
    FilterExpression: "#s = :s",
    ExpressionAttributeNames: { "#s": "statut" },
    ExpressionAttributeValues: { ":e": employeId, ":s": "APPROUVEE" },
  }));

  const notes = res.Items || [];

  return {
    notes,
    total: notes.reduce((s, n) => s + (n.montantAccorde ?? n.montant), 0),
  };
}

/**
 * Marque les notes comme remboursees, une fois le bulletin emis.
 * Sans ce passage, une note approuvee serait remboursee a chaque
 * generation de bulletin.
 */
async function marquerRemboursees(notes, periode) {
  for (const note of notes) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NOTES,
      Key: { id: note.id },
      UpdateExpression: "SET #s = :s, periodeRemboursement = :p, rembourseLe = :d",
      ConditionExpression: "#s = :attendu",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: {
        ":s": "REMBOURSEE",
        ":attendu": "APPROUVEE",
        ":p": periode,
        ":d": new Date().toISOString(),
      },
    })).catch(() => {
      // Deja remboursee par une generation concurrente : sans
      // consequence, la condition a joue son role.
    });
  }
}

module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUTS = STATUTS;
module.exports.remboursementsEnAttente = remboursementsEnAttente;
module.exports.marquerRemboursees = marquerRemboursees;