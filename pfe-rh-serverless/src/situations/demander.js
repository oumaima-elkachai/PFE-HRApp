// src/situations/demander.js
//
// POST /situations
//
// Le salarié déclare une nouvelle situation familiale et joint la pièce
// qui l'établit. Rien n'est écrit dans Employes : la demande attend une
// validation RH. C'est le seul point d'entrée du salarié.

const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");

const depot = require("./depot");
const { succes, erreur, identite, corpsDe } = require("./commun");

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
const SEAU = process.env.DOCUMENTS_BUCKET || process.env.S3_BUCKET;

// Préfixe DÉDIÉ, et non le dossier des CV.
//
// Ces pièces comprennent des certificats médicaux : une donnée de santé,
// qui n'a rien à faire à côté des CV de candidats, lesquels sont
// consultés par d'autres personnes et pour d'autres motifs. La fonction
// stockerCv du projet ignore son second argument — c'est précisément ce
// défaut qui rangeait les certificats de congé maladie sous cvs/.
const PREFIXE = "situations";

const TYPES_ACCEPTES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const TAILLE_MAX = 8 * 1024 * 1024; // 8 Mio

async function stockerJustificatif(employeId, fichier) {
  if (!SEAU) {
    throw Object.assign(new Error("Stockage des documents non configuré"), { code: 500 });
  }
  if (!TYPES_ACCEPTES.has(fichier.mimetype)) {
    throw Object.assign(
      new Error("Le justificatif doit être un PDF ou une image (JPEG, PNG, WebP)"),
      { code: 400 }
    );
  }
  if (fichier.size > TAILLE_MAX) {
    throw Object.assign(new Error("Le justificatif ne doit pas dépasser 8 Mo"), { code: 400 });
  }

  const extension = (fichier.originalname.match(/\.[A-Za-z0-9]+$/) || [""])[0].toLowerCase();
  const cle = `${PREFIXE}/${employeId}/${randomUUID()}${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: SEAU,
    Key: cle,
    Body: fichier.buffer,
    ContentType: fichier.mimetype,
    // Le nom d'origine sert à proposer un téléchargement lisible, sans
    // le faire figurer dans la clé : un nom de fichier peut contenir le
    // nom d'une pathologie.
    Metadata: { nomorigine: encodeURIComponent(fichier.originalname) },
  }));

  return { cle, nom: fichier.originalname };
}

/**
 * @param {object} event
 * @param {object} [fichier] pièce jointe fournie par le middleware multer
 */
async function handler(event, fichier) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  // Un compte RH n'est pas forcément un salarié : il gère des fiches
  // sans en avoir une. L'écran de déclaration est un écran de SALARIÉ.
  const employeId = moi.sub;
  if (!employeId) {
    return erreur("Le jeton ne porte aucun identifiant utilisateur", 401);
  }

  const fiche = await depot.ficheEmploye(employeId);
  if (!fiche) {
    return erreur(
      `Aucune fiche employé n'est rattachée au compte ${moi.email || employeId}. `
      + `Contactez les ressources humaines.`,
      404
    );
  }

  const corps = corpsDe(event);
  const { situation, soucis } = depot.validerSituation(corps.situation ?? corps);
  if (soucis.length) return erreur(soucis.join(" · "), 400);

  const changements = depot.comparer(fiche, situation);
  if (changements.length === 0) {
    return erreur("Votre situation déclarée est identique à celle déjà enregistrée", 409);
  }

  const dejaEnAttente = await depot.demandeEnAttenteDe(employeId);
  if (dejaEnAttente) {
    return erreur(
      "Une demande est déjà en attente de validation. "
      + "Attendez sa réponse ou demandez son annulation aux ressources humaines.",
      409
    );
  }

  // Le justificatif est la règle, et la dispense l'exception : chacun de
  // ces champs ouvre droit à de l'argent. Seule une déclaration qui
  // DIMINUE le droit en est dispensée — personne ne fraude contre
  // soi-même, et exiger une pièce découragerait les mises à jour
  // honnêtes, qui sont celles dont la paie a besoin.
  const dispense = depot.seulementEnBaisse(changements);
  if (!fichier && !dispense) {
    return erreur(
      "Un justificatif est obligatoire : acte de naissance, fiche d'état civil, "
      + "certificat de scolarité ou carte d'invalidité selon le changement déclaré.",
      400
    );
  }

  let justificatif = null;
  if (fichier) {
    try {
      justificatif = await stockerJustificatif(employeId, fichier);
    } catch (e) {
      return erreur(e.message, e.code || 500);
    }
  }

  const demande = await depot.creerDemande({
    employeId,
    email: moi.email,
    situation,
    changements,
    motif: corps.motif,
    justificatif,
  });

  return succes(
    {
      demande,
      message: dispense && !fichier
        ? "Déclaration enregistrée sans justificatif : elle ne fait que réduire vos abattements."
        : "Déclaration transmise aux ressources humaines pour validation.",
    },
    201
  );
}

module.exports = { handler, stockerJustificatif, PREFIXE };