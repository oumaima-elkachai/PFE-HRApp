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
process.env.TABLE_CANDIDATURES = "Candidatures-local"; // ✅ NOUVEAU
process.env.TABLE_QUIZ         = "Quiz-local";         // ✅ NOUVEAU
process.env.TABLE_EVENEMENTS   = "Evenements-local";
process.env.TABLE_FACTURES     = "Factures-local";
process.env.TABLE_POINTAGES    = "Pointages-local";
process.env.TABLE_OFFRES       = "Offres-local";
process.env.JWT_SECRET         = "pfe-rh-secret-local-2026";
process.env.AWS_REGION         = "us-east-1";

// ✅ NOUVEAU : Configuration OpenAI (optionnel pour tests locaux)
process.env.OPENAI_API_KEY     = "sk-test-local"; // Remplacer par votre vraie clé

const { authentifier, autoriser } = require("./src/auth/middleware");
const { docClient } = require("./src/utils/dynamodb");
const { v4: uuidv4 } = require("uuid");
const { ScanCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// ✅ Multer pour upload CV en mémoire
const storage = multer.memoryStorage();
const uploadCV = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
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

// ✅ POST /candidatures - Soumettre une candidature avec CV
// Ajouter en haut avec les autres imports
const { analyserCV, genererQuizIA } = require("./src/services/bedrockService");

// ── POST /candidatures — avec vrai scoring IA ──
app.post("/candidatures", uploadCV.single('cv'), async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone,
      lettreMotivation, niveauEtude, experience,
      competences, offreId, linkedin,
    } = req.body;

    if (!nom || !prenom || !email || !lettreMotivation) {
      return res.status(400).json({ succes: false, erreur: "Champs obligatoires manquants" });
    }

    // 1. Récupérer l'offre
    let offre = null;
    let posteVise = "Candidature spontanée";
    if (offreId) {
      const offreRes = await docClient.send(new GetCommand({ TableName: "Offres-local", Key: { id: offreId } }));
      if (offreRes.Item) { offre = offreRes.Item; posteVise = offre.titre; }
    }

    // 2. Parser les compétences
    const competencesArray = (() => {
      try { return JSON.parse(competences || "[]"); }
      catch { return (competences || "").split(",").map(c => c.trim()).filter(Boolean); }
    })();

    // 3. Analyser CV avec IA Bedrock
    console.log("🤖 Analyse IA en cours...");
    const analyse = await analyserCV({
      fileBuffer:         req.file?.buffer || Buffer.from(""),
      mimetype:           req.file?.mimetype || "application/pdf",
      lettreMotivation,
      competencesCandidаt: competencesArray,
      niveauEtude,
      experience,
      offre,
    });

    // 4. CV invalide → rejeter
    if (!analyse.valide) {
      return res.status(400).json({
        succes: false,
        erreur: analyse.erreur,
        code:   "CV_INVALIDE",
      });
    }

    console.log(`✅ Score IA: ${analyse.score}/100 — ${analyse.recommendation}`);

    // 5. Déterminer le statut selon le score
    const statut = analyse.score >= 65 ? "PRESELECTION"
                 : analyse.score >= 40 ? "SOUMIS"
                 : "REFUSE";

    // 6. Créer la candidature
    const id = uuidv4();
    const candidature = {
      id,
      offreId:     offreId || null,
      offreTitre:  posteVise,
      nom, prenom, email, telephone,
      cvFileName:  req.file?.originalname || null,
      lettreMotivation,
      linkedin:    linkedin || null,
      competences: competencesArray,
      niveauEtude: niveauEtude || null,
      experience:  experience || null,
      posteVise,

      // Scores IA
      scoreCV:              analyse.score,
      scoreQuiz:            null,
      scoreTotal:           analyse.score,
      recommendation:       analyse.recommendation,
      competencesMatchees:  analyse.competencesMatchees,
      competencesManquantes:analyse.competencesManquantes,
      pointsForts:          analyse.pointsForts,
      pointsFaibles:        analyse.pointsFaibles,
      resumeAnalyse:        analyse.resumeAnalyse,
      niveauExperience:     analyse.niveauExperience,
      pertinenceFormation:  analyse.pertinenceFormation,

      quizId:     null,
      quizStatus: "NON_ENVOYE",
      statut,
      historiqueStatuts: [{
        statut:      "SOUMIS",
        date:        new Date().toISOString(),
        commentaire: `Score IA: ${analyse.score}/100 — ${analyse.recommendation}`,
        action:      "candidature_soumise",
      }],
      source:      "site_carriere",
      creeLe:      new Date().toISOString(),
      misAJourLe:  new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: "Candidatures-local", Item: candidature }));

    res.status(201).json({
      succes: true,
      candidature: {
        id,
        scoreCV:        analyse.score,
        statut,
        recommendation: analyse.recommendation,
        message: analyse.score >= 65
          ? "🎉 Excellente candidature ! Vous passerez en présélection."
          : analyse.score >= 40
          ? "📋 Candidature reçue, en cours d'examen."
          : "❌ Votre profil ne correspond pas aux critères requis pour ce poste.",
        pointsForts: analyse.pointsForts,
      },
    });

  } catch (err) {
    console.error("❌ Erreur candidature:", err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ── POST /quiz/generer — Quiz IA selon l'offre ──
app.post("/quiz/generer", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { offreId, candidatureId } = req.body;

    // Récupérer l'offre
    if (!offreId) {
      return res.status(400).json({ succes: false, erreur: "offreId requis" });
    }

    const offreRes = await docClient.send(new GetCommand({ TableName: "Offres-local", Key: { id: offreId } }));
    if (!offreRes.Item) {
      return res.status(404).json({ succes: false, erreur: "Offre introuvable" });
    }

    const offre = offreRes.Item;
    console.log(`🤖 Génération quiz IA pour: ${offre.titre}`);

    // Générer le quiz avec IA
    const quizData = await genererQuizIA(offre, 5);

    const quiz = {
      id:            uuidv4(),
      offreId,
      candidatureId: candidatureId || null,
      titre:         quizData.titre,
      dureeMinutes:  30,
      questions:     quizData.questions,
      statut:        "actif",
      genereParIA:   true,
      creeLe:        new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: "Quiz-local", Item: quiz }));

    // Lier à la candidature si fournie
    if (candidatureId) {
      await docClient.send(new UpdateCommand({
        TableName: "Candidatures-local",
        Key: { id: candidatureId },
        UpdateExpression: "SET quizId = :qid, quizStatus = :qs",
        ExpressionAttributeValues: { ":qid": quiz.id, ":qs": "ENVOYE" },
      }));
    }

    console.log(`✅ Quiz généré: ${quiz.questions.length} questions`);
    res.json({ succes: true, data: { quiz } });

  } catch (e) {
    console.error("❌ Erreur génération quiz:", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});

