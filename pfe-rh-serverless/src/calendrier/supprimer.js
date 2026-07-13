const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return erreur("ID evenement manquant", 400);

    const existant = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EVENEMENTS,
      Key: { id },
    }));
    if (!existant.Item) return nonTrouve("Evenement");

    const user = event.user;
    if (user.role !== "RH" && existant.Item.createurId !== user.sub) {
      return erreur("Vous ne pouvez supprimer que vos propres evenements", 403);
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_EVENEMENTS,
      Key: { id },
      UpdateExpression: "SET statut = :statut, supprimeLe = :date",
      ExpressionAttributeValues: {
        ":statut": "ANNULE",
        ":date":   new Date().toISOString(),
      },
    }));

    return succes({
      message: `Evenement "${existant.Item.titre}" annule avec succes`,
      id,
    });

  } catch (e) {
    console.error("Erreur supprimer evenement:", e);
    return erreur("Impossible d annuler l evenement");
  }
};