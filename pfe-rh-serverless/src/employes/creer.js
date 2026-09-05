// src/employes/creer.js
const { PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

const SALAIRE_PAR_DEFAUT = 1900;

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});

    const {
      nom, prenom, email, poste, departement,
      telephone, dateEmbauche,
      salaireBrutMensuel, heuresContrat,
      chefDeFamille, nbEnfants,
    } = body;

    if (!nom || !prenom || !email || !poste || !departement) {
      return erreur("Champs requis : nom, prenom, email, poste, departement", 400);
    }

    const emailNormalise = String(email).trim().toLowerCase();

    // L'unicité de l'adresse n'est pas garantie par le schéma : email est
    // une clé d'index, pas une clé primaire. On vérifie donc explicitement.
    const existant = await docClient.send(new QueryCommand({
      TableName: TABLE_EMPLOYES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": emailNormalise },
      Limit: 1,
    }));

    if ((existant.Items || []).length > 0) {
      return erreur("Un employé utilise déjà cette adresse", 409);
    }

    const maintenant = new Date().toISOString();

    const employe = {
      id: uuidv4(),
      nom, prenom,
      email: emailNormalise,
      poste, departement,
      telephone: telephone || "",
      dateEmbauche: dateEmbauche || maintenant.split("T")[0],

      // Données de paie : sans elles, la génération du bulletin échoue
      // et le calcul de l'IRPP est faussé.
      salaireBrutMensuel: Number(salaireBrutMensuel) || SALAIRE_PAR_DEFAUT,
      heuresContrat: Number(heuresContrat) || 8,
      chefDeFamille: chefDeFamille === true || chefDeFamille === "true",
      nbEnfants: Math.max(0, Number(nbEnfants) || 0),
      soldeConges: 21,

      statut: "ACTIF",
      creeLe: maintenant,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_EMPLOYES,
      Item: employe,
    }));

    return succes({ employe }, 201);
  } catch (e) {
    console.error("Erreur création employé:", e);
    return erreur("Impossible de créer l'employé");
  }
};