// ✅ GET /candidatures - Lister (RH = tout, autres = rien)
app.get("/candidatures", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const resultat = await docClient.send(new ScanCommand({
      TableName: 'Candidatures-local'
    }));

    res.json({
      succes: true,
      candidatures: resultat.Items || [],
      total: resultat.Items?.length || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ✅ GET /mes-candidatures - Candidat voit ses candidatures
app.get("/mes-candidatures", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ succes: false, erreur: "Non identifié" });

    // Lire les deux tables
    const [resOld, resNew] = await Promise.all([
      docClient.send(new ScanCommand({
        TableName: "Candidats-local",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email },
      })),
      docClient.send(new ScanCommand({
        TableName: "Candidatures-local",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email },
      })).catch(() => ({ Items: [] })), // si table n'existe pas
    ]);

    // Normaliser les items de Candidatures-local vers le format Candidat
    const anciens = (resOld.Items || []);
    const nouveaux = (resNew.Items || []).map(item => ({
      id:                item.id,
      nom:               item.nom,
      prenom:            item.prenom,
      email:             item.email,
      telephone:         item.telephone || '',
      posteVise:         item.offreTitre || item.posteVise || 'Candidature spontanée',
      niveauEtude:       item.niveauEtude || '',
      experience:        item.experience || '',
      competences:       item.competences || [],
      lettreMotivation:  item.lettreMotivation || '',
      statut:            item.statut || 'SOUMIS',
      historiqueStatuts: item.historiqueStatuts || [],
      soumisLe:          item.creeLe || new Date().toISOString(),
      misAJourLe:        item.misAJourLe || new Date().toISOString(),
      // Champs bonus du nouveau système
      scoreCV:           item.scoreCV || null,
      cvFileName:        item.cvFileName || null,
      offreTitre:        item.offreTitre || null,
    }));

    const tous = [...anciens, ...nouveaux];
    tous.sort((a, b) => new Date(b.soumisLe || b.creeLe).getTime() - new Date(a.soumisLe || a.creeLe).getTime());

    res.json({ succes: true, data: { candidats: tous } });

  } catch (e) {
    console.error("Erreur mes-candidatures:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de charger vos candidatures" });
  }
});

