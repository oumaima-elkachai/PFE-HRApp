const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const {
      titre,
      description,
      type,
      dateDebut,
      dateFin,
      lieu,
      participants,
      recurrent,
      frequence,
    } = JSON.parse(event.body || "{}");

    if (!titre || !dateDebut || !type) {
      return erreur("Champs requis : titre, dateDebut, type", 400);
    }

    const typesValides = ["REUNION", "CONGE", "FORMATION", "EVENEMENT", "RAPPEL"];
    if (!typesValides.includes(type)) {
      return erreur("Type invalide. Valeurs : " + typesValides.join(", "), 400);
    }

    const evenement = {
      id:           uuidv4(),
      titre,
      description:  description || "",
      type,
      dateDebut,
      dateFin:      dateFin || dateDebut,
      lieu:         lieu || null,
      participants: participants || [],
      recurrent:    recurrent || false,
      frequence:    frequence || null,
      creePar:      event.user?.email,
      createurId:   event.user?.sub,
      createurNom:  `${event.user?.prenom} ${event.user?.nom}`,
      statut:       "ACTIF",
      creeLe:       new Date().toISOString(),
      misAJourLe:   new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_EVENEMENTS,
      Item:      evenement,
    }));

    return succes({ evenement, message: "Evenement cree avec succes" }, 201);

  } catch (e) {
    console.error("Erreur creer evenement:", e);
    return erreur("Impossible de creer l evenement");
  }
};