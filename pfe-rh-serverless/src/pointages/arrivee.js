// src/pointages/arrivee.js
// POST /pointages/arrivee

const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, dateAujourdhui, heureLocale } = require("../utils/contexte");
const employes = require("../utils/employe");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const fiche = await employes.courant(moi);
    if (!fiche) {
      return erreur(
        "Aucune fiche employé n'est rattachée à ce compte. Contactez les ressources humaines.",
        404
      );
    }

    // Date calculée dans le fuseau de l'entreprise, jamais en UTC :
    // un pointage à 00h30 à Tunis appartient bien au jour en cours.
    const aujourdhui = dateAujourdhui();
    const maintenant = new Date();

    const pointage = {
      employeId: fiche.id, // identifiant de la fiche, pas celui du compte
      date: aujourdhui,
      employeNom: employes.nomComplet(fiche, moi),
      employeEmail: fiche.email,
      poste: fiche.poste || "",
      departement: fiche.departement || "",
      heureArrivee: maintenant.toISOString(),
      heureDepart: null,
      dureeMinutes: null,
      statut: "EN_COURS",
      creeLe: maintenant.toISOString(),
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_POINTAGES,
        Item: pointage,
        // Le doublon quotidien est refusé par le moteur lui-même.
        // Remplace la lecture préalable, qui laissait une fenêtre de
        // concurrence entre la vérification et l'écriture.
        ConditionExpression: "attribute_not_exists(employeId)",
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur("Vous avez déjà pointé votre arrivée aujourd'hui", 409);
      }
      throw e;
    }

    return succes({
      pointage,
      message: `Bonne journée ${pointage.employeNom} ! Arrivée enregistrée à ${heureLocale(maintenant)}`,
    }, 201);

  } catch (e) {
    console.error("Erreur pointage arrivée:", e);
    return erreur("Impossible d'enregistrer l'arrivée");
  }
};