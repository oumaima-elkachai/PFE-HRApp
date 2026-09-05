// src/conges/traiter.js
// PATCH /conges/:id

const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const { v4: uuidv4 } = require("uuid");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";

// Statuts en majuscules, conformes à ce que produit la migration et à ce
// qu'attend le calcul de paie. Les variantes minuscules sont acceptées en
// entrée pour ne pas casser le front pendant la transition.
const CORRESPONDANCE = {
  approuve: "APPROUVE", APPROUVE: "APPROUVE",
  refuse: "REFUSE", REFUSE: "REFUSE",
};

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const id = event.pathParameters?.id;
    const { statut, commentaire } = body;

    if (!id) return erreur("id requis", 400);

    const nouveauStatut = CORRESPONDANCE[statut];
    if (!nouveauStatut) {
      return erreur("statut doit valoir APPROUVE ou REFUSE", 400);
    }

    let resultat;
    try {
      resultat = await docClient.send(new UpdateCommand({
        TableName: TABLE_CONGES,
        Key: { id },
        UpdateExpression:
          "SET #s = :statut, traiteLe = :traiteLe, traiteParId = :parId, " +
          "traitePar = :par, commentaireRH = :commentaire",
        // Garantit que la demande existe et n'a pas déjà été tranchée
        ConditionExpression: "attribute_exists(id) AND #s = :attente",
        ExpressionAttributeNames: { "#s": "statut" },
        ExpressionAttributeValues: {
          ":statut": nouveauStatut,
          ":attente": "EN_ATTENTE",
          ":traiteLe": new Date().toISOString(),
          ":parId": moi.userId,
          ":par": `${moi.prenom} ${moi.nom}`.trim() || moi.email,
          ":commentaire": commentaire || "",
        },
        ReturnValues: "ALL_NEW",
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur(
          "Demande introuvable ou déjà traitée",
          409
        );
      }
      throw e;
    }

    const conge = resultat.Attributes;

    // Notification à l'employé. Un échec ici ne doit pas annuler la
    // décision, qui est déjà enregistrée.
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NOTIFICATIONS,
        Item: {
          id: uuidv4(),
          userId: conge.employeId,
          type: "CONGE_TRAITE",
          titre: nouveauStatut === "APPROUVE" ? "Congé accordé" : "Congé refusé",
          message: `Votre demande du ${conge.dateDebut} au ${conge.dateFin} a été ${
            nouveauStatut === "APPROUVE" ? "approuvée" : "refusée"
          }.${commentaire ? ` ${commentaire}` : ""}`,
          lu: false,
          creeLe: new Date().toISOString(),
          expireLe: Math.floor(Date.now() / 1000) + 90 * 24 * 3600,
          metadata: { congeId: conge.id, statut: nouveauStatut },
        },
      }));
    } catch (e) {
      console.error("Notification non envoyée:", e.message);
    }

    return succes({
      conge,
      message: `Demande ${nouveauStatut === "APPROUVE" ? "approuvée" : "refusée"}`,
    });

  } catch (e) {
    console.error("Erreur traitement congé:", e);
    return erreur("Erreur lors du traitement de la demande : " + e.message);
  }
};