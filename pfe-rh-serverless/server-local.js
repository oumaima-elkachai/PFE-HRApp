const express = require("express");
const multer = require("multer");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Configuration environnement
process.env.DYNAMODB_ENDPOINT  = "http://localhost:8000";
process.env.TABLE_USERS        = "Users-local";
process.env.TABLE_EMPLOYES     = "Employes-local";
process.env.TABLE_CANDIDATS    = "Candidats-local";
process.env.TABLE_CANDIDATURES = "Candidatures-local";
process.env.TABLE_QUIZ         = "Quiz-local";
process.env.TABLE_EVENEMENTS   = "Evenements-local";
process.env.TABLE_FACTURES     = "Factures-local";
process.env.TABLE_POINTAGES    = "Pointages-local";
process.env.TABLE_OFFRES       = "Offres-local";
process.env.TABLE_NOTIFICATIONS= "Notifications-local";
process.env.JWT_SECRET         = "pfe-rh-secret-local-2026";
process.env.AWS_REGION         = "us-east-1";

// ✅ NOUVEAU : Configuration OpenAI (optionnel pour tests locaux)
process.env.OPENAI_API_KEY     = "sk-test-local";

const { authentifier, autoriser } = require("./src/auth/middleware");
const { docClient } = require("./src/utils/dynamodb");
const { analyserCV, genererQuizIA } = require("./src/services/bedrockService");

const { v4: uuidv4 } = require("uuid");
const { ScanCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// ✅ Multer pour upload CV en mémoire
const storage = multer.memoryStorage();
const uploadCV = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez PDF ou DOCX.'));
    }
  }
});

// ── Imports modules existants ─────────────────
const inscription      = require("./src/auth/inscription");
const connexion        = require("./src/auth/connexion");
const profil           = require("./src/auth/profil");
const listerEmployes   = require("./src/employes/lister");
const creerEmploye     = require("./src/employes/creer");
const detailEmploye    = require("./src/employes/detail");
const modifierEmploye  = require("./src/employes/modifier");
const supprimerEmploye = require("./src/employes/supprimer");

const soumettreCandidat  = require("./src/candidats/soumettre");
const listerCandidats    = require("./src/candidats/lister");
const statutCandidat     = require("./src/candidats/statut");
const detailCandidat     = require("./src/candidats/detail");

const pointageArrivee     = require("./src/pointages/arrivee");
const pointageDepart      = require("./src/pointages/depart");
const historiquePointages = require("./src/pointages/historique");

const creerEvenement     = require("./src/calendrier/creer");
const listerEvenements   = require("./src/calendrier/lister");
const modifierEvenement  = require("./src/calendrier/modifier");
const supprimerEvenement = require("./src/calendrier/supprimer");

const genererFacture = require("./src/factures/generer");
const listerFactures = require("./src/factures/lister");
const dashboardStats = require("./src/dashboard/stats");

const demanderConge  = require("./src/conges/demander");
const listerConges   = require("./src/conges/lister");
const traiterConge   = require("./src/conges/traiter");

// ── Helper functions ──────────────────────────
function toEvent(req) {
  return {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    queryStringParameters: Object.keys(req.query).length ? req.query : null,
    pathParameters: Object.keys(req.params).length ? req.params : null,
    body: req.body ? JSON.stringify(req.body) : null,
    user: req.user || null,
  };
}

function sendResponse(res, result) {
  const parsedBody = typeof result.body === "string"
    ? JSON.parse(result.body)
    : result.body;
  res.status(result.statusCode).json(parsedBody);
}

// ══════════════════════════════════════════════
// AUTH - Routes publiques
// ══════════════════════════════════════════════
app.post("/auth/inscription", async (req, res) => {
  sendResponse(res, await inscription.handler(toEvent(req)));
});

app.post("/auth/connexion", async (req, res) => {
  sendResponse(res, await connexion.handler(toEvent(req)));
});

app.get("/auth/profil", authentifier, async (req, res) => {
  sendResponse(res, await profil.handler(toEvent(req)));
});

app.put("/auth/profil", authentifier, async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    const { telephone, poste, departement } = req.body;

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id: userId },
      UpdateExpression: "SET telephone = :t, poste = :p, departement = :d, misAJourLe = :maj",
      ExpressionAttributeValues: {
        ":t":   telephone   || "",
        ":p":   poste       || "",
        ":d":   departement || "",
        ":maj": new Date().toISOString(),
      },
    }));

    res.json({ succes: true, data: { message: "Profil mis à jour" } });
  } catch (e) {
    console.error("Erreur update profil:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de modifier le profil" });
  }
});

// ── Congés ────────────────────────────────────

// GET /conges — Employé voit ses congés, RH voit tout
app.get("/conges", authentifier, async (req, res) => {
  sendResponse(res, await listerConges.handler(toEvent(req)));
});

// POST /conges — Demander un congé
app.post("/conges", authentifier, async (req, res) => {
  sendResponse(res, await demanderConge.handler(toEvent(req)));
});

// PATCH /conges/:id — RH approuve ou refuse
app.patch("/conges/:id", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await traiterConge.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// EMPLOYES
// ══════════════════════════════════════════════
app.get("/employes", authentifier, async (req, res) => {
  sendResponse(res, await listerEmployes.handler(toEvent(req)));
});

app.post("/employes", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await creerEmploye.handler(toEvent(req)));
});

app.get("/employes/:id", authentifier, async (req, res) => {
  sendResponse(res, await detailEmploye.handler(toEvent(req)));
});

app.put("/employes/:id", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await modifierEmploye.handler(toEvent(req)));
});

