const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const employeId = event.user?.sub;
    const employeNom = `${event.user?.prenom} ${event.user?.nom}`;

    if (!employeId) return erreur("Employe non identifie", 401);

    const aujourd_hui = new Date().toISOString().split("T")[0];

    // Vérifier s'il a déjà pointé aujourd'hui
    const existant = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES,
      FilterExpression: "employeId = :eid AND #date = :date",
      ExpressionAttributeNames:  { "#date": "date" },
      ExpressionAttributeValues: {
        ":eid":  employeId,
        ":date": aujourd_hui,
      },
    }));

    if (existant.Count > 0) {
      return erreur("Vous avez deja pointe votre arrivee aujourd hui", 409);
    }

    const maintenant = new Date();

    const pointage = {
      id:           uuidv4(),
      employeId,
      employeNom,
      date:         aujourd_hui,
      heureArrivee: maintenant.toISOString(),
      heureDepart:  null,
      dureeMinutes: null,
      statut:       "EN_COURS",
      creeLe:       maintenant.toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_POINTAGES,
      Item:      pointage,
    }));

    // Formater l'heure pour l'affichage
    const heureFormatee = maintenant.toLocaleTimeString("fr-TN", {
      hour: "2-digit", minute: "2-digit"
    });

    return succes({
      pointage,
      message: `Bonne journee ${employeNom} ! Arrivee enregistree a ${heureFormatee}`,
    }, 201);

  } catch (e) {
    console.error("Erreur pointage arrivee:", e);
    return erreur("Impossible d enregistrer l arrivee");
  }
};