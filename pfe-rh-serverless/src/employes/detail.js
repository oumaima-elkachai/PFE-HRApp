const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;

    if (!id) return erreur("ID employe manquant", 400);

    const resultat = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id },
    }));

    if (!resultat.Item) return nonTrouve("Employe");

    return succes({ employe: resultat.Item });

  } catch (e) {
    console.error("Erreur detail employe:", e);
    return erreur("Impossible de recuperer l employe");
  }
};