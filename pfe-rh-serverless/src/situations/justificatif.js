// src/situations/justificatif.js
//
// GET /situations/:id/justificatif
//
// Renvoie la pièce jointe d'une demande. Le salarié n'accède qu'à la
// sienne, la RH à toutes.
//
// Ces documents comprennent des certificats médicaux et des cartes
// d'invalidité. Le contrôle d'accès est donc fait AVANT la lecture S3,
// et jamais déduit d'un paramètre de la requête.

const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const depot = require("./depot");
const { erreur, identite, estRh } = require("./commun");

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
const SEAU = process.env.DOCUMENTS_BUCKET || process.env.S3_BUCKET;

async function handler(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const id = event.pathParameters?.id;
  if (!id) return erreur("Identifiant de demande manquant", 400);

  const demande = await depot.demandeParId(id);
  if (!demande) return erreur(`Aucune demande ne porte l'identifiant ${id}`, 404);

  // Le droit d'accès vient du jeton, pas de l'adresse demandée.
  const sienne = demande.employeId === moi.sub;
  if (!sienne && !estRh(moi)) {
    return erreur("Ce justificatif n'est pas le vôtre", 403);
  }

  if (!demande.justificatifKey) {
    return erreur("Cette demande n'a pas de justificatif", 404);
  }
  if (!SEAU) return erreur("Stockage des documents non configuré", 500);

  let objet;
  try {
    objet = await s3.send(new GetObjectCommand({
      Bucket: SEAU,
      Key: demande.justificatifKey,
    }));
  } catch (e) {
    if (e.name === "NoSuchKey") {
      // Dire que le fichier a disparu du stockage, et non que la demande
      // n'existe pas : ce sont deux incidents très différents à traiter.
      return erreur(
        "Le fichier est référencé par la demande mais absent du stockage. "
        + "Signalez-le à l'administrateur.",
        410
      );
    }
    throw e;
  }

  const octets = Buffer.from(await objet.Body.transformToByteArray());

  const nom = demande.justificatifNom
    || decodeURIComponent(objet.Metadata?.nomorigine || "")
    || `justificatif-${id}`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": objet.ContentType || "application/octet-stream",
      // `attachment` et non `inline` : un document médical ne doit pas
      // s'ouvrir par inadvertance dans un onglet resté visible.
      "Content-Disposition": `attachment; filename="${nom.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
    body: octets.toString("base64"),
    isBase64Encoded: true,
  };
}

module.exports = { handler };