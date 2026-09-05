// src/utils/dynamodb.js — VERSION CORRIGÉE
const { DynamoDBClient }         = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const isLocal = !!process.env.DYNAMODB_ENDPOINT;
// ↑ true si DYNAMODB_ENDPOINT est défini (local)
//   false si vide (AWS réel)

const config = isLocal
  ? {
      // ── MODE LOCAL ──────────────────────────
      region:   "us-east-1",
      endpoint: process.env.DYNAMODB_ENDPOINT, // "http://localhost:8000"
      credentials: {
        accessKeyId:     "local",
        secretAccessKey: "local",
      },
    }
  : {
      // ── MODE AWS RÉEL ───────────────────────
      region: process.env.AWS_REGION || "eu-west-3",
      // Pas de credentials ici !
      // → AWS SDK lit automatiquement :
      //   1. Variables d'env AWS_ACCESS_KEY_ID
      //   2. Fichier ~/.aws/credentials
      //   3. IAM Role (si sur Lambda)
    };

const client = new DynamoDBClient(config);

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    // ↑ Évite les erreurs si un champ est undefined
  },
});

// Log pour savoir quel mode est actif
console.log(
  isLocal
    ? `🔧 DynamoDB LOCAL → ${process.env.DYNAMODB_ENDPOINT}`
    : `☁️  DynamoDB AWS  → ${config.region}`
);

module.exports = { client, docClient };