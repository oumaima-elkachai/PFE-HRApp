const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const { nom, prenom, email, poste, departement } = JSON.parse(event.body || "{}");

    if (!nom || !prenom || !email || !poste || !departement) {
      return erreur("Champs manquants : nom, prenom, email, poste, departement", 400);
    }

    const employe = {
      id:           uuidv4(),
      nom,
      prenom,
      email,
      poste,
      departement,
      statut:       "actif",
      creeLe:       new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.TABLE_EMPLOYES,
        Item:      employe,
      })
    );

    return succes({ employe }, 201);
  } catch (e) {
    console.error("Erreur créer employé:", e);
    return erreur("Impossible de créer l'employé");
  }
};