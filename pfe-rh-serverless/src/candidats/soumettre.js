const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");

// Route publique — le candidat soumet sans être connecté
exports.handler = async (event) => {
  try {
    const {
      nom,
      prenom,
      email,
      telephone,
      posteVise,
      niveauEtude,
      experience,
      competences,
      lettreMotivation,
    } = JSON.parse(event.body || "{}");

    if (!nom || !prenom || !email || !posteVise) {
      return erreur("Champs requis : nom, prenom, email, posteVise", 400);
    }

    const candidat = {
      id:               uuidv4(),
      nom,
      prenom,
      email,
      telephone:        telephone || null,
      posteVise,
      niveauEtude:      niveauEtude || null,
      experience:       experience || null,
      competences:      competences || [],
      lettreMotivation: lettreMotivation || null,
      statut:           "SOUMIS",
      historiqueStatuts: [
        {
          statut:      "SOUMIS",
          date:        new Date().toISOString(),
          commentaire: "Candidature soumise",
        },
      ],
      soumisLe:    new Date().toISOString(),
      misAJourLe:  new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_CANDIDATS,
      Item:      candidat,
    }));

    return succes({
      candidat,
      message: "Candidature soumise avec succes ! Nous vous contacterons bientot.",
    }, 201);

  } catch (e) {
    console.error("Erreur soumettre candidature:", e);
    return erreur("Impossible de soumettre la candidature");
  }
};