app.delete("/employes/:id", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await supprimerEmploye.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// ✅ CANDIDATURES (NOUVEAU SYSTÈME)
// ══════════════════════════════════════════════

app.post("/candidatures", uploadCV.single('cv'), async (req, res) => {

  console.log("🔍 Content-Type reçu:", req.headers['content-type']);
  console.log("🔍 req.file:", req.file ? { taille: req.file.size, mimetype: req.file.mimetype, bufferLength: req.file.buffer?.length } : "AUCUN FICHIER");


  try {
    const { nom, prenom, email, telephone, lettreMotivation, niveauEtude, experience, competences, offreId, linkedin } = req.body;

    if (!nom || !prenom || !email || !lettreMotivation) {
      return res.status(400).json({ succes: false, erreur: "Champs obligatoires manquants" });
    }

    let offre = null;
    let posteVise = "Candidature spontanée";
    if (offreId) {
      const offreRes = await docClient.send(new GetCommand({ TableName: "Offres-local", Key: { id: offreId } }));
      if (offreRes.Item) { offre = offreRes.Item; posteVise = offre.titre; }
    }

    const competencesArray = (() => {
      try { return JSON.parse(competences || "[]"); }
      catch { return (competences || "").split(",").map(c => c.trim()).filter(Boolean); }
    })();

    console.log("🤖 Analyse IA en cours...");
    const analyse = await analyserCV({
      fileBuffer:         req.file?.buffer || Buffer.from(""),
      mimetype:           req.file?.mimetype || "application/pdf",
      lettreMotivation,
      competencesCandidat: competencesArray,
      niveauEtude,
      experience,
      offre,
    });

    if (!analyse.valide) {
      return res.status(400).json({ succes: false, erreur: analyse.erreur, code: "CV_INVALIDE" });
    }

    console.log(`✅ Score IA: ${analyse.score}/100 — ${analyse.recommendation}`);

    const statut = analyse.score >= 65 ? "PRESELECTION"
                 : analyse.score >= 40 ? "SOUMIS"
                 : "REFUSE";

    const id = uuidv4();
    const candidature = {
      id, offreId: offreId || null, offreTitre: posteVise,
      nom, prenom, email, telephone,
      cvFileName: req.file?.originalname || null,
      lettreMotivation, linkedin: linkedin || null,
      competences: competencesArray, niveauEtude: niveauEtude || null, experience: experience || null, posteVise,
      scoreCV: analyse.score, scoreQuiz: null, scoreTotal: analyse.score,
      recommendation: analyse.recommendation,
      competencesMatchees: analyse.competencesMatchees, competencesManquantes: analyse.competencesManquantes,
      pointsForts: analyse.pointsForts, pointsFaibles: analyse.pointsFaibles,
      resumeAnalyse: analyse.resumeAnalyse, niveauExperience: analyse.niveauExperience, pertinenceFormation: analyse.pertinenceFormation,
      quizId: null, quizStatus: "NON_ENVOYE", statut,
      historiqueStatuts: [{ statut: "SOUMIS", date: new Date().toISOString(), commentaire: `Score IA: ${analyse.score}/100 — ${analyse.recommendation}`, action: "candidature_soumise" }],
      source: "site_carriere", creeLe: new Date().toISOString(), misAJourLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: "Candidatures-local", Item: candidature }));

    res.status(201).json({
      succes: true, candidature: { id, scoreCV: analyse.score, statut, recommendation: analyse.recommendation,
        message: analyse.score >= 65 ? "🎉 Excellente candidature ! Vous passerez en présélection." : analyse.score >= 40 ? "📋 Candidature reçue, en cours d'examen." : "❌ Votre profil ne correspond pas aux critères requis pour ce poste.",
        pointsForts: analyse.pointsForts,
      },
    });
  } catch (err) {
    console.error("❌ Erreur candidature:", err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

app.post("/quiz/generer", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { offreId, candidatureId } = req.body;
    if (!offreId) return res.status(400).json({ succes: false, erreur: "offreId requis" });

    const offreRes = await docClient.send(new GetCommand({ TableName: "Offres-local", Key: { id: offreId } }));
    if (!offreRes.Item) return res.status(404).json({ succes: false, erreur: "Offre introuvable" });

    const offre = offreRes.Item;
    console.log(`🤖 Génération quiz IA pour: ${offre.titre}`);
    const quizData = await genererQuizIA(offre, 5);

    const quiz = { id: uuidv4(), offreId, candidatureId: candidatureId || null, titre: quizData.titre, dureeMinutes: 30, questions: quizData.questions, statut: "actif", genereParIA: true, creeLe: new Date().toISOString() };
    await docClient.send(new PutCommand({ TableName: "Quiz-local", Item: quiz }));

    if (candidatureId) {
      await docClient.send(new UpdateCommand({ TableName: "Candidatures-local", Key: { id: candidatureId }, UpdateExpression: "SET quizId = :qid, quizStatus = :qs", ExpressionAttributeValues: { ":qid": quiz.id, ":qs": "ENVOYE" } }));
    }

    console.log(`✅ Quiz généré: ${quiz.questions.length} questions`);
    res.json({ succes: true, data: { quiz } });
  } catch (e) {
    console.error("❌ Erreur génération quiz:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});

app.get("/candidatures", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const resultat = await docClient.send(new ScanCommand({ TableName: 'Candidatures-local' }));
    res.json({ succes: true, candidatures: resultat.Items || [], total: resultat.Items?.length || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

app.get("/mes-candidatures", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ succes: false, erreur: "Non identifié" });

    const [resOld, resNew] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: "Candidats-local", FilterExpression: "email = :email", ExpressionAttributeValues: { ":email": email } })),
      docClient.send(new ScanCommand({ TableName: "Candidatures-local", FilterExpression: "email = :email", ExpressionAttributeValues: { ":email": email } })).catch(() => ({ Items: [] })),
    ]);

    const anciens = (resOld.Items || []);
    const nouveaux = (resNew.Items || []).map(item => ({
      id: item.id, nom: item.nom, prenom: item.prenom, email: item.email, telephone: item.telephone || '',
      posteVise: item.offreTitre || item.posteVise || 'Candidature spontanée', niveauEtude: item.niveauEtude || '', experience: item.experience || '',
      competences: item.competences || [], lettreMotivation: item.lettreMotivation || '', statut: item.statut || 'SOUMIS',
      historiqueStatuts: item.historiqueStatuts || [], soumisLe: item.creeLe || new Date().toISOString(), misAJourLe: item.misAJourLe || new Date().toISOString(),
      scoreCV: item.scoreCV || null, cvFileName: item.cvFileName || null, offreTitre: item.offreTitre || null,
    }));

    const tous = [...anciens, ...nouveaux];
    tous.sort((a, b) => new Date(b.soumisLe || b.creeLe).getTime() - new Date(a.soumisLe || a.creeLe).getTime());
    res.json({ succes: true, data: { candidats: tous } });
  } catch (e) {
    console.error("Erreur mes-candidatures:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de charger vos candidatures" });
  }
});

