const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const { type, mois, dateDebut, dateFin } = params;

    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_EVENEMENTS,
    }));

    let evenements = resultat.Items;

    // Filtrer par type
    if (type) {
      evenements = evenements.filter(e => e.type === type);
    }

    // Filtrer par mois (ex: 2026-05)
    if (mois) {
      evenements = evenements.filter(e =>
        e.dateDebut.startsWith(mois)
      );
    }

    // Filtrer par plage de dates
    if (dateDebut && dateFin) {
      evenements = evenements.filter(e =>
        e.dateDebut >= dateDebut && e.dateDebut <= dateFin
      );
    }

    // Trier par date croissante
    evenements.sort((a, b) =>
      new Date(a.dateDebut) - new Date(b.dateDebut)
    );

    // Grouper par type pour la vue calendrier
    const parType = {
      REUNION:    evenements.filter(e => e.type === "REUNION"),
      CONGE:      evenements.filter(e => e.type === "CONGE"),
      FORMATION:  evenements.filter(e => e.type === "FORMATION"),
      EVENEMENT:  evenements.filter(e => e.type === "EVENEMENT"),
      RAPPEL:     evenements.filter(e => e.type === "RAPPEL"),
    };

    return succes({
      evenements,
      total: evenements.length,
      parType,
      stats: {
        reunions:   parType.REUNION.length,
        conges:     parType.CONGE.length,
        formations: parType.FORMATION.length,
        evenements: parType.EVENEMENT.length,
        rappels:    parType.RAPPEL.length,
      },
    });

  } catch (e) {
    console.error("Erreur lister evenements:", e);
    return erreur("Impossible de recuperer les evenements");
  }
};