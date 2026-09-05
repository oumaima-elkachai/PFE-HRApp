// src/utils/employe.js
//
// Résolution de la fiche employé à partir de l'identité du jeton.
//
// Sur AWS, le jeton porte custom:employeId : une seule lecture par clé.
// En local, le JWT maison ne le contient pas, d'où le repli sur
// l'index email-index — qui remplace le Scan intégral d'origine.

const { GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./dynamodb");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

/** Fiche employé par identifiant */
async function parId(employeId) {
  if (!employeId) return null;
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_EMPLOYES,
    Key: { id: employeId },
  }));
  return res.Item || null;
}

/** Fiche employé par adresse, via l'index dédié */
async function parEmail(email) {
  if (!email) return null;
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_EMPLOYES,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": email },
    Limit: 1,
  }));
  return (res.Items || [])[0] || null;
}

/**
 * Fiche employé de l'utilisateur courant.
 * Passe par custom:employeId si présent, sinon par l'adresse.
 */
async function courant(identite) {
  if (!identite) return null;
  if (identite.employeId) {
    const fiche = await parId(identite.employeId);
    if (fiche) return fiche;
  }
  return parEmail(identite.email);
}

/** Libellé d'affichage, sans lecture supplémentaire si la fiche est absente */
function nomComplet(fiche, identite) {
  if (fiche) return `${fiche.prenom} ${fiche.nom}`.trim();
  if (identite) return `${identite.prenom} ${identite.nom}`.trim();
  return "";
}

module.exports = { parId, parEmail, courant, nomComplet };