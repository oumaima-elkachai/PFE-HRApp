// src/conges/traiter.js
// PATCH /conges/:id

const { UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const { v4: uuidv4 } = require("uuid");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";
const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

// Statuts en majuscules, conformes à ce que produit la migration et à ce
// qu'attend le calcul de paie. Les variantes minuscules sont acceptées en
// entrée pour ne pas casser le front pendant la transition.
const CORRESPONDANCE = {
  approuve: "APPROUVE", APPROUVE: "APPROUVE",
  refuse: "REFUSE", REFUSE: "REFUSE",
};

/**
 * Jours de la période où le salarié a déjà pointé.
 *
 * ── Pourquoi ce contrôle existe ─────────────────────────────────────
 *
 * Le pointage refuse désormais un salarié en congé accordé. Le trou
 * symétrique restait ouvert : accorder un congé sur des jours déjà
 * pointés produit exactement l'incohérence que ce refus évite — une
 * journée travaillée ET un jour de congé décompté pour la même date,
 * donc une paie fausse des deux côtés.
 *
 * ── Pourquoi il avertit au lieu de bloquer ──────────────────────────
 *
 * La RH a le droit de trancher. Le pointage peut être une erreur, le
 * salarié peut être venu une heure avant de partir, le congé peut être
 * rétroactif et légitime. Refuser la validation mettrait la RH dans une
 * impasse sans lui dire quoi faire.
 *
 * Elle est donc informée, avec les dates, et décide. Un échec de ce
 * contrôle ne remonte pas non plus : il ne doit jamais empêcher une
 * décision que la RH a le droit de prendre.
 */
async function joursDejaPointes(employeId, dateDebut, dateFin) {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_POINTAGES,
      KeyConditionExpression: "employeId = :e AND #d BETWEEN :debut AND :fin",
      ExpressionAttributeNames: { "#d": "date" },
      ExpressionAttributeValues: {
        ":e": employeId,
        ":debut": String(dateDebut).slice(0, 10),
        ":fin": String(dateFin ?? dateDebut).slice(0, 10),
      },
    }));

    // Une journée sans segment est une ligne vide, pas un pointage.
    return (res.Items ?? [])
      .filter((j) => Array.isArray(j.segments) && j.segments.length > 0)
      .map((j) => j.date)
      .sort();
  } catch (e) {
    console.error("Contrôle des pointages sur la période impossible :", e);
    return [];
  }
}

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

    // ── Jours déjà pointés ──
    //
    // Après la décision, jamais avant : la validation est acquise, et
    // ce contrôle ne doit pas pouvoir la faire échouer. Il ne sert qu'à
    // informer.
    let avertissement = "";
    let conflits = [];

    if (nouveauStatut === "APPROUVE") {
      conflits = await joursDejaPointes(conge.employeId, conge.dateDebut, conge.dateFin);

      if (conflits.length > 0) {
        const enFrancais = (iso) =>
          new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
            day: "numeric", month: "long",
          });

        const liste = conflits.slice(0, 5).map(enFrancais).join(", ");
        const reste = conflits.length > 5 ? ` et ${conflits.length - 5} autre(s)` : "";

        avertissement =
          ` Attention : ${conflits.length} jour(s) de cette période sont déjà pointés`
          + ` (${liste}${reste}). Vérifiez la paie du mois.`;
      }
    }

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
      // Les dates en conflit sont renvoyées à part, pas seulement dans
      // la phrase : l'interface RH pourra les surligner sans avoir à
      // analyser un message destiné à être lu.
      joursDejaPointes: conflits,
      message: `Demande ${nouveauStatut === "APPROUVE" ? "approuvée" : "refusée"}`
        + avertissement,
    });

  } catch (e) {
    console.error("Erreur traitement congé:", e);
    return erreur("Erreur lors du traitement de la demande : " + e.message);
  }
};