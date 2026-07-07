const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const resultat = await docClient.send(
      new ScanCommand({
        TableName: process.env.TABLE_EMPLOYES,
      })
    );

    return succes({
      employes: resultat.Items,
      total: resultat.Count,
    });
  } catch (e) {
    console.error("Erreur lister employés:", e);
    return erreur("Impossible de récupérer les employés");
  }
};