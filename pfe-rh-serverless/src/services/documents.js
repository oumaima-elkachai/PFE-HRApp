// src/services/documents.js
//
// Stockage des documents de candidature sur S3.
//
// Jusqu'ici le CV etait lu, analyse, puis jete : cvFileName etait
// enregistre mais le fichier n'existait nulle part. Aucun recruteur ne
// pouvait le consulter.
//
// En local, les fichiers sont ecrits sur disque sous tmp/ : un seul
// code sert les deux environnements.

const fs = require("fs/promises");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
  require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");

const BUCKET = process.env.DOCUMENTS_BUCKET;
const s3 = BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

const EXTENSIONS = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Correspondance inverse, pour la lecture locale : S3 conserve le
// ContentType declare au televersement, le disque non.
const TYPES_MIME = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Enregistre un CV et retourne sa cle.
 *
 * L'annee dans le chemin permet une regle de cycle de vie S3 :
 * archivage apres un an, suppression apres trois ans.
 */
async function stockerCv(fichier, prefixe = "cvs") {
  if (!fichier?.buffer?.length) return null;

  const extension = EXTENSIONS[fichier.mimetype] ?? path.extname(fichier.originalname) ?? "";
  const cle = `${prefixe}/${new Date().getFullYear()}/${randomUUID()}${extension}`;
  
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: cle,
      Body: fichier.buffer,
      ContentType: fichier.mimetype,
      ServerSideEncryption: "AES256",
      // Le nom d'origine est conserve ici plutot que dans le chemin :
      // il peut contenir des accents et des espaces.
      Metadata: { nomorigine: encodeURIComponent(fichier.originalname || "cv") },
    }));
    return cle;
  }

  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, fichier.buffer);
  console.log(`CV local : ${destination}`);
  return cle;
}

/**
 * URL de telechargement temporaire.
 *
 * Sur AWS, une URL pre-signee evite de faire transiter le fichier par
 * Lambda : le navigateur telecharge directement depuis S3.
 * En local, la lecture se fait par la route de secours.
 */
async function urlTelechargement(cle, dureeSecondes = 300) {
  if (!cle) return null;
  if (!s3) return null;

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: cle }),
    { expiresIn: dureeSecondes }
  );
}

/** Lecture directe, utilisee en local et en repli */
async function lireDocument(cle) {
  if (!cle) return null;

  if (s3) {
    const objet = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }));
    return { flux: objet.Body, type: objet.ContentType };
  }

  const chemin = path.join(process.cwd(), "tmp", cle);
  try {
    await fs.access(chemin);
  } catch {
    return null;
  }

  const contenu = await fs.readFile(chemin);

  // Le type est deduit de l'extension : sans lui, le navigateur
  // telecharge le fichier au lieu de l'afficher, et un justificatif
  // en image reste illisible.
  const extension = path.extname(cle).toLowerCase();
  const type = TYPES_MIME[extension] || "application/octet-stream";

  return { contenu, type };
}
async function supprimerDocument(cle) {
  if (!cle) return;

  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: cle }));
    return;
  }

  try {
    await fs.unlink(path.join(process.cwd(), "tmp", cle));
  } catch {
    /* deja absent */
  }
}

module.exports = { stockerCv, urlTelechargement, lireDocument, supprimerDocument };