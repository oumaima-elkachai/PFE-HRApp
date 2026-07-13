const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const user   = event.user;
    const params = event.queryStringParameters || {};

    let filterExpression       = "";
    let expressionNames        = {};
    let expressionValues       = {};

    // RH voit tout, employé voit seulement ses pointages
    if (user.role === "EMPLOYE") {
      filterExpression = "employeId = :eid";
      expressionValues[":eid"] = user.sub;
    }

    // Filtre par date si fourni
    if (params.date) {
      filterExpression += filterExpression ? " AND #date = :date" : "#date = :date";
      expressionNames["#date"]    = "date";
      expressionValues[":date"]   = params.date;
    }

    // Filtre par mois (ex: 2026-04)
    if (params.mois) {
      filterExpression += filterExpression
        ? " AND begins_with(#date, :mois)"
        : "begins_with(#date, :mois)";
      expressionNames["#date"]    = "date";
      expressionValues[":mois"]   = params.mois;
    }

    const query = {
      TableName: process.env.TABLE_POINTAGES,
    };

    if (filterExpression) {
      query.FilterExpression          = filterExpression;
      query.ExpressionAttributeValues = expressionValues;
      if (Object.keys(expressionNames).length > 0) {
        query.ExpressionAttributeNames = expressionNames;
      }
    }

    const resultat = await docClient.send(new ScanCommand(query));

    // Trier par date décroissante
    const pointages = resultat.Items.sort(
      (a, b) => new Date(b.heureArrivee) - new Date(a.heureArrivee)
    );

    // Calculer les stats
    const termine  = pointages.filter(p => p.statut === "TERMINE");
    const totalMin = termine.reduce((sum, p) => sum + (p.dureeMinutes || 0), 0);
    const heures   = Math.floor(totalMin / 60);
    const minutes  = totalMin % 60;

    return succes({
      pointages,
      total: pointages.length,
      stats: {
        joursPointes:  termine.length,
        totalHeures:   `${heures}h${minutes.toString().padStart(2, "0")}`,
        moyenneHeures: termine.length > 0
          ? `${Math.floor(totalMin / termine.length / 60)}h${(Math.round(totalMin / termine.length) % 60).toString().padStart(2, "0")}`
          : "0h00",
      },
    });

  } catch (e) {
    console.error("Erreur historique pointages:", e);
    return erreur("Impossible de recuperer l historique");
  }
};