// ✅ GET /candidatures/:id - Détail
app.get("/candidatures/:id", authentifier, async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: 'Candidatures-local',
      Key: { id: req.params.id }
    }));

    if (!result.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Candidature introuvable'
      });
    }

    // Vérifier permissions
    const isOwner = req.user.email === result.Item.email;
    const isRH = req.user.role === 'RH';

    if (!isOwner && !isRH) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé'
      });
    }

    res.json({
      succes: true,
      candidature: result.Item
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ✅ PUT /candidatures/:id/statut - Changer statut (RH)
app.put("/candidatures/:id/statut", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;

    const getResult = await docClient.send(new GetCommand({
      TableName: 'Candidatures-local',
      Key: { id: req.params.id }
    }));

    if (!getResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Candidature introuvable'
      });
    }

    const historiqueStatuts = getResult.Item.historiqueStatuts || [];
    historiqueStatuts.push({
      statut,
      ancienStatut: getResult.Item.statut,
      date: new Date().toISOString(),
      commentaire: commentaire || '',
      modifiePar: req.user.email,
      action: 'statut_change'
    });

    await docClient.send(new UpdateCommand({
      TableName: 'Candidatures-local',
      Key: { id: req.params.id },
      UpdateExpression: 'SET statut = :statut, historiqueStatuts = :hist, misAJourLe = :date',
      ExpressionAttributeValues: {
        ':statut': statut,
        ':hist': historiqueStatuts,
        ':date': new Date().toISOString()
      }
    }));

    res.json({ succes: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ══════════════════════════════════════════════
// CANDIDATS (ANCIEN SYSTÈME - garder pour compatibilité)
// ══════════════════════════════════════════════
app.post("/candidats", async (req, res) => {
  sendResponse(res, await soumettreCandidat.handler(toEvent(req)));
});

app.get("/candidats", authentifier, autoriser("RH"), async (req, res) => {
  try {
    // Lire les deux tables
    const [resOld, resNew] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: "Candidats-local" })),
      docClient.send(new ScanCommand({ TableName: "Candidatures-local" })).catch(() => ({ Items: [] })),
    ]);

    // Normaliser les items de Candidatures-local
    const anciens = resOld.Items || [];
    const nouveaux = (resNew.Items || []).map(item => ({
      id:                item.id,
      nom:               item.nom,
      prenom:            item.prenom,
      email:             item.email,
      telephone:         item.telephone || '',
      posteVise:         item.offreTitre || item.posteVise || 'Candidature spontanée',
      niveauEtude:       item.niveauEtude || '',
      experience:        item.experience || '',
      competences:       item.competences || [],
      lettreMotivation:  item.lettreMotivation || '',
      statut:            item.statut || 'SOUMIS',
      historiqueStatuts: item.historiqueStatuts || [],
      soumisLe:          item.creeLe || new Date().toISOString(),
      misAJourLe:        item.misAJourLe || new Date().toISOString(),
      scoreCV:           item.scoreCV || null,
      source:            'candidatures', // pour différencier
    }));

    const tous = [...anciens, ...nouveaux];
    tous.sort((a, b) => new Date(b.soumisLe).getTime() - new Date(a.soumisLe).getTime());

    res.json({ succes: true, data: { candidats: tous } });
  } catch (e) {
    console.error("Erreur GET /candidats:", e);
    res.status(500).json({ succes: false, erreur: "Impossible de charger" });
  }
});

app.get("/candidats/:id", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await detailCandidat.handler(toEvent(req)));
});

