const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return erreur("ID evenement manquant", 400);

    const body = JSON.parse(event.body || "{}");
    const champsModifiables = ["titre", "description", "type", "dateDebut", "dateFin", "lieu", "participants", "statut"];

    const existant = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EVENEMENTS,
      Key: { id },
    }));
    if (!existant.Item) return nonTrouve("Evenement");

    // Vérifier que c'est le créateur ou un RH
    const user = event.user;
    if (user.role !== "RH" && existant.Item.createurId !== user.sub) {
      return erreur("Vous ne pouvez modifier que vos propres evenements", 403);
    }

    const updates    = [];
    const exprNames  = {};
    const exprValues = {};

    champsModifiables.forEach((champ) => {
      if (body[champ] !== undefined) {
        updates.push(`#${champ} = :${champ}`);
        exprNames[`#${champ}`]  = champ;
        exprValues[`:${champ}`] = body[champ];
      }
    });

    if (updates.length === 0) return erreur("Aucun champ a modifier", 400);

    updates.push("#misAJourLe = :misAJourLe");
    exprNames["#misAJourLe"]  = "misAJourLe";
    exprValues[":misAJourLe"] = new Date().toISOString();

    const resultat = await docClient.send(new UpdateCommand({
      TableName:                 process.env.TABLE_EVENEMENTS,
      Key:                       { id },
      UpdateExpression:          "SET " + updates.join(", "),
      ExpressionAttributeNames:  exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues:              "ALL_NEW",
    }));

    return succes({
      evenement: resultat.Attributes,
      message:   "Evenement mis a jour avec succes",
    });

  } catch (e) {
    console.error("Erreur modifier evenement:", e);
    return erreur("Impossible de modifier l evenement");
  }
};