// server-aws.js
const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ════════════════════════════════════════════
// VARIABLES D'ENVIRONNEMENT → AWS RÉEL
// ════════════════════════════════════════════
// DYNAMODB_ENDPOINT vide = dynamodb.js utilise AWS
process.env.DYNAMODB_ENDPOINT  = "";
process.env.AWS_REGION         = "eu-west-3";

// Noms des tables SANS suffixe (créées par migrate-aws.js)
process.env.TABLE_USERS        = "Users";
process.env.TABLE_EMPLOYES     = "Employes";
process.env.TABLE_CANDIDATS    = "Candidats";
process.env.TABLE_CANDIDATURES = "Candidatures";
process.env.TABLE_EVENEMENTS   = "Evenements";
process.env.TABLE_FACTURES     = "Factures";
process.env.TABLE_POINTAGES    = "Pointages";
process.env.TABLE_OFFRES       = "Offres";
process.env.TABLE_CONGES       = "Conges";
process.env.TABLE_NOTIFICATIONS= "Notifications";
process.env.JWT_SECRET         = "pfe-rh-secret-aws-2026";

// ════════════════════════════════════════════
// IMPORTS HANDLERS (identiques à server-local)
// ════════════════════════════════════════════
const { authentifier, autoriser } = require("./src/auth/middleware");

const inscription      = require("./src/auth/inscription");
const connexion        = require("./src/auth/connexion");
const profil           = require("./src/auth/profil");
const listerEmployes   = require("./src/employes/lister");
const creerEmploye     = require("./src/employes/creer");
const detailEmploye    = require("./src/employes/detail");
const modifierEmploye  = require("./src/employes/modifier");
const supprimerEmploye = require("./src/employes/supprimer");
const soumettreCandidat= require("./src/candidats/soumettre");
const listerCandidats  = require("./src/candidats/lister");
const statutCandidat   = require("./src/candidats/statut");
const detailCandidat   = require("./src/candidats/detail");
const pointageArrivee  = require("./src/pointages/arrivee");
const pointageDepart   = require("./src/pointages/depart");
const historiquePointages = require("./src/pointages/historique");
const creerEvenement   = require("./src/calendrier/creer");
const listerEvenements = require("./src/calendrier/lister");
const modifierEvenement= require("./src/calendrier/modifier");
const supprimerEvenement=require("./src/calendrier/supprimer");
const genererFacture   = require("./src/factures/generer");
const listerFactures   = require("./src/factures/lister");
const dashboardStats   = require("./src/dashboard/stats");
const demanderConge    = require("./src/conges/demander");
const listerConges     = require("./src/conges/lister");
const traiterConge     = require("./src/conges/traiter");
//const listerOffres     = require("./src/offres/lister");
//const creerOffre       = require("./src/offres/creer");
//const modifierOffre    = require("./src/offres/modifier");
//const supprimerOffre   = require("./src/offres/supprimer");

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

// Convertit req Express → format event Lambda AWS
// Pourquoi ? Tes handlers sont écrits pour Lambda
// Ce helper les rend compatibles avec Express aussi
function toEvent(req) {
  return {
    httpMethod:            req.method,
    path:                  req.path,
    headers:               req.headers,
    queryStringParameters: Object.keys(req.query).length
                             ? req.query : null,
    pathParameters:        Object.keys(req.params).length
                             ? req.params : null,
    body:                  req.body
                             ? JSON.stringify(req.body) : null,
    user:                  req.user || null,
  };
}

// Parse la réponse Lambda → réponse Express
function sendResponse(res, result) {
  const body = typeof result.body === "string"
    ? JSON.parse(result.body)
    : result.body;
  res.status(result.statusCode).json(body);
}

// ════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════

// Health check — tester que le serveur répond
app.get("/health", (req, res) => {
  res.json({
    statut:    "OK",
    mode:      "AWS DynamoDB",
    region:    process.env.AWS_REGION,
    timestamp: new Date().toISOString(),
    tables: {
      users:      process.env.TABLE_USERS,
      employes:   process.env.TABLE_EMPLOYES,
      //offres:     process.env.TABLE_OFFRES,
      evenements: process.env.TABLE_EVENEMENTS,
      conges:     process.env.TABLE_CONGES,
    },
  });
});

