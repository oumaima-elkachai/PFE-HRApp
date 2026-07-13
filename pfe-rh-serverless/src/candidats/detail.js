const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;

    if (!id) return erreur("ID manquant", 400);

    const resultat = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_CANDIDATS,
      Key: { id },
    }));

    if (!resultat.Item) return nonTrouve("Candidat");

    return succes({ candidat: resultat.Item });

  } catch (e) {
    console.error("Erreur detail candidat:", e);
    return erreur("Impossible de recuperer le candidat");
  }
};