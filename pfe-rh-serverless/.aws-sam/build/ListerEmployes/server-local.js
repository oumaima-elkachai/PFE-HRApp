/**
 * Serveur local - remplace SAM local start-api sans Docker
 * Lance avec : node server-local.js
 */
const express = require("express");
const app = express();
app.use(express.json());

// Simuler les variables d environnement (comme env.local.json)
process.env.DYNAMODB_ENDPOINT  = "http://localhost:8000";
process.env.TABLE_EMPLOYES     = "Employes-local";
process.env.TABLE_CANDIDATS    = "Candidats-local";
process.env.TABLE_EVENEMENTS   = "Evenements-local";
process.env.TABLE_FACTURES     = "Factures-local";
process.env.TABLE_POINTAGES    = "Pointages-local";
process.env.AWS_REGION         = "us-east-1";

// Importer les handlers Lambda
const listerEmployes  = require("./src/employes/lister");
const creerEmploye    = require("./src/employes/creer");

// Fonction pour convertir requete Express en event Lambda
function toEvent(req) {
  return {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    queryStringParameters: req.query || null,
    pathParameters: req.params || null,
    body: req.body ? JSON.stringify(req.body) : null,
    requestContext: {
      authorizer: {
        claims: { sub: "user-local-test" }
      }
    }
  };
}

// Fonction pour envoyer la reponse Lambda vers Express
function sendResponse(res, lambdaResult) {
  res.status(lambdaResult.statusCode)
     .set(lambdaResult.headers || {})
     .send(lambdaResult.body);
}

// ── Routes Employes ──────────────────────────
app.get("/employes", async (req, res) => {
  const result = await listerEmployes.handler(toEvent(req));
  sendResponse(res, result);
});

app.post("/employes", async (req, res) => {
  const result = await creerEmploye.handler(toEvent(req));
  sendResponse(res, result);
});

// ── Lancer le serveur ────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log("");
  console.log("Serveur RH local demarre !");
  console.log("API disponible sur : http://localhost:" + PORT);
  console.log("");
  console.log("Endpoints disponibles :");
  console.log("  GET  http://localhost:" + PORT + "/employes");
  console.log("  POST http://localhost:" + PORT + "/employes");
  console.log("");
  console.log("Ctrl+C pour arreter");
});
