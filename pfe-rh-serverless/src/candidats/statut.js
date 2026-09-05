const { UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");

const PIPELINE = ["SOUMIS", "PRESELECTION", "ENTRETIEN", "OFFRE", "EMBAUCHE", "REFUSE"];

exports.handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    const { statut, commentaire } = JSON.parse(event.body || "{}");

    if (!id) {
      return erreur("ID candidat manquant", 400);
    }

    if (!statut || !PIPELINE.includes(statut)) {
      return erreur(
        "Statut invalide. Valeurs : " + PIPELINE.join(", "), 400
      );
    }

    // Vérifier que le candidat existe
    const existant = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_CANDIDATS,
      Key: { id },
    }));

    if (!existant.Item) {
      return nonTrouve("Candidat");
    }

    const ancienStatut = existant.Item.statut;

    // Ajouter à l'historique
    const historique = existant.Item.historiqueStatuts || [];
    historique.push({
      statut,
      ancienStatut,
      date:        new Date().toISOString(),
      commentaire: commentaire || "",
      modifiePar:  event.user?.email || "RH",
    });

    // Mettre à jour
    const resultat = await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_CANDIDATS,
      Key: { id },
      UpdateExpression:
        "SET #s = :statut, historiqueStatuts = :historique, misAJourLe = :date",
      ExpressionAttributeNames:  { "#s": "statut" },
      ExpressionAttributeValues: {
        ":statut":    statut,
        ":historique": historique,
        ":date":      new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    }));

    return succes({
      candidat:    resultat.Attributes,
      message:     `Statut mis a jour : ${ancienStatut} → ${statut}`,
    });

  } catch (e) {
    console.error("Erreur changement statut:", e);
    return erreur("Impossible de modifier le statut");
  }
};