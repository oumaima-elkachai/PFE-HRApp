// backend/services/s3Service.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuration AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'terra-rh-cvs';

/**
 * Upload un fichier vers S3
 * @param {Object} file - Fichier multer (req.file)
 * @param {String} folder - Dossier dans S3 (ex: 'cvs')
 * @returns {Object} { url, filename, key }
 */
async function uploadFile(file, folder = 'cvs') {
  try {
    const fileExtension = path.extname(file.originalname);
    const filename = `${uuidv4()}${fileExtension}`;
    const key = `${folder}/${filename}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private', // ou 'public-read' si vous voulez des URLs publiques
    };

    const result = await s3.upload(params).promise();

    return {
      url: result.Location,
      filename: file.originalname,
      key: key
    };

  } catch (error) {
    console.error('❌ Erreur upload S3:', error);
    throw new Error('Erreur lors de l\'upload du fichier');
  }
}

/**
 * Générer une URL signée pour télécharger un fichier privé
 * @param {String} key - Clé S3 du fichier
 * @param {Number} expiresIn - Durée de validité en secondes (default: 1h)
 * @returns {String} URL signée
 */
function getSignedUrl(key, expiresIn = 3600) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn
  };

  return s3.getSignedUrl('getObject', params);
}

/**
 * Supprimer un fichier de S3
 * @param {String} key - Clé S3 du fichier
 */
async function deleteFile(key) {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    await s3.deleteObject(params).promise();
    console.log('✅ Fichier supprimé de S3:', key);

  } catch (error) {
    console.error('❌ Erreur suppression S3:', error);
    throw error;
  }
}

module.exports = {
  uploadFile,
  getSignedUrl,
  deleteFile
};