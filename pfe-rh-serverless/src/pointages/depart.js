const { UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const employeId = event.user?.sub;
    const employeNom = `${event.user?.prenom} ${event.user?.nom}`;

    if (!employeId) return erreur("Employe non identifie", 401);

    const aujourd_hui = new Date().toISOString().split("T")[0];

    // Chercher le pointage d'aujourd'hui
    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES,
      FilterExpression: "employeId = :eid AND #date = :date",
      ExpressionAttributeNames:  { "#date": "date" },
      ExpressionAttributeValues: {
        ":eid":  employeId,
        ":date": aujourd_hui,
      },
    }));

    if (resultat.Count === 0) {
      return erreur("Aucun pointage d arrivee trouve pour aujourd hui", 404);
    }

    const pointage = resultat.Items[0];

    if (pointage.statut === "TERMINE") {
      return erreur("Vous avez deja pointe votre depart aujourd hui", 409);
    }

    const maintenant = new Date();
    const arrivee    = new Date(pointage.heureArrivee);

    // Calculer la durée en minutes
    const dureeMinutes = Math.round((maintenant - arrivee) / (1000 * 60));
    const heures       = Math.floor(dureeMinutes / 60);
    const minutes      = dureeMinutes % 60;

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_POINTAGES,
      Key: { id: pointage.id },
      UpdateExpression:
        "SET heureDepart = :depart, dureeMinutes = :duree, statut = :statut",
      ExpressionAttributeValues: {
        ":depart": maintenant.toISOString(),
        ":duree":  dureeMinutes,
        ":statut": "TERMINE",
      },
    }));

    const heureFormatee = maintenant.toLocaleTimeString("fr-TN", {
      hour: "2-digit", minute: "2-digit"
    });

    return succes({
      pointage: {
        ...pointage,
        heureDepart:  maintenant.toISOString(),
        dureeMinutes,
        statut: "TERMINE",
      },
      duree:   `${heures}h${minutes.toString().padStart(2, "0")}`,
      message: `Au revoir ${employeNom} ! Depart enregistre a ${heureFormatee}. Duree : ${heures}h${minutes.toString().padStart(2, "0")}`,
    });

  } catch (e) {
    console.error("Erreur pointage depart:", e);
    return erreur("Impossible d enregistrer le depart");
  }
};