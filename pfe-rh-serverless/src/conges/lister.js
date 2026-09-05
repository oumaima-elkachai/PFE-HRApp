// src/conges/lister.js
// GET /conges?employeId=&statut=

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";

const SOLDE_ANNUEL_DEFAUT = 21;
const STATUTS = ["EN_ATTENTE", "APPROUVE", "REFUSE"];

// Seul le congé sans solde ne consomme pas le compteur annuel.
const TYPES_DECOMPTES = new Set(["annuel", "exceptionnel"]);

async function parEmploye(employeId) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: "employe-index",
    KeyConditionExpression: "employeId = :e",
    ExpressionAttributeValues: { ":e": employeId },
    ScanIndexForward: false,
  }));
  return res.Items || [];
}

async function parStatut(statut) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: "statut-index",
    KeyConditionExpression: "#s = :s",
    ExpressionAttributeNames: { "#s": "statut" },
    ExpressionAttributeValues: { ":s": statut },
    ScanIndexForward: false,
  }));
  return res.Items || [];
}

/** Vue RH : les trois statuts en parallèle, plutôt qu'un parcours de table */
async function tous() {
  const resultats = await Promise.all(STATUTS.map(parStatut));
  return resultats.flat();
}

function calculerSolde(fiche, conges) {
  const annee = new Date().getFullYear();
  const total = fiche.soldeConges || SOLDE_ANNUEL_DEFAUT;

  // Le filtre d'origine cherchait type === "paye", valeur qui n'existe
  // dans aucun enregistrement : le solde affiché était toujours entier.
  const utilises = conges
    .filter((c) =>
      c.statut === "APPROUVE" &&
      TYPES_DECOMPTES.has(c.type) &&
      String(c.dateDebut).startsWith(String(annee))
    )
    .reduce((s, c) => s + (c.nbJours || 0), 0);

  const enAttente = conges
    .filter((c) =>
      c.statut === "EN_ATTENTE" &&
      TYPES_DECOMPTES.has(c.type) &&
      String(c.dateDebut).startsWith(String(annee))
    )
    .reduce((s, c) => s + (c.nbJours || 0), 0);

  return {
    total,
    utilises,
    enAttente,
    restants: Math.max(0, total - utilises),
    // Ce qu'il resterait si toutes les demandes en cours étaient accordées
    previsionnels: Math.max(0, total - utilises - enAttente),
  };
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters || {};
    let conges;
    let solde;

    if (estRole(moi, "RH")) {
      if (params.employeId) {
        conges = await parEmploye(params.employeId);
      } else if (params.statut) {
        conges = await parStatut(String(params.statut).toUpperCase());
      } else {
        conges = await tous();
      }
      if (params.statut && params.employeId) {
        const cible = String(params.statut).toUpperCase();
        conges = conges.filter((c) => c.statut === cible);
      }
    } else {
      const fiche = await employes.courant(moi);
      if (!fiche) {
        return succes({
          conges: [],
          total: 0,
          solde: { total: SOLDE_ANNUEL_DEFAUT, utilises: 0, enAttente: 0, restants: SOLDE_ANNUEL_DEFAUT, previsionnels: SOLDE_ANNUEL_DEFAUT },
        });
      }
      conges = await parEmploye(fiche.id);
      solde = calculerSolde(fiche, conges);
    }

    conges.sort((a, b) => String(b.demandeLe).localeCompare(String(a.demandeLe)));

    return succes({ conges, total: conges.length, solde });

  } catch (e) {
    console.error("Erreur GET /conges:", e);
    return erreur("Impossible de récupérer les congés");
  }
};