app.put("/candidats/:id/statut", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;
    const id = req.params.id;

    // Essayer Candidats-local d'abord
    let tableName = "Candidats-local";
    let getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null);

    // Si pas trouvé, essayer Candidatures-local
    if (!getRes?.Item) {
      tableName = "Candidatures-local";
      getRes = await docClient.send(new GetCommand({ TableName: tableName, Key: { id } })).catch(() => null);
    }

    if (!getRes?.Item) {
      return res.status(404).json({ succes: false, erreur: "Candidat introuvable" });
    }

    const historique = [...(getRes.Item.historiqueStatuts || []), {
      statut,
      ancienStatut: getRes.Item.statut,
      date: new Date().toISOString(),
      commentaire: commentaire || '',
      modifiePar: req.user.email,
    }];

    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: "SET statut = :s, historiqueStatuts = :h, misAJourLe = :d",
      ExpressionAttributeValues: {
        ":s": statut,
        ":h": historique,
        ":d": new Date().toISOString(),
      },
    }));

    res.json({ succes: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ succes: false, erreur: "Impossible de modifier le statut" });
  }
});

// ══════════════════════════════════════════════
// POINTAGES
// ══════════════════════════════════════════════
app.post("/pointages/arrivee", authentifier, async (req, res) => {
  sendResponse(res, await pointageArrivee.handler(toEvent(req)));
});

app.post("/pointages/depart", authentifier, async (req, res) => {
  sendResponse(res, await pointageDepart.handler(toEvent(req)));
});

app.get("/pointages", authentifier, async (req, res) => {
  sendResponse(res, await historiquePointages.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// CALENDRIER
// ══════════════════════════════════════════════
app.get("/evenements", authentifier, async (req, res) => {
  sendResponse(res, await listerEvenements.handler(toEvent(req)));
});

app.post("/evenements", authentifier, async (req, res) => {
  sendResponse(res, await creerEvenement.handler(toEvent(req)));
});

app.put("/evenements/:id", authentifier, async (req, res) => {
  sendResponse(res, await modifierEvenement.handler(toEvent(req)));
});

app.delete("/evenements/:id", authentifier, async (req, res) => {
  sendResponse(res, await supprimerEvenement.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// FACTURES
// ══════════════════════════════════════════════
app.post("/factures", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await genererFacture.handler(toEvent(req)));
});

app.get("/factures", authentifier, async (req, res) => {
  sendResponse(res, await listerFactures.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════
app.get("/dashboard", authentifier, autoriser("RH"), async (req, res) => {
  sendResponse(res, await dashboardStats.handler(toEvent(req)));
});

// ══════════════════════════════════════════════
// OFFRES
// ══════════════════════════════════════════════
app.get("/offres", async (req, res) => { // ✅ PUBLIC pour candidats
  try {
    const resultat = await docClient.send(new ScanCommand({
      TableName: "Offres-local",
    }));
    res.json({ succes: true, data: { offres: resultat.Items || [] } });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: "Impossible de charger les offres" });
  }
});

app.post("/offres", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const offre = {
      id:        uuidv4(),
      ...req.body,
      creeLe:    new Date().toISOString(),
      misAJourLe: new Date().toISOString(),
    };
    await docClient.send(new PutCommand({
      TableName: "Offres-local",
      Item:      offre,
    }));
    res.status(201).json({ succes: true, data: { offre } });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: "Impossible de créer l'offre" });
  }
});

app.delete("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: "Offres-local",
      Key:       { id: req.params.id },
    }));
    res.json({ succes: true, data: { message: "Offre supprimée" } });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: "Impossible de supprimer l'offre" });
  }
});

app.put("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new UpdateCommand({
      TableName: "Offres-local",
      Key: { id: req.params.id },
      UpdateExpression: "SET titre=:t, departement=:d, #typ=:ty, modeTravail=:m, description=:desc, statut=:s, misAJourLe=:maj",
      ExpressionAttributeNames: { "#typ": "type" },
      ExpressionAttributeValues: {
        ":t":   req.body.titre,
        ":d":   req.body.departement,
        ":ty":  req.body.type,
        ":m":   req.body.modeTravail,
        ":desc":req.body.description,
        ":s":   req.body.statut,
        ":maj": new Date().toISOString(),
      },
    }));
    res.json({ succes: true });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: "Impossible de modifier" });
  }
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
  console.log("  POST /candidatures (avec upload CV)"); // ✅ NOUVEAU
  console.log("\n[PROTÉGÉ - token requis]");
  console.log("  GET  /auth/profil");
  console.log("  GET  /employes");
  console.log("  POST /employes (RH)");
  console.log("  GET  /candidatures (RH)");
  console.log("  GET  /mes-candidatures (CANDIDAT)"); // ✅ NOUVEAU
  console.log("\nCtrl+C pour arrêter\n");
});