app.get("/candidatures/:id", authentifier, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({ TableName: 'Candidatures-local', Key: { id: req.params.id } }));
    if (!result.Item) return res.status(404).json({ succes: false, erreur: 'Candidature introuvable' });

    const isOwner = req.user.email === result.Item.email;
    const isRH = req.user.role === 'RH';
    if (!isOwner && !isRH) return res.status(403).json({ succes: false, erreur: 'Accès non autorisé' });

    res.json({ succes: true, candidature: result.Item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

app.put("/candidatures/:id/statut", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;
    const getResult = await docClient.send(new GetCommand({ TableName: 'Candidatures-local', Key: { id: req.params.id } }));
    if (!getResult.Item) return res.status(404).json({ succes: false, erreur: 'Candidature introuvable' });

    const historiqueStatuts = getResult.Item.historiqueStatuts || [];
    historiqueStatuts.push({ statut, ancienStatut: getResult.Item.statut, date: new Date().toISOString(), commentaire: commentaire || '', modifiePar: req.user.email, action: 'statut_change' });

    await docClient.send(new UpdateCommand({ TableName: 'Candidatures-local', Key: { id: req.params.id }, UpdateExpression: 'SET statut = :statut, historiqueStatuts = :hist, misAJourLe = :date', ExpressionAttributeValues: { ':statut': statut, ':hist': historiqueStatuts, ':date': new Date().toISOString() } }));
    res.json({ succes: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ══════════════════════════════════════════════
// CANDIDATS (ANCIEN SYSTÈME - compatibilité)
// ══════════════════════════════════════════════
app.post("/candidats", async (req, res) => { sendResponse(res, await soumettreCandidat.handler(toEvent(req))); });
app.get("/candidats", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const [resOld, resNew] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: "Candidats-local" })),
      docClient.send(new ScanCommand({ TableName: "Candidatures-local" })).catch(() => ({ Items: [] })),
    ]);
    const anciens = resOld.Items || [];
    const nouveaux = (resNew.Items || []).map(item => ({
      id: item.id, nom: item.nom, prenom: item.prenom, email: item.email, telephone: item.telephone || '',
      posteVise: item.offreTitre || item.posteVise || 'Candidature spontanée', niveauEtude: item.niveauEtude || '', experience: item.experience || '',
      competences: item.competences || [], lettreMotivation: item.lettreMotivation || '', statut: item.statut || 'SOUMIS',
      historiqueStatuts: item.historiqueStatuts || [], soumisLe: item.creeLe || new Date().toISOString(), misAJourLe: item.misAJourLe || new Date().toISOString(),
      scoreCV: item.scoreCV || null, source: 'candidatures',
    }));
    const tous = [...anciens, ...nouveaux];
    tous.sort((a, b) => new Date(b.soumisLe).getTime() - new Date(a.soumisLe).getTime());
    res.json({ succes: true, data: { candidats: tous } });
  } catch (e) { console.error("Erreur GET /candidats:", e); res.status(500).json({ succes: false, erreur: "Impossible de charger" }); }
});
app.get("/candidats/:id", authentifier, autoriser("RH"), async (req, res) => { sendResponse(res, await detailCandidat.handler(toEvent(req))); });

app.put("/candidats/:id/statut", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;
    const id = req.params.id;
    let tableName = "Candidats-local";
    let getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null);
    if (!getRes?.Item) { tableName = "Candidatures-local"; getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null); }
    if (!getRes?.Item) return res.status(404).json({ succes: false, erreur: "Candidat introuvable" });

    const candidat = getRes.Item;
    const historique = [...(candidat.historiqueStatuts || []), { statut, ancienStatut: candidat.statut, date: new Date().toISOString(), commentaire: commentaire || '', modifiePar: req.user.email }];

    // Champs à mettre à jour — étendus dynamiquement si un quiz doit être généré
    let updateExpr = "SET statut = :s, historiqueStatuts = :h, misAJourLe = :d";
    const exprValues = { ":s": statut, ":h": historique, ":d": new Date().toISOString() };

    // ✅ Générer réellement le quiz quand on passe en QUIZ_EN_ATTENTE (et pas déjà fait)
    if (statut === "QUIZ_EN_ATTENTE" && !candidat.quizId) {
      try {
        let offre = null;
        if (candidat.offreId) {
          const offreRes = await docClient.send(new GetCommand({ TableName: "Offres-local", Key: { id: candidat.offreId } }));
          offre = offreRes.Item || null;
        }
        // Candidature spontanée : on construit un "offre" minimal à partir du poste visé
        if (!offre) {
          offre = { titre: candidat.offreTitre || candidat.posteVise || "Poste", departement: candidat.offreDepartement || "", competences: candidat.competences || [] };
        }

        const quizGenere = await genererQuizIA(offre, 5);
        const quizId = uuidv4();
        const quiz = {
          id: quizId,
          offreId: candidat.offreId || null,
          offreTitre: offre.titre,
          titre: quizGenere.titre,
          questions: quizGenere.questions,
          dureeMinutes: 30,
          seuilPassage: 70,
          statut: "ACTIF",
          creeLe: new Date().toISOString(),
        };
        await docClient.send(new PutCommand({ TableName: "Quiz-local", Item: quiz }));

        updateExpr += ", quizId = :qid, quizStatus = :qs, quizEnvoyeLe = :qe, quizExpirationDate = :qx";
        exprValues[":qid"] = quizId;
        exprValues[":qs"]  = "ENVOYE";
        exprValues[":qe"]  = new Date().toISOString();
        exprValues[":qx"]  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } catch (quizErr) {
        console.error("⚠️ Échec génération quiz (statut quand même mis à jour):", quizErr);
      }
    }

    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: exprValues,
    }));

    res.json({ succes: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ succes: false, erreur: "Impossible de modifier le statut" });
  }
});

