const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

// On archive au lieu de supprimer physiquement (bonne pratique RH)
exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return erreur("ID employe manquant", 400);

    // Vérifier que l'employé existe
    const existant = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id },
    }));
    if (!existant.Item) return nonTrouve("Employe");

    if (existant.Item.statut === "archive") {
      return erreur("Cet employe est deja archive", 409);
    }

    // Archiver au lieu de supprimer
    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id },
      UpdateExpression: "SET statut = :statut, archiveLe = :date",
      ExpressionAttributeValues: {
        ":statut": "archive",
        ":date":   new Date().toISOString(),
      },
    }));

    return succes({
      message: `Employe ${existant.Item.prenom} ${existant.Item.nom} archive avec succes`,
      id,
    });

  } catch (e) {
    console.error("Erreur supprimer employe:", e);
    return erreur("Impossible d archiver l employe");
  }
};