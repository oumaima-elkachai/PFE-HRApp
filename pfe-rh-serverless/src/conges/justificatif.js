// src/conges/justificatif.js
// GET /conges/:id/justificatif
//
// Un certificat médical est une donnée de santé. Il n'est lisible que
// par son titulaire et par les ressources humaines — jamais par un
// collègue, même avec l'identifiant du congé.

const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const documents = require("../services/documents");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";

// Le type MIME est déduit de l'extension : le navigateur affiche un
// PDF en ligne, et un octet-stream déclencherait un téléchargement.
const TYPES_MIME = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function typeMime(cle) {
  const extension = String(cle).split(".").pop()?.toLowerCase();
  return TYPES_MIME[extension] ?? "application/octet-stream";
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    if (!id) return erreur("Identifiant du congé manquant", 400);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_CONGES,
      Key: { id },
    }));

    const conge = res.Item;
    if (!conge) return erreur("Demande de congé introuvable", 404);
    if (!conge.justificatifKey) {
      return erreur("Aucun justificatif n'est joint à cette demande", 404);
    }

    // Le contrôle porte sur la fiche salarié, pas sur le compte : un
    // même employé peut avoir changé d'identifiant Cognito.
    if (!estRole(moi, "RH")) {
      const fiche = await employes.courant(moi);
      if (!fiche || fiche.id !== conge.employeId) {
        // Le message ne distingue pas « introuvable » de « interdit » :
        // sinon l'existence d'un congé se devine par essais.
        return erreur("Demande de congé introuvable", 404);
      }
    }

    const fichier = await documents.lireDocument(conge.justificatifKey);
    if (!fichier) return erreur("Justificatif indisponible", 404);

    const nom = conge.justificatifNom || "justificatif";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": typeMime(conge.justificatifKey),
        // inline plutôt qu'attachment : le salarié veut regarder sa
        // pièce, pas la télécharger à chaque consultation.
        "Content-Disposition": `inline; filename="${encodeURIComponent(nom)}"`,
        // Une donnée de santé ne se met pas en cache partagé.
        "Cache-Control": "private, no-store",
      },
      body: fichier.toString("base64"),
      isBase64Encoded: true,
    };

  } catch (e) {
    console.error("Erreur lecture du justificatif de congé:", e);
    return erreur("Impossible de lire le justificatif");
  }
};