// services/s3Service.js
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.DOCUMENTS_BUCKET;

// Le front uploade DIRECTEMENT sur S3 avec cette URL — Lambda ne voit jamais le fichier
async function urlUpload({ nomFichier, mimetype, prefixe = "cvs" }) {
  const extension = nomFichier.slice(nomFichier.lastIndexOf("."));
  const cle = `${prefixe}/${new Date().getFullYear()}/${randomUUID()}${extension}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: cle, ContentType: mimetype }),
    { expiresIn: 300 }
  );

  return { url, cle, nomOriginal: nomFichier };
}

async function urlTelechargement(cle, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: cle }), { expiresIn });
}

async function supprimer(cle) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: cle }));
}

module.exports = { urlUpload, urlTelechargement, supprimer };