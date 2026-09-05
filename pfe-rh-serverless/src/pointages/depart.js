// src/pointages/depart.js
// POST /pointages/depart

const { GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, dateAujourdhui, heureLocale } = require("../utils/contexte");
const employes = require("../utils/employe");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

const formaterDuree = (minutes) =>
  `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) return erreur("Aucune fiche employé rattachée à ce compte", 404);

    const aujourdhui = dateAujourdhui();

    // Lecture directe par clé composite : plus aucun parcours de table
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_POINTAGES,
      Key: { employeId: fiche.id, date: aujourdhui },
    }));

    const pointage = res.Item;
    if (!pointage) {
      return erreur("Aucun pointage d'arrivée trouvé pour aujourd'hui", 404);
    }
    if (pointage.statut === "TERMINE") {
      return erreur("Vous avez déjà pointé votre départ aujourd'hui", 409);
    }

    const maintenant = new Date();
    const dureeMinutes = Math.max(
      0,
      Math.round((maintenant - new Date(pointage.heureArrivee)) / 60000)
    );

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_POINTAGES,
        Key: { employeId: fiche.id, date: aujourdhui },
        UpdateExpression:
          "SET heureDepart = :depart, dureeMinutes = :duree, statut = :nouveau",
        // Protège contre un double départ envoyé simultanément
        ConditionExpression: "statut = :encours",
        ExpressionAttributeValues: {
          ":depart": maintenant.toISOString(),
          ":duree": dureeMinutes,
          ":nouveau": "TERMINE",
          ":encours": "EN_COURS",
        },
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur("Vous avez déjà pointé votre départ aujourd'hui", 409);
      }
      throw e;
    }

    const duree = formaterDuree(dureeMinutes);

    return succes({
      pointage: {
        ...pointage,
        heureDepart: maintenant.toISOString(),
        dureeMinutes,
        statut: "TERMINE",
      },
      duree,
      message: `Au revoir ${pointage.employeNom} ! Départ enregistré à ${heureLocale(maintenant)}. Durée : ${duree}`,
    });

  } catch (e) {
    console.error("Erreur pointage départ:", e);
    return erreur("Impossible d'enregistrer le départ");
  }
};