// Auth (public — pas besoin de token)
app.post("/auth/inscription", async (req, res) => {
  sendResponse(res, await inscription.handler(toEvent(req)));
});
app.post("/auth/connexion", async (req, res) => {
  sendResponse(res, await connexion.handler(toEvent(req)));
});
app.get("/auth/profil", authentifier, async (req, res) => {
  sendResponse(res, await profil.handler(toEvent(req)));
});

// Employés (protégé — token requis)
app.get   ("/employes",     authentifier,               async (req, res) =>
  sendResponse(res, await listerEmployes.handler(toEvent(req))));
app.post  ("/employes",     authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await creerEmploye.handler(toEvent(req))));
app.get   ("/employes/:id", authentifier,               async (req, res) =>
  sendResponse(res, await detailEmploye.handler(toEvent(req))));
app.put   ("/employes/:id", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await modifierEmploye.handler(toEvent(req))));
app.delete("/employes/:id", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await supprimerEmploye.handler(toEvent(req))));

// Offres
//app.get   ("/offres",     async (req, res) =>
//  sendResponse(res, await listerOffres.handler(toEvent(req))));
//app.post  ("/offres",     authentifier, autoriser("RH"), async (req, res) =>
//  sendResponse(res, await creerOffre.handler(toEvent(req))));
//app.put   ("/offres/:id", authentifier, autoriser("RH"), async (req, res) =>
//  sendResponse(res, await modifierOffre.handler(toEvent(req))));
//app.delete("/offres/:id", authentifier, autoriser("RH"), async (req, res) =>
//  sendResponse(res, await supprimerOffre.handler(toEvent(req))));

// Candidats
app.post ("/candidats",           async (req, res) =>
  sendResponse(res, await soumettreCandidat.handler(toEvent(req))));
app.get  ("/candidats",           authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await listerCandidats.handler(toEvent(req))));
app.get  ("/candidats/:id",       authentifier, async (req, res) =>
  sendResponse(res, await detailCandidat.handler(toEvent(req))));
app.patch("/candidats/:id/statut",authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await statutCandidat.handler(toEvent(req))));

// Pointages
app.post("/pointages/arrivee", authentifier, async (req, res) =>
  sendResponse(res, await pointageArrivee.handler(toEvent(req))));
app.post("/pointages/depart",  authentifier, async (req, res) =>
  sendResponse(res, await pointageDepart.handler(toEvent(req))));
app.get ("/pointages",         authentifier, async (req, res) =>
  sendResponse(res, await historiquePointages.handler(toEvent(req))));

// Événements
app.get   ("/evenements",     authentifier, async (req, res) =>
  sendResponse(res, await listerEvenements.handler(toEvent(req))));
app.post  ("/evenements",     authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await creerEvenement.handler(toEvent(req))));
app.put   ("/evenements/:id", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await modifierEvenement.handler(toEvent(req))));
app.delete("/evenements/:id", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await supprimerEvenement.handler(toEvent(req))));

// Factures
app.post("/factures", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await genererFacture.handler(toEvent(req))));
app.get ("/factures", authentifier, async (req, res) =>
  sendResponse(res, await listerFactures.handler(toEvent(req))));

// Congés
app.get  ("/conges",     authentifier, async (req, res) =>
  sendResponse(res, await listerConges.handler(toEvent(req))));
app.post ("/conges",     authentifier, async (req, res) =>
  sendResponse(res, await demanderConge.handler(toEvent(req))));
app.patch("/conges/:id", authentifier, autoriser("RH"), async (req, res) =>
  sendResponse(res, await traiterConge.handler(toEvent(req))));

// Dashboard
app.get("/dashboard/stats", authentifier, async (req, res) =>
  sendResponse(res, await dashboardStats.handler(toEvent(req))));

// ════════════════════════════════════════════
// DÉMARRAGE
// ════════════════════════════════════════════
const PORT = 5001;
app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     🚀 SERVER-AWS DÉMARRÉ               ║");
  console.log(`║     Port   : ${PORT}                        ║`);
  console.log("║     Mode   : AWS DynamoDB (eu-west-3)   ║");
  console.log("║     Tables : Users, Employes, Offres... ║");
  console.log("╚══════════════════════════════════════════╝");
});