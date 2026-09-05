const { ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

// Route protégée RH — voir tous les candidats avec filtres
exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const { statut, posteVise } = params;

    let items;

    if (statut) {
      // Filtrer par statut
      const resultat = await docClient.send(new ScanCommand({
        TableName:        process.env.TABLE_CANDIDATS,
        FilterExpression: "#s = :statut",
        ExpressionAttributeNames:  { "#s": "statut" },
        ExpressionAttributeValues: { ":statut": statut },
      }));
      items = resultat.Items;
    } else {
      // Tous les candidats
      const resultat = await docClient.send(new ScanCommand({
        TableName: process.env.TABLE_CANDIDATS,
      }));
      items = resultat.Items;
    }

    // Filtrer par poste si demandé
    if (posteVise) {
      items = items.filter(c =>
        c.posteVise.toLowerCase().includes(posteVise.toLowerCase())
      );
    }

    // Grouper par statut pour le dashboard Kanban
    const pipeline = {
      SOUMIS:       items.filter(c => c.statut === "SOUMIS"),
      PRESELECTION: items.filter(c => c.statut === "PRESELECTION"),
      ENTRETIEN:    items.filter(c => c.statut === "ENTRETIEN"),
      OFFRE:        items.filter(c => c.statut === "OFFRE"),
      EMBAUCHE:     items.filter(c => c.statut === "EMBAUCHE"),
      REFUSE:       items.filter(c => c.statut === "REFUSE"),
    };

    return succes({
      candidats: items,
      total:     items.length,
      pipeline,
      stats: {
        total:        items.length,
        soumis:       pipeline.SOUMIS.length,
        preselection: pipeline.PRESELECTION.length,
        entretien:    pipeline.ENTRETIEN.length,
        offre:        pipeline.OFFRE.length,
        embauche:     pipeline.EMBAUCHE.length,
        refuse:       pipeline.REFUSE.length,
      },
    });

  } catch (e) {
    console.error("Erreur lister candidats:", e);
    return erreur("Impossible de recuperer les candidats");
  }
};