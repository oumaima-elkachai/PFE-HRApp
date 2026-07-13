const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return erreur("ID employe manquant", 400);

    const body = JSON.parse(event.body || "{}");
    const champsModifiables = ["nom", "prenom", "email", "poste", "departement", "statut", "telephone", "dateNaissance", "adresse"];

    // Vérifier que l'employé existe
    const existant = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id },
    }));
    if (!existant.Item) return nonTrouve("Employe");

    // Construire dynamiquement l'expression de mise à jour
    const updates        = [];
    const exprNames      = {};
    const exprValues     = {};

    champsModifiables.forEach((champ) => {
      if (body[champ] !== undefined) {
        updates.push(`#${champ} = :${champ}`);
        exprNames[`#${champ}`]  = champ;
        exprValues[`:${champ}`] = body[champ];
      }
    });

    if (updates.length === 0) {
      return erreur("Aucun champ a modifier fourni", 400);
    }

    // Ajouter la date de modification
    updates.push("#misAJourLe = :misAJourLe");
    exprNames["#misAJourLe"]  = "misAJourLe";
    exprValues[":misAJourLe"] = new Date().toISOString();

    const resultat = await docClient.send(new UpdateCommand({
      TableName:                 process.env.TABLE_EMPLOYES,
      Key:                       { id },
      UpdateExpression:          "SET " + updates.join(", "),
      ExpressionAttributeNames:  exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues:              "ALL_NEW",
    }));

    return succes({
      employe:  resultat.Attributes,
      message:  "Employe mis a jour avec succes",
    });

  } catch (e) {
    console.error("Erreur modifier employe:", e);
    return erreur("Impossible de modifier l employe");
  }
};