// ══════════════════════════════════════════════
// ✅ PLANIFIER ENTRETIEN (RH)
// ══════════════════════════════════════════════
app.put("/candidats/:id/entretien", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { id } = req.params;
    const { entretien, notifier = true } = req.body;
    if (!entretien?.date || !entretien?.heure || !entretien?.type) return res.status(400).json({ succes: false, erreur: "date, heure et type d'entretien requis" });

    let tableName = "Candidats-local";
    let getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null);
    if (!getRes?.Item) { tableName = "Candidatures-local"; getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null); }
    if (!getRes?.Item) return res.status(404).json({ succes: false, erreur: "Candidat introuvable" });

    const candidat = getRes.Item;
    const historiqueStatuts = candidat.historiqueStatuts || [];
    historiqueStatuts.push({ statut: "ENTRETIEN", ancienStatut: candidat.statut, date: new Date().toISOString(), commentaire: `Entretien ${entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'} planifié le ${entretien.date} à ${entretien.heure}`, modifiePar: req.user.email, action: "entretien_planifie" });

    await docClient.send(new UpdateCommand({ TableName: tableName, Key: { id }, UpdateExpression: `SET statut = :statut, entretien = :entretien, historiqueStatuts = :hist, misAJourLe = :date`, ExpressionAttributeValues: { ":statut": "ENTRETIEN", ":entretien": entretien, ":hist": historiqueStatuts, ":date": new Date().toISOString() } }));

    if (notifier && candidat.email) {
      const notification = { id: uuidv4(), userId: candidat.email, type: "ENTRETIEN_PLANIFIE", titre: "📅 Entretien planifié !", message: `Votre entretien ${entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'} est prévu le ${new Date(entretien.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${entretien.heure}`, lu: false, creeLe: new Date().toISOString(), metadata: { candidatId: id, entretien, offreTitre: candidat.offreTitre || candidat.posteVise || null } };
      await docClient.send(new PutCommand({ TableName: "Notifications-local", Item: notification }));
      console.log(`🔔 Notification envoyée à ${candidat.email}`);
    }
    console.log(`✅ Entretien planifié pour ${candidat.prenom} ${candidat.nom}`);
    res.json({ succes: true, data: { message: "Entretien planifié avec succès", entretien, notificationEnvoyee: notifier } });
  } catch (err) {
    console.error("❌ Erreur planification entretien:", err);
    res.status(500).json({ succes: false, erreur: "Impossible de planifier l'entretien" });
  }
});

// ══════════════════════════════════════════════
// ✅ NOTIFICATIONS (CANDIDAT)
// ══════════════════════════════════════════════
app.get("/notifications/me", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ succes: false, erreur: "Non identifié" });
    const resultat = await docClient.send(new ScanCommand({ TableName: "Notifications-local", FilterExpression: "userId = :email", ExpressionAttributeValues: { ":email": email } }));
    const notifications = (resultat.Items || []).sort((a, b) => new Date(b.creeLe).getTime() - new Date(a.creeLe).getTime());
    res.json({ succes: true, data: { notifications, nonLues: notifications.filter(n => !n.lu).length } });
  } catch (e) { console.error("Erreur notifications:", e); res.json({ succes: true, data: { notifications: [], nonLues: 0 } }); }
});
app.put("/notifications/:id/lue", authentifier, async (req, res) => {
  try {
    await docClient.send(new UpdateCommand({ TableName: "Notifications-local", Key: { id: req.params.id }, UpdateExpression: "SET lu = :lu", ExpressionAttributeValues: { ":lu": true } }));
    res.json({ succes: true });
  } catch (e) { console.error("Erreur marquer lue:", e); res.status(500).json({ succes: false, erreur: "Impossible de marquer comme lue" }); }
});
app.put("/notifications/lire-tout", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    const resultat = await docClient.send(new ScanCommand({ TableName: "Notifications-local", FilterExpression: "userId = :email AND lu = :lu", ExpressionAttributeValues: { ":email": email, ":lu": false } }));
    const misesAJour = (resultat.Items || []).map(item => docClient.send(new UpdateCommand({ TableName: "Notifications-local", Key: { id: item.id }, UpdateExpression: "SET lu = :lu", ExpressionAttributeValues: { ":lu": true } })));
    await Promise.all(misesAJour);
    res.json({ succes: true, data: { message: `${misesAJour.length} notifications lues` } });
  } catch (e) { console.error("Erreur lire-tout:", e); res.status(500).json({ succes: false, erreur: "Impossible de tout marquer comme lu" }); }
});

// ══════════════════════════════════════════════
// ✅ CANDIDAT - QUIZ & MEETINGS (NOUVEAU)
// ══════════════════════════════════════════════

// GET /candidat/quizzes
app.get("/candidat/quizzes", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ succes: false, erreur: "Non identifié" });

    // Trouver les candidatures avec quiz envoyé ou en cours
    const resCand = await docClient.send(new ScanCommand({
      TableName: "Candidatures-local",
      FilterExpression: "email = :email AND (quizStatus = :qs1 OR quizStatus = :qs2)",
      ExpressionAttributeValues: { ":email": email, ":qs1": "ENVOYE", ":qs2": "EN_COURS" }
    }));

    const candidatsWithQuiz = resCand.Items || [];
    const quizzes = [];

    for (const cand of candidatsWithQuiz) {
      let quizDetails = null;
      if (cand.quizId) {
        try {
          const quizRes = await docClient.send(new GetCommand({ TableName: "Quiz-local", Key: { id: cand.quizId } }));
          quizDetails = quizRes.Item;
        } catch (e) { console.log("Quiz not found", e); }
      }

      const deadline = cand.quizExpirationDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const hoursUntil = (new Date(deadline).getTime() - Date.now()) / 3600000;
      const priorite = hoursUntil < 48 ? 'high' : 'normal';

      const titre = cand.offreTitre || cand.posteVise || 'Technical Assessment';
      let icone = 'code';
      if (titre.toLowerCase().includes('data') || titre.toLowerCase().includes('sql')) icone = 'database';
      else if (titre.toLowerCase().includes('behavioral') || titre.toLowerCase().includes('logic')) icone = 'brain';

      quizzes.push({
        id: cand.quizId || `quiz-${cand.id}`,
        titre: quizDetails?.titre || `${titre} Assessment`,
        description: quizDetails?.description || `Technical screening for ${titre} position.`,
        offreTitre: titre,
        dureeMinutes: quizDetails?.dureeMinutes || 30,
        niveauDifficulte: 'Intermediate',
        deadline: deadline,
        statut: cand.quizStatus === 'ENVOYE' ? 'pending' : 'in_progress',
        priorite: priorite,
        icone: icone
      });
    }

    res.json({ succes: true, data: { quizzes } });
  } catch (e) {
    console.error("Erreur quiz candidat:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de charger les quiz" });
  }
});

// ✅ NOUVEAU - Route pour récupérer un quiz spécifique
app.get("/quiz/:quizId", authentifier, async (req, res) => {
  try {
    const { quizId } = req.params;
    
    const quizRes = await docClient.send(new GetCommand({
      TableName: "Quiz-local",
      Key: { id: quizId }
    }));

    if (!quizRes.Item) {
      return res.status(404).json({ 
        succes: false, 
        erreur: "Quiz introuvable" 
      });
    }

    // ✅ Vérifier si le candidat a accès à ce quiz
    const candidatId = req.user?.sub || req.user?.id;
    
    // Chercher la candidature liée
    const candidatureRes = await docClient.send(new ScanCommand({
      TableName: "Candidatures-local",
      FilterExpression: "quizId = :qid AND id = :cid",
      ExpressionAttributeValues: {
        ":qid": quizId,
        ":cid": candidatId
      }
    }));

    // Si candidature trouvée, autoriser
    const candidature = candidatureRes.Items?.[0];
    
    if (!candidature && req.user.role !== 'RH') {
      return res.status(403).json({ 
        succes: false, 
        erreur: "Vous n'avez pas accès à ce quiz" 
      });
    }

    res.json({ 
      succes: true, 
      data: { 
        quiz: quizRes.Item,
        candidature: candidature || null
      } 
    });
  } catch (e) {
    console.error("Erreur GET /quiz/:quizId:", e);
    res.status(500).json({ 
      succes: false, 
      erreur: "Impossible de charger le quiz" 
    });
  }
});

// GET /candidat/meetings
app.get("/candidat/meetings", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ succes: false, erreur: "Non identifié" });

    // Trouver les candidatures avec un entretien planifié
    const resCand = await docClient.send(new ScanCommand({
      TableName: "Candidatures-local",
      FilterExpression: "email = :email AND attribute_exists(entretien)",
      ExpressionAttributeValues: { ":email": email }
    }));

    const meetings = [];
    for (const cand of resCand.Items || []) {
      const ent = cand.entretien;
      if (!ent || !ent.date) continue;

      const interviewerNom = ent.interviewers?.[0] || "HR Team";
      const interviewerTitre = ent.interviewers?.[0] ? "Recruiter" : "HR Administrator";

      meetings.push({
        id: `mtg-${cand.id}`,
        titre: ent.type === 'en_ligne' ? `Video Interview - ${cand.offreTitre || cand.posteVise}` : `On-site Interview - ${cand.offreTitre || cand.posteVise}`,
        date: ent.date,
        heureDebut: ent.heure || "09:00",
        heureFin: ent.heure ? `${parseInt(ent.heure.split(':')[0]) + 1}:00` : "10:00",
        type: ent.type === 'en_ligne' ? 'video' : 'onsite',
        lien: ent.lien || "",
        adresse: ent.adresse || "",
        interviewerNom: interviewerNom,
        interviewerTitre: interviewerTitre
      });
    }

    meetings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    res.json({ succes: true, data: { meetings } });
  } catch (e) {
    console.error("Erreur meetings candidat:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de charger les meetings" });
  }
});

// ══════════════════════════════════════════════
// POINTAGES
// ══════════════════════════════════════════════
app.post("/pointages/arrivee", authentifier, async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    const email  = req.user?.email;

    // Trouver l'employé
    const empRes = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_EMPLOYES || "Employes-local",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
    }));

    const employe = (empRes.Items || [])[0];
    if (!employe) {
      return res.status(404).json({ succes: false, erreur: "Employé introuvable" });
    }

    // ✅ Chercher les pointages EN_COURS
    const existRes = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      FilterExpression: "employeId = :eid AND statut = :s",
      ExpressionAttributeValues: {
        ":eid": employe.id,
        ":s":   "EN_COURS",
      },
    }));

    const pointagesEnCours = existRes.Items || [];
    const now = new Date();
    const aujourdhui = now.toISOString().split('T')[0];

    // ✅ Clôturer les pointages anciens automatiquement
    for (const p of pointagesEnCours) {
      const datePointage = (p.date || p.heureArrivee || '').split('T')[0];
      
      if (datePointage < aujourdhui) {
        console.log(`⚠️ Pointage bloqué du ${datePointage} détecté → clôture automatique`);
        
        const heureDepart = new Date(p.heureArrivee);
        heureDepart.setHours(17, 30, 0, 0);
        const dureeMinutes = Math.round((heureDepart - new Date(p.heureArrivee)) / 60000);

        await docClient.send(new UpdateCommand({
          TableName: process.env.TABLE_POINTAGES || "Pointages-local",
          Key: { id: p.id },
          UpdateExpression: "SET heureDepart = :hd, dureeMinutes = :dm, statut = :s, clotureManuellement = :cm",
          ExpressionAttributeValues: {
            ":hd": heureDepart.toISOString(),
            ":dm": dureeMinutes,
            ":s": "TERMINE",
            ":cm": true,
          },
        }));

        console.log(`✅ Pointage ancien clôturé automatiquement`);
      } else {
        // Si c'est aujourd'hui, bloquer
        return res.status(400).json({ succes: false, erreur: "Un pointage est déjà en cours aujourd'hui" });
      }
    }

    // ✅ Créer le nouveau pointage
    const dateStr = now.toISOString().split("T")[0];

    const pointage = {
      id:          require("uuid").v4(),
      employeId:   employe.id,
      userId:      userId,
      employeNom:  `${employe.prenom} ${employe.nom}`,
      employeEmail:employe.email,
      poste:       employe.poste       || "",
      departement: employe.departement || "",
      date:        dateStr,
      heureArrivee:now.toISOString(),
      heureDepart: null,
      dureeMinutes:null,
      statut:      "EN_COURS",
      creeLe:      now.toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      Item: pointage,
    }));

    console.log(`✅ Arrivée: ${pointage.employeNom} à ${now.toLocaleTimeString("fr-FR")}`);

    res.json({
      succes: true,
      data: {
        pointage,
        message: `Arrivée enregistrée à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      },
    });
  } catch (e) {
    console.error("Erreur arrivée:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});

app.post("/pointages/depart", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;

    // Trouver l'employé
    const empRes = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_EMPLOYES || "Employes-local",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
    }));
    const employe = (empRes.Items || [])[0];
    if (!employe) return res.status(404).json({ succes: false, erreur: "Employé introuvable" });

    // Trouver le pointage en cours
    const ptRes = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      FilterExpression: "employeId = :eid AND statut = :s",
      ExpressionAttributeValues: {
        ":eid": employe.id,
        ":s":   "EN_COURS",
      },
    }));

    const pointage = (ptRes.Items || [])[0];
    if (!pointage) {
      return res.status(404).json({ succes: false, erreur: "Aucun pointage en cours" });
    }

    const now          = new Date();
    const dureeMinutes = Math.round((now - new Date(pointage.heureArrivee)) / 60000);

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      Key: { id: pointage.id },
      UpdateExpression: "SET heureDepart = :hd, dureeMinutes = :dm, statut = :s",
      ExpressionAttributeValues: {
        ":hd": now.toISOString(),
        ":dm": dureeMinutes,
        ":s":  "TERMINE",
      },
    }));

    console.log(`✅ Départ: ${employe.prenom} ${employe.nom} — durée: ${Math.floor(dureeMinutes/60)}h${dureeMinutes%60}min`);

    res.json({
      succes: true,
      data: {
        message: `Départ enregistré — ${Math.floor(dureeMinutes/60)}h${String(dureeMinutes%60).padStart(2,"0")} travaillées`,
        dureeMinutes,
      },
    });
  } catch (e) {
    console.error("Erreur départ:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
app.get("/pointages", authentifier, async (req, res) => {
  try {
    const user   = req.user;
    const params = req.query || {};

    // Scanner tous les pointages
    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
    }));

    let pointages = resultat.Items || [];

    // EMPLOYE → voit seulement ses propres pointages (par son ID dans Employes)
    if (user.role === "EMPLOYE") {
      // Trouver l'ID employé via l'email du token
      const empRes = await docClient.send(new ScanCommand({
        TableName: process.env.TABLE_EMPLOYES || "Employes-local",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": user.email },
      }));
      const employe = (empRes.Items || [])[0];
      if (employe) {
        pointages = pointages.filter(p =>
          p.employeId === employe.id ||
          p.employeId === user.sub    // fallback
        );
      } else {
        pointages = [];
      }
    }

    // RH → filtre optionnel par employeId
    if (user.role === "RH" && params.employeId) {
      pointages = pointages.filter(p => p.employeId === params.employeId);
    }

    // Filtre par date exacte
    if (params.date) {
      pointages = pointages.filter(p => {
        const d = (p.date || p.heureArrivee || "").split("T")[0];
        return d === params.date;
      });
    }

    // Filtre par mois (ex: 2026-07)
    if (params.mois) {
      pointages = pointages.filter(p => {
        const d = (p.date || p.heureArrivee || "").substring(0, 7);
        return d === params.mois;
      });
    }

    // Trier par date décroissante
    pointages.sort((a, b) =>
      new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime()
    );

    // Stats
    const termines  = pointages.filter(p => p.statut === "TERMINE");
    const totalMin  = termines.reduce((s, p) => s + (p.dureeMinutes || 0), 0);
    const h         = Math.floor(totalMin / 60);
    const m         = totalMin % 60;
    const avgMin    = termines.length > 0 ? Math.round(totalMin / termines.length) : 0;

    res.json({
      succes: true,
      data: {
        pointages,
        total: pointages.length,
        stats: {
          joursPointes:  termines.length,
          enCours:       pointages.filter(p => p.statut === "EN_COURS").length,
          totalHeures:   `${h}h${String(m).padStart(2,"0")}`,
          moyenneHeures: `${Math.floor(avgMin/60)}h${String(avgMin%60).padStart(2,"0")}`,
        },
      },
    });
  } catch (e) {
    console.error("Erreur GET /pointages:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de récupérer les pointages" });
  }
});



// ✅ Route admin pour voir TOUS les pointages (sans filtrage par défaut)
app.get("/pointages/admin", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
    }));

    let pointages = resultat.Items || [];

    // Trier par date décroissante
    pointages.sort((a, b) =>
      new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime()
    );

    // Stats globales
    const termines = pointages.filter(p => p.statut === "TERMINE");
    const totalMin = termines.reduce((s, p) => s + (p.dureeMinutes || 0), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;

    res.json({
      succes: true,
      data: {
        pointages,
        total: pointages.length,
        stats: {
          joursPointes: termines.length,
          enCours: pointages.filter(p => p.statut === "EN_COURS").length,
          totalHeures: `${h}h${String(m).padStart(2, "0")}`,
        },
      },
    });
  } catch (e) {
    console.error("Erreur GET /pointages/admin:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de récupérer les pointages" });
  }
});

// Dans server.js, ajoutez cette route APRÈS les routes pointages existantes :

// ═══════════════════════════════════════════════
// POINTAGES - Route pour créer des pointages historiques (RH uniquement)
// ═══════════════════════════════════════════════
app.post("/pointages/historique/create", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { employeId, date, heureArrivee, heureDepart } = req.body;
    
    if (!employeId || !date || !heureArrivee || !heureDepart) {
      return res.status(400).json({ 
        succes: false, 
        erreur: "Champs requis: employeId, date, heureArrivee, heureDepart" 
      });
    }

    // Récupérer infos employé
    const empRes = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EMPLOYES || "Employes-local",
      Key: { id: employeId }
    }));

    const employe = empRes.Item;
    if (!employe) {
      return res.status(404).json({ succes: false, erreur: "Employé introuvable" });
    }

    // Calculer durée
    const dureeMinutes = Math.round(
      (new Date(heureDepart) - new Date(heureArrivee)) / 60000
    );
    
    const pointage = {
      id: uuidv4(),
      employeId,
      employeNom: `${employe.prenom} ${employe.nom}`,
      employeEmail: employe.email,
      poste: employe.poste || "",
      departement: employe.departement || "",
      date,
      heureArrivee,
      heureDepart,
      dureeMinutes,
      statut: 'TERMINE',
      creeLe: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      Item: pointage,
    }));
    
    res.json({ succes: true, data: { pointage } });
  } catch (e) {
    console.error("Erreur création pointage historique:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});


// ✅ Route RH pour clôturer un pointage bloqué
app.put("/pointages/:id/cloturer", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { id } = req.params;
    const { heureDepart } = req.body;

    // Récupérer le pointage
    const ptRes = await docClient.send(new GetCommand({
      TableName: "Pointages-local",
      Key: { id }
    }));

    if (!ptRes.Item) {
      return res.status(404).json({ succes: false, erreur: "Pointage introuvable" });
    }

    const pointage = ptRes.Item;

    // Calculer l'heure de départ (par défaut 17h30 du jour du pointage)
    let heureFinale = heureDepart || null;
    if (!heureFinale) {
      const dateArrivee = new Date(pointage.heureArrivee);
      dateArrivee.setHours(17, 30, 0, 0);
      heureFinale = dateArrivee.toISOString();
    }

    const dureeMinutes = Math.round((new Date(heureFinale) - new Date(pointage.heureArrivee)) / 60000);

    await docClient.send(new UpdateCommand({
      TableName: "Pointages-local",
      Key: { id },
      UpdateExpression: "SET heureDepart = :hd, dureeMinutes = :dm, statut = :s, clotureManuellement = :cm",
      ExpressionAttributeValues: {
        ":hd": heureFinale,
        ":dm": dureeMinutes,
        ":s": "TERMINE",
        ":cm": true,
      },
    }));

    console.log(`✅ Pointage ${id} clôturé manuellement par RH`);

    res.json({
      succes: true,
      data: {
        message: `Pointage clôturé à ${new Date(heureFinale).toLocaleTimeString('fr-FR')}`,
        dureeMinutes,
      },
    });
  } catch (e) {
    console.error("Erreur clôture manuelle:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
// ══════════════════════════════════════════════
// CALENDRIER
// ══════════════════════════════════════════════
app.get("/evenements", authentifier, async (req, res) => { sendResponse(res, await listerEvenements.handler(toEvent(req))); });
app.post("/evenements", authentifier, async (req, res) => { sendResponse(res, await creerEvenement.handler(toEvent(req))); });
app.put("/evenements/:id", authentifier, async (req, res) => { sendResponse(res, await modifierEvenement.handler(toEvent(req))); });
app.delete("/evenements/:id", authentifier, async (req, res) => { sendResponse(res, await supprimerEvenement.handler(toEvent(req))); });

// ══════════════════════════════════════════════
// FACTURES
// ══════════════════════════════════════════════
app.post("/factures", authentifier, autoriser("RH"), async (req, res) => { sendResponse(res, await genererFacture.handler(toEvent(req))); });

app.get("/factures", authentifier, async (req, res) => {
  try {
    const role  = req.user?.role;
    const email = req.user?.email;

    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_FACTURES || "Factures-local",
    }));

    let factures = (resultat.Items || []).map(f => {
      const { pdfBase64, ...sansPdf } = f;
      return sansPdf;
    });

    if (role === "EMPLOYE") {
      // Trouver l'employé par email dans Employes-local
      const empResult = await docClient.send(new ScanCommand({
        TableName: process.env.TABLE_EMPLOYES || "Employes-local",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email },
      }));

      const employe = (empResult.Items || [])[0];
      console.log(`🔍 Employé trouvé pour ${email}:`, employe?.id);

      if (!employe) {
        return res.json({ succes: true, data: { factures: [], total: 0, totalNet: "0.000" } });
      }

      // Filtrer par employeId de la table Employes
      factures = factures.filter(f => f.employeId === employe.id);
      console.log(`✅ Factures pour ${employe.prenom} ${employe.nom}: ${factures.length}`);
    }

    // Filtres query params (RH)
    const params = req.query || {};
    if (params.employeId) factures = factures.filter(f => f.employeId === params.employeId);
    if (params.annee)     factures = factures.filter(f => f.annee === parseInt(params.annee));

    factures.sort((a, b) => new Date(b.genereLe).getTime() - new Date(a.genereLe).getTime());
    const totalNet = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);

    res.json({
      succes: true,
      data: {
        factures,
        total:    factures.length,
        totalNet: totalNet.toFixed(3),
      },
    });
  } catch (e) {
    console.error("Erreur GET /factures:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de récupérer les factures" });
  }
});

app.get("/factures/pdf/:id", authentifier, async (req, res) => {
  try {
    const { GetCommand } = require("@aws-sdk/lib-dynamodb");
    const result = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_FACTURES || "Factures-local",
      Key: { id: req.params.id },
    }));

    if (!result.Item) {
      return res.status(404).json({ succes: false, erreur: "Facture introuvable" });
    }

    const facture = result.Item;

    // Vérifier droits : RH voit tout, EMPLOYE voit les siennes
    if (req.user.role === "EMPLOYE") {
      const empResult = await docClient.send(new ScanCommand({
        TableName: "Employes-local",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": req.user.email },
      }));
      const employe = (empResult.Items || [])[0];
      if (!employe || facture.employeId !== employe.id) {
        return res.status(403).json({ succes: false, erreur: "Accès refusé" });
      }
    }

    if (facture.pdfBase64) {
      const pdfBuffer = Buffer.from(facture.pdfBase64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${facture.numero}.pdf"`);
      return res.send(pdfBuffer);
    }

    res.status(404).json({ succes: false, erreur: "PDF non disponible" });
  } catch (e) {
    console.error("Erreur PDF:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});



// Admin peut supprimer une facture
app.delete("/factures/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: process.env.TABLE_FACTURES || "Factures-local",
      Key: { id: req.params.id },
    }));
    res.json({ succes: true, data: { message: "Facture supprimée" } });
  } catch (e) {
    console.error("Erreur suppression facture:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
app.get("/dashboard", authentifier, autoriser("RH"), async (req, res) => { sendResponse(res, await dashboardStats.handler(toEvent(req))); });

// ══════════════════════════════════════════════
// OFFRES
// ══════════════════════════════════════════════
app.get("/offres", async (req, res) => {
  try {
    const resultat = await docClient.send(new ScanCommand({ TableName: "Offres-local" }));
    res.json({ succes: true, data: { offres: resultat.Items || [] } });
  } catch (e) { res.status(500).json({ succes: false, erreur: "Impossible de charger les offres" }); }
});
app.post("/offres", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const offre = { id: uuidv4(), ...req.body, creeLe: new Date().toISOString(), misAJourLe: new Date().toISOString() };
    await docClient.send(new PutCommand({ TableName: "Offres-local", Item: offre }));
    res.status(201).json({ succes: true, data: { offre } });
  } catch (e) { res.status(500).json({ succes: false, erreur: "Impossible de créer l'offre" }); }
});
app.delete("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try { await docClient.send(new DeleteCommand({ TableName: "Offres-local", Key: { id: req.params.id } })); res.json({ succes: true, data: { message: "Offre supprimée" } }); }
  catch (e) { res.status(500).json({ succes: false, erreur: "Impossible de supprimer l'offre" }); }
});
app.put("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new UpdateCommand({ TableName: "Offres-local", Key: { id: req.params.id }, UpdateExpression: "SET titre=:t, departement=:d, #typ=:ty, modeTravail=:m, description=:desc, statut=:s, misAJourLe=:maj", ExpressionAttributeNames: { "#typ": "type" }, ExpressionAttributeValues: { ":t": req.body.titre, ":d": req.body.departement, ":ty": req.body.type, ":m": req.body.modeTravail, ":desc": req.body.description, ":s": req.body.statut, ":maj": new Date().toISOString() } }));
    res.json({ succes: true });
  } catch (e) { res.status(500).json({ succes: false, erreur: "Impossible de modifier" }); }
});

// ══════════════════════════════════════════════
// DÉMARRAGE SERVEUR
// ══════════════════════════════════════════════
const PORT = 3000;
app.listen(PORT, () => {
  console.log("\n🚀 Serveur RH démarré sur http://localhost:" + PORT);
  console.log("\n[PUBLIC]");
  console.log("  POST /auth/inscription");
  console.log("  POST /auth/connexion");
  console.log("  GET  /offres");
  console.log("  POST /candidatures (avec upload CV)");
  console.log("\n[PROTÉGÉ - token requis]");
  console.log("  GET  /auth/profil");
  console.log("  GET  /employes");
  console.log("  POST /employes (RH)");
  console.log("  GET  /candidatures (RH)");
  console.log("  GET  /mes-candidatures (CANDIDAT)");
  console.log("  GET  /candidat/quizzes (CANDIDAT)"); // ✅ NOUVEAU
  console.log("  GET  /candidat/meetings (CANDIDAT)"); // ✅ NOUVEAU
  console.log("\nCtrl+C pour arrêter\n");
});