// src/employes/supprimer.js
// DELETE /employes/:id
//
// On archive au lieu de supprimer physiquement (bonne pratique RH) :
// les pointages, bulletins et congés du salarié restent rattachés à
// une fiche existante, et l'historique reste lisible.
//
// Le gabarit biométrique, lui, est bel et bien supprimé. C'est la
// seule donnée du dossier qui n'a plus aucune base légale dès que le
// salarié quitte les effectifs : l'archive sert à conserver un
// historique, pas à garder un visage reconnaissable.

const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");
const biometrie = require("../biometrie/biometrie");

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

    // ── Purge du gabarit facial ──
    //
    // Placée APRÈS l'archivage, jamais avant : si l'écriture
    // ci-dessus échoue, on ne veut pas avoir déjà effacé le gabarit
    // d'un salarié toujours en poste.
    //
    // purger() ne lève pas — l'absence de gabarit (salarié jamais
    // enrôlé, ce qui sera le cas de la plupart) n'est pas une erreur.
    // Et un échec de purge ne doit pas faire échouer l'archivage :
    // mieux vaut un gabarit orphelin signalé dans les journaux qu'une
    // fiche à moitié archivée.
    await biometrie.purger(id);

    return succes({
      message: `Employe ${existant.Item.prenom} ${existant.Item.nom} archive avec succes`,
      id,
    });

  } catch (e) {
    console.error("Erreur supprimer employe:", e);
    return erreur("Impossible d archiver l employe");
  }
};