// src/pointages/historique.js
// GET /pointages?date=&mois=&employeId=

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";
const STATUTS = ["EN_COURS", "TERMINE"];

async function parEmploye(employeId, { date, mois }) {
  const params = {
    TableName: TABLE_POINTAGES,
    ExpressionAttributeValues: { ":e": employeId },
    ScanIndexForward: false,
  };

  if (date) {
    params.KeyConditionExpression = "employeId = :e AND #d = :d";
    params.ExpressionAttributeNames = { "#d": "date" };
    params.ExpressionAttributeValues[":d"] = date;
  } else if (mois) {
    params.KeyConditionExpression = "employeId = :e AND begins_with(#d, :m)";
    params.ExpressionAttributeNames = { "#d": "date" };
    params.ExpressionAttributeValues[":m"] = mois;
  } else {
    params.KeyConditionExpression = "employeId = :e";
  }

  const res = await docClient.send(new QueryCommand(params));
  return res.Items || [];
}

async function tousEmployes({ date, mois }) {
  const requetes = STATUTS.map((statut) => {
    const params = {
      TableName: TABLE_POINTAGES,
      IndexName: "statut-index",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: { ":s": statut },
      ScanIndexForward: false,
    };

    if (date) {
      params.KeyConditionExpression = "#s = :s AND #d = :d";
      params.ExpressionAttributeNames["#d"] = "date";
      params.ExpressionAttributeValues[":d"] = date;
    } else if (mois) {
      params.KeyConditionExpression = "#s = :s AND begins_with(#d, :m)";
      params.ExpressionAttributeNames["#d"] = "date";
      params.ExpressionAttributeValues[":m"] = mois;
    } else {
      params.KeyConditionExpression = "#s = :s";
    }

    return docClient.send(new QueryCommand(params));
  });

  const resultats = await Promise.all(requetes);
  return resultats.flatMap((r) => r.Items || []);
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const params = event.queryStringParameters || {};
    const filtres = { date: params.date, mois: params.mois };

    let pointages;

    if (estRole(moi, "RH")) {
      pointages = params.employeId
        ? await parEmploye(params.employeId, filtres)
        : await tousEmployes(filtres);
    } else {
      // Un employé ne voit que ses propres pointages. La restriction est
      // portée par la clé de partition, pas par un filtre applicatif :
      // il n'existe aucun chemin de code renvoyant les données d'autrui.
      const fiche = await employes.courant(moi);
      if (!fiche) {
        return succes({
          pointages: [],
          total: 0,
          stats: { joursPointes: 0, enCours: 0, totalHeures: "0h00", moyenneHeures: "0h00" },
        });
      }
      pointages = await parEmploye(fiche.id, filtres);
    }

    pointages.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const termines = pointages.filter((p) => p.statut === "TERMINE");
    const totalMin = termines.reduce((s, p) => s + (p.dureeMinutes || 0), 0);
    const moyenneMin = termines.length ? Math.round(totalMin / termines.length) : 0;
    const formater = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

    return succes({
      pointages,
      total: pointages.length,
      stats: {
        joursPointes: termines.length,
        enCours: pointages.filter((p) => p.statut === "EN_COURS").length,
        totalHeures: formater(totalMin),
        moyenneHeures: formater(moyenneMin),
      },
    });

  } catch (e) {
    console.error("Erreur historique pointages:", e);
    return erreur("Impossible de récupérer l'historique");
  }
};