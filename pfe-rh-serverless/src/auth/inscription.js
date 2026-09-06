const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const { nom, prenom, email, motDePasse, role, departement, poste } = JSON.parse(event.body || "{}");

    if (!nom || !prenom || !email || !motDePasse || !role) {
      return erreur("Champs requis : nom, prenom, email, motDePasse, role", 400);
    }

    const rolesValides = ["EMPLOYE", "RH", "CANDIDAT"];
    if (!rolesValides.includes(role)) {
      return erreur("Role invalide. Valeurs : EMPLOYE, RH, CANDIDAT", 400);
    }

    const existants = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_USERS,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
    }));

    if (existants.Count > 0) {
      return erreur("Cet email est deja utilise", 409);
    }

    const hash = await bcrypt.hash(motDePasse, 10);

    const user = {
      id: uuidv4(),
      nom,
      prenom,
      email,
      motDePasse: hash,
      role,
      departement: departement || null,
      poste: poste || null,
      statut: "actif",
      creeLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_USERS,
      Item: user,
    }));

    const { motDePasse: _, ...userSansPassword } = user;
    return succes({ user: userSansPassword, message: "Inscription reussie" }, 201);

  } catch (e) {
    console.error("Erreur inscription:", e);
    return erreur("Erreur lors de l inscription");
  }
};