// server.js — serveur de développement local
//
// Simule API Gateway devant les handlers Lambda. Chaque route se contente
// de convertir la requête Express en évènement, puis d'appeler le handler
// correspondant : le même code s'exécutera tel quel sur AWS.
//
// Changements par rapport à la version précédente :
//   - Les tables Users et Candidats ont disparu (Cognito et fusion)
//   - Plus aucun Scan : les index secondaires sont utilisés partout
//   - La logique de pointage vit dans les handlers, plus en ligne ici
//   - Les PDF sont lus depuis le disque, plus depuis DynamoDB

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3Lecture = process.env.DOCUMENTS_BUCKET
  ? new S3Client({ region: process.env.AWS_REGION })
  : null;

// ── Configuration ────────────────────────────────────────────────
// En local uniquement : sur Lambda, ces variables sont injectées par CDK.
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  process.env.DYNAMODB_ENDPOINT   = "http://localhost:8000";
  process.env.AWS_REGION          = "eu-west-3";
  process.env.FUSEAU_HORAIRE      = "Africa/Tunis";
  process.env.JWT_SECRET          = "pfe-rh-secret-local-2026";
  process.env.TABLE_USERS         = "Users-local";
  process.env.TABLE_EMPLOYES      = "Employes-local";
  process.env.TABLE_POINTAGES     = "Pointages-local";
  process.env.TABLE_CONGES        = "Conges-local";
  process.env.TABLE_FACTURES      = "Factures-local";
  process.env.TABLE_CANDIDATURES  = "Candidatures-local";
  process.env.TABLE_OFFRES        = "Offres-local";
  process.env.TABLE_QUIZ          = "Quiz-local";
  process.env.TABLE_QUIZ_SESSIONS = "QuizSessions-local";
  process.env.TABLE_ENTRETIENS    = "Entretiens-local";
  process.env.TABLE_NOTIFICATIONS = "Notifications-local";
  process.env.TABLE_EVENEMENTS    = "Evenements-local";
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { authentifier, autoriser } = require("./src/auth/middleware");
const { docClient } = require("./src/utils/dynamodb");
const { analyserCV, genererQuizIA } = require("./src/services/bedrockService");
const employesUtil = require("./src/utils/employe");
const { v4: uuidv4 } = require("uuid");

const {
  QueryCommand, ScanCommand, PutCommand,
  DeleteCommand, GetCommand, UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const T = process.env;

// ── Handlers ─────────────────────────────────────────────────────

const listerEmployes   = require("./src/employes/lister");
const creerEmploye     = require("./src/employes/creer");
const detailEmploye    = require("./src/employes/detail");
const modifierEmploye  = require("./src/employes/modifier");
const supprimerEmploye = require("./src/employes/supprimer");

const pointageArrivee     = require("./src/pointages/arrivee");
const pointageDepart      = require("./src/pointages/depart");
const historiquePointages = require("./src/pointages/historique");

const demanderConge = require("./src/conges/demander");
const listerConges  = require("./src/conges/lister");
const traiterConge  = require("./src/conges/traiter");

const creerEvenement     = require("./src/calendrier/creer");
const listerEvenements   = require("./src/calendrier/lister");
const modifierEvenement  = require("./src/calendrier/modifier");
const supprimerEvenement = require("./src/calendrier/supprimer");

const genererFacture = require("./src/factures/generer");
const dashboardStats = require("./src/dashboard/stats");

// ── Utilitaires ──────────────────────────────────────────────────
const uploadCV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const acceptes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    cb(acceptes.includes(file.mimetype) ? null : new Error("Format non supporté. Utilisez PDF ou DOCX."), true);
  },
});

function toEvent(req) {
  return {
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
    queryStringParameters: Object.keys(req.query).length ? req.query : null,
    pathParameters: Object.keys(req.params).length ? req.params : null,
    body: req.body ? JSON.stringify(req.body) : null,
    user: req.user || null,
    // Permet à identite() de lire les revendications Cognito sur AWS
    requestContext: req.evenementLambda?.requestContext,
  };
}

function envoyer(res, resultat) {
  const corps = typeof resultat.body === "string" ? JSON.parse(resultat.body) : resultat.body;
  res.status(resultat.statusCode).json(corps);
}

/** Raccourci : route qui délègue entièrement à un handler */
const via = (handler) => async (req, res) => {
  try {
    envoyer(res, await handler.handler(toEvent(req)));
  } catch (e) {
    console.error(`Erreur ${req.method} ${req.path}:`, e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

const ok = (res, data, code = 200) => res.status(code).json({ succes: true, data });
const ko = (res, message, code = 500) => res.status(code).json({ succes: false, erreur: message });

// ══════════════════════════════════════════════════════════════════
// AUTHENTIFICATION
// ══════════════════════════════════════════════════════════════════
app.get("/auth/profil", authentifier, async (req, res) => {
  try {
    // L'identité vient du jeton ; seules les données RH sont lues en base.
    const fiche = await employesUtil.courant(req.user);

    ok(res, {
      utilisateur: {
        sub: req.user.sub,
        email: req.user.email,
        prenom: req.user.prenom,
        nom: req.user.nom,
        role: req.user.role,
      },
      employe: fiche,
    });
  } catch (e) {
    console.error("Erreur profil:", e);
    ko(res, "Impossible de récupérer le profil");
  }
});

app.put("/auth/profil", authentifier, async (req, res) => {
  try {
    // Résolution par email : écrire avec l'identifiant du jeton créait
    // une fiche vide, DynamoDB traitant UpdateItem comme un upsert.
    const fiche = await employesUtil.parEmail(req.user?.email);
    if (!fiche) return ko(res, "Aucune fiche employé rattachée à ce compte", 404);

    const { telephone, poste, departement } = req.body;

    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_EMPLOYES,
      Key: { id: fiche.id },
      UpdateExpression: "SET telephone = :t, poste = :p, departement = :d, misAJourLe = :maj",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: {
        ":t": telephone ?? fiche.telephone ?? "",
        ":p": poste ?? fiche.poste ?? "",
        ":d": departement ?? fiche.departement ?? "",
        ":maj": new Date().toISOString(),
      },
    }));

    ok(res, { message: "Profil mis à jour" });
  } catch (e) {
    console.error("Erreur update profil:", e);
    ko(res, "Impossible de modifier le profil");
  }
});

// ══════════════════════════════════════════════════════════════════
// EMPLOYÉS
// ══════════════════════════════════════════════════════════════════
app.get("/employes", authentifier, via(listerEmployes));
app.post("/employes", authentifier, autoriser("RH"), via(creerEmploye));
app.get("/employes/:id", authentifier, via(detailEmploye));
app.put("/employes/:id", authentifier, autoriser("RH"), via(modifierEmploye));
app.delete("/employes/:id", authentifier, autoriser("RH"), via(supprimerEmploye));

// ══════════════════════════════════════════════════════════════════
// POINTAGES
// ══════════════════════════════════════════════════════════════════
app.post("/pointages/arrivee", authentifier, via(pointageArrivee));
app.post("/pointages/depart", authentifier, via(pointageDepart));
app.get("/pointages", authentifier, via(historiquePointages));

// Saisie rétroactive par la RH, utile pour constituer un historique
app.post("/pointages/historique/create", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { employeId, date, heureArrivee, heureDepart } = req.body;
    if (!employeId || !date || !heureArrivee || !heureDepart) {
      return ko(res, "employeId, date, heureArrivee et heureDepart sont requis", 400);
    }

    const employe = await employesUtil.parId(employeId);
    if (!employe) return ko(res, "Employé introuvable", 404);

    const dureeMinutes = Math.round((new Date(heureDepart) - new Date(heureArrivee)) / 60000);
    if (dureeMinutes <= 0) return ko(res, "heureDepart doit suivre heureArrivee", 400);

    const pointage = {
      employeId, date, // clé composite, plus d'identifiant propre
      employeNom: `${employe.prenom} ${employe.nom}`,
      employeEmail: employe.email,
      poste: employe.poste || "",
      departement: employe.departement || "",
      heureArrivee, heureDepart, dureeMinutes,
      statut: "TERMINE",
      saisieRetroactive: true,
      creeLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: T.TABLE_POINTAGES, Item: pointage }));
    ok(res, { pointage }, 201);
  } catch (e) {
    console.error("Erreur pointage rétroactif:", e);
    ko(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════════
// CONGÉS
// ══════════════════════════════════════════════════════════════════
app.get("/conges", authentifier, via(listerConges));
app.post("/conges", authentifier, via(demanderConge));
app.patch("/conges/:id", authentifier, autoriser("RH"), via(traiterConge));

// ══════════════════════════════════════════════════════════════════
// CANDIDATURES
// ══════════════════════════════════════════════════════════════════
app.post("/candidatures", uploadCV.single("cv"), async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone, lettreMotivation,
      niveauEtude, experience, competences, offreId, linkedin,
    } = req.body;

    if (!nom || !prenom || !email || !lettreMotivation) {
      return ko(res, "Champs obligatoires manquants", 400);
    }

    let offre = null;
    let posteVise = "Candidature spontanée";
    if (offreId) {
      const r = await docClient.send(new GetCommand({ TableName: T.TABLE_OFFRES, Key: { id: offreId } }));
      if (r.Item) { offre = r.Item; posteVise = offre.titre; }
    }

    const listeCompetences = (() => {
      try { return JSON.parse(competences || "[]"); }
      catch { return String(competences || "").split(",").map((c) => c.trim()).filter(Boolean); }
    })();

    const analyse = await analyserCV({
      fileBuffer: req.file?.buffer || Buffer.from(""),
      mimetype: req.file?.mimetype || "application/pdf",
      lettreMotivation,
      competencesCandidat: listeCompetences,
      niveauEtude, experience, offre,
    });

    if (!analyse.valide) {
      return res.status(400).json({ succes: false, erreur: analyse.erreur, code: "CV_INVALIDE" });
    }

    const statut = analyse.score >= 65 ? "PRESELECTION"
                 : analyse.score >= 40 ? "SOUMIS"
                 : "REFUSE";

    const maintenant = new Date().toISOString();

    const candidature = {
      id: uuidv4(),
      // offreId est OMIS et non mis à null : DynamoDB refuse une valeur
      // nulle sur une clé d'index. L'absence exclut la candidature
      // spontanée du classement par offre, ce qui est le comportement voulu.
      ...(offreId ? { offreId } : {}),
      offreTitre: posteVise,
      posteVise,
      nom, prenom, email,
      telephone: telephone || "",
      cvFileName: req.file?.originalname || null,
      lettreMotivation,
      linkedin: linkedin || null,
      competences: listeCompetences,
      niveauEtude: niveauEtude || null,
      experience: experience || null,
      scoreCV: analyse.score,
      scoreQuiz: null,
      scoreTotal: analyse.score,
      recommendation: analyse.recommendation,
      analyseIA: {
        competencesMatchees: analyse.competencesMatchees,
        competencesManquantes: analyse.competencesManquantes,
        pointsForts: analyse.pointsForts,
        pointsFaibles: analyse.pointsFaibles,
        resumeAnalyse: analyse.resumeAnalyse,
        niveauExperience: analyse.niveauExperience,
        pertinenceFormation: analyse.pertinenceFormation,
      },
      // Permet de repérer quand Bedrock est indisponible : sans cette
      // trace, le repli par mots-clés passe pour une analyse réussie.
      sourceAnalyse: analyse.pointsForts?.[0] === "Analyse manuelle requise" ? "fallback" : "bedrock",
      quizId: null,
      quizStatus: "NON_ENVOYE",
      statut,
      historiqueStatuts: [{
        statut: "SOUMIS", date: maintenant,
        commentaire: `Score ${analyse.score}/100 — ${analyse.recommendation}`,
        action: "candidature_soumise",
      }],
      source: "site_carriere",
      creeLe: maintenant,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({ TableName: T.TABLE_CANDIDATURES, Item: candidature }));

    res.status(201).json({
      succes: true,
      data: {
        candidature: {
          id: candidature.id,
          scoreCV: analyse.score,
          statut,
          recommendation: analyse.recommendation,
          pointsForts: analyse.pointsForts,
          message: analyse.score >= 65 ? "Excellente candidature, vous passez en présélection."
                 : analyse.score >= 40 ? "Candidature reçue, en cours d'examen."
                 : "Votre profil ne correspond pas aux critères de ce poste.",
        },
      },
    });
  } catch (e) {
    console.error("Erreur candidature:", e);
    ko(res, e.message);
  }
});

// Vue RH : Query sur statut-index plutôt qu'un parcours de table
app.get("/candidatures", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, offreId } = req.query;
    let items;

    if (offreId) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_CANDIDATURES,
        IndexName: "offre-index",
        KeyConditionExpression: "offreId = :o",
        ExpressionAttributeValues: { ":o": offreId },
        ScanIndexForward: false, // meilleurs scores d'abord
      }));
      items = r.Items || [];
    } else if (statut) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_CANDIDATURES,
        IndexName: "statut-index",
        KeyConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "statut" },
        ExpressionAttributeValues: { ":s": String(statut).toUpperCase() },
        ScanIndexForward: false,
      }));
      items = r.Items || [];
    } else {
      const r = await docClient.send(new ScanCommand({ TableName: T.TABLE_CANDIDATURES }));
      items = (r.Items || []).sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
    }

    ok(res, { candidatures: items, total: items.length });
  } catch (e) {
    console.error("Erreur GET /candidatures:", e);
    ko(res, e.message);
  }
});

// Classement des candidats d'une offre
app.get("/candidatures/ranking/:offreId", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_CANDIDATURES,
      IndexName: "offre-index",
      KeyConditionExpression: "offreId = :o",
      ExpressionAttributeValues: { ":o": req.params.offreId },
      ScanIndexForward: false,
    }));

    const recommandation = (s) =>
      s >= 85 ? "PRIORITAIRE" : s >= 70 ? "BON_PROFIL" : s >= 50 ? "MOYEN" : "FAIBLE";

    const classement = (r.Items || []).map((c, i) => ({
      candidatureId: c.id,
      nom: c.nom, prenom: c.prenom,
      offreTitre: c.offreTitre,
      scoreCV: c.scoreCV || 0,
      scoreQuiz: c.scoreQuiz,
      scoreTotal: c.scoreTotal || 0,
      statut: c.statut,
      rang: i + 1,
      recommandation: recommandation(c.scoreTotal || 0),
    }));

    ok(res, { classement, total: classement.length });
  } catch (e) {
    console.error("Erreur classement:", e);
    ko(res, e.message);
  }
});

app.get("/mes-candidatures", authentifier, async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return ko(res, "Non identifié", 401);

    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": email },
      ScanIndexForward: false,
    }));

    ok(res, { candidatures: r.Items || [] });
  } catch (e) {
    console.error("Erreur mes-candidatures:", e);
    ko(res, "Impossible de charger vos candidatures");
  }
});

app.get("/candidatures/:id", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_CANDIDATURES, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Candidature introuvable", 404);

    const proprietaire = req.user.email === r.Item.email;
    if (!proprietaire && req.user.role !== "RH") return ko(res, "Accès non autorisé", 403);

    ok(res, { candidature: r.Item });
  } catch (e) {
    console.error(e);
    ko(res, e.message);
  }
});

app.put("/candidatures/:id/statut", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;
    if (!statut) return ko(res, "statut requis", 400);

    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_CANDIDATURES, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Candidature introuvable", 404);

    const candidature = r.Item;
    const nouveauStatut = String(statut).toUpperCase();
    const maintenant = new Date().toISOString();

    const historique = [...(candidature.historiqueStatuts || []), {
      statut: nouveauStatut,
      ancienStatut: candidature.statut,
      date: maintenant,
      commentaire: commentaire || "",
      modifiePar: req.user.email,
      action: "statut_change",
    }];

    let expression = "SET #s = :s, historiqueStatuts = :h, misAJourLe = :d";
    const valeurs = { ":s": nouveauStatut, ":h": historique, ":d": maintenant };

    // Génération du quiz au passage en présélection
    if (nouveauStatut === "QUIZ_EN_ATTENTE" && !candidature.quizId) {
      try {
        let offre = null;
        if (candidature.offreId) {
          const o = await docClient.send(new GetCommand({
            TableName: T.TABLE_OFFRES, Key: { id: candidature.offreId },
          }));
          offre = o.Item || null;
        }
        offre ||= {
          titre: candidature.offreTitre || candidature.posteVise || "Poste",
          departement: "",
          competences: candidature.competences || [],
        };

        const genere = await genererQuizIA(offre, 5);
        const quizId = uuidv4();

        await docClient.send(new PutCommand({
          TableName: T.TABLE_QUIZ,
          Item: {
            id: quizId,
            offreId: candidature.offreId || "SANS_OFFRE", // clé d'index, jamais nulle
            offreTitre: offre.titre,
            titre: genere.titre,
            questions: genere.questions,
            dureeMinutes: 30,
            seuilPassage: 70,
            statut: "ACTIF",
            genereParIA: true,
            creeLe: maintenant,
          },
        }));

        expression += ", quizId = :qid, quizStatus = :qs, quizEnvoyeLe = :qe, quizExpirationDate = :qx";
        valeurs[":qid"] = quizId;
        valeurs[":qs"] = "ENVOYE";
        valeurs[":qe"] = maintenant;
        valeurs[":qx"] = new Date(Date.now() + 7 * 864e5).toISOString();
      } catch (err) {
        console.error("Génération du quiz échouée, statut tout de même mis à jour:", err.message);
      }
    }

    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_CANDIDATURES,
      Key: { id: req.params.id },
      UpdateExpression: expression,
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: valeurs,
    }));

    ok(res, { message: "Statut mis à jour" });
  } catch (e) {
    console.error("Erreur changement de statut:", e);
    ko(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════════
// ENTRETIENS
// ══════════════════════════════════════════════════════════════════
app.put("/candidatures/:id/entretien", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { entretien, notifier = true } = req.body;
    if (!entretien?.date || !entretien?.heure || !entretien?.type) {
      return ko(res, "date, heure et type sont requis", 400);
    }

    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_CANDIDATURES, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Candidature introuvable", 404);

    const candidature = r.Item;
    const maintenant = new Date().toISOString();
    const entretienId = uuidv4();

    // Entité à part entière, dans sa propre table
    await docClient.send(new PutCommand({
      TableName: T.TABLE_ENTRETIENS,
      Item: {
        id: entretienId,
        candidatureId: candidature.id,
        candidatNom: `${candidature.prenom} ${candidature.nom}`,
        candidatEmail: candidature.email,
        offreTitre: candidature.offreTitre || candidature.posteVise,
        type: String(entretien.type).toUpperCase(),
        dateHeure: `${entretien.date}T${entretien.heure}:00`,
        dureeMinutes: entretien.dureeMinutes || 60,
        lieu: entretien.adresse || null,
        lienVideo: entretien.lien || null,
        interviewers: entretien.interviewers || [],
        statut: "PLANIFIE",
        creeLe: maintenant,
        creeParId: req.user.email,
      },
    }));

    const historique = [...(candidature.historiqueStatuts || []), {
      statut: "ENTRETIEN",
      ancienStatut: candidature.statut,
      date: maintenant,
      commentaire: `Entretien planifié le ${entretien.date} à ${entretien.heure}`,
      modifiePar: req.user.email,
      action: "entretien_planifie",
    }];

    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_CANDIDATURES,
      Key: { id: req.params.id },
      UpdateExpression:
        "SET #s = :s, entretienId = :eid, entretien = :e, historiqueStatuts = :h, misAJourLe = :d",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: {
        ":s": "ENTRETIEN", ":eid": entretienId, ":e": entretien,
        ":h": historique, ":d": maintenant,
      },
    }));

    if (notifier && candidature.email) {
      await docClient.send(new PutCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        Item: {
          id: uuidv4(),
          userId: candidature.email,
          type: "ENTRETIEN_PLANIFIE",
          titre: "Entretien planifié",
          message: `Votre entretien est prévu le ${entretien.date} à ${entretien.heure}.`,
          lu: false,
          creeLe: maintenant,
          expireLe: Math.floor(Date.now() / 1000) + 90 * 86400,
          metadata: { candidatureId: candidature.id, entretienId },
        },
      }));
    }

    ok(res, { message: "Entretien planifié", entretienId, entretien });
  } catch (e) {
    console.error("Erreur planification entretien:", e);
    ko(res, "Impossible de planifier l'entretien");
  }
});

app.get("/entretiens", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const statut = String(req.query.statut || "PLANIFIE").toUpperCase();
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_ENTRETIENS,
      IndexName: "statut-date-index",
      KeyConditionExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: { ":s": statut },
    }));
    ok(res, { entretiens: r.Items || [] });
  } catch (e) {
    console.error("Erreur GET /entretiens:", e);
    ko(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════════
// QUIZ
// ══════════════════════════════════════════════════════════════════
app.post("/quiz/generer", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const { offreId, candidatureId } = req.body;
    if (!offreId) return ko(res, "offreId requis", 400);

    const o = await docClient.send(new GetCommand({ TableName: T.TABLE_OFFRES, Key: { id: offreId } }));
    if (!o.Item) return ko(res, "Offre introuvable", 404);

    const genere = await genererQuizIA(o.Item, 5);
    const quiz = {
      id: uuidv4(), offreId,
      offreTitre: o.Item.titre,
      titre: genere.titre,
      questions: genere.questions,
      dureeMinutes: 30, seuilPassage: 70,
      statut: "ACTIF", genereParIA: true,
      creeLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: T.TABLE_QUIZ, Item: quiz }));

    if (candidatureId) {
      await docClient.send(new UpdateCommand({
        TableName: T.TABLE_CANDIDATURES,
        Key: { id: candidatureId },
        UpdateExpression: "SET quizId = :q, quizStatus = :s",
        ExpressionAttributeValues: { ":q": quiz.id, ":s": "ENVOYE" },
      }));
    }

    ok(res, { quiz });
  } catch (e) {
    console.error("Erreur génération quiz:", e);
    ko(res, e.message);
  }
});

app.get("/quiz/:quizId", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_QUIZ, Key: { id: req.params.quizId },
    }));
    if (!r.Item) return ko(res, "Quiz introuvable", 404);

    if (req.user.role === "RH") return ok(res, { quiz: r.Item });

    // Le candidat doit posséder une candidature rattachée à ce quiz
    const c = await docClient.send(new QueryCommand({
      TableName: T.TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      FilterExpression: "quizId = :q",
      ExpressionAttributeValues: { ":e": req.user.email, ":q": req.params.quizId },
    }));
    const candidature = (c.Items || [])[0];
    if (!candidature) return ko(res, "Vous n'avez pas accès à ce quiz", 403);

    // Les réponses correctes ne quittent jamais le serveur
    const quiz = {
      ...r.Item,
      questions: (r.Item.questions || []).map(({ reponseCorrecte, explication, criteresEvaluation, ...reste }) => reste),
    };

    ok(res, { quiz, candidature });
  } catch (e) {
    console.error("Erreur GET /quiz/:id:", e);
    ko(res, "Impossible de charger le quiz");
  }
});

app.get("/candidat/quizzes", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      FilterExpression: "quizStatus IN (:envoye, :encours)",
      ExpressionAttributeValues: {
        ":e": req.user.email, ":envoye": "ENVOYE", ":encours": "EN_COURS",
      },
    }));

    const quizzes = [];
    for (const c of r.Items || []) {
      let details = null;
      if (c.quizId) {
        const q = await docClient.send(new GetCommand({ TableName: T.TABLE_QUIZ, Key: { id: c.quizId } }));
        details = q.Item;
      }
      const echeance = c.quizExpirationDate || new Date(Date.now() + 7 * 864e5).toISOString();
      quizzes.push({
        id: c.quizId || `quiz-${c.id}`,
        candidatureId: c.id,
        titre: details?.titre || `Évaluation — ${c.offreTitre || c.posteVise}`,
        offreTitre: c.offreTitre || c.posteVise,
        dureeMinutes: details?.dureeMinutes || 30,
        echeance,
        statut: c.quizStatus === "ENVOYE" ? "a_faire" : "en_cours",
        urgent: (new Date(echeance) - Date.now()) / 36e5 < 48,
      });
    }

    ok(res, { quizzes });
  } catch (e) {
    console.error("Erreur quiz candidat:", e);
    ko(res, "Impossible de charger les quiz");
  }
});

app.get("/candidat/meetings", authentifier, async (req, res) => {
  try {
    const cands = await docClient.send(new QueryCommand({
      TableName: T.TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      FilterExpression: "attribute_exists(entretienId)",
      ExpressionAttributeValues: { ":e": req.user.email },
    }));

    const entretiens = [];
    for (const c of cands.Items || []) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_ENTRETIENS,
        IndexName: "candidature-index",
        KeyConditionExpression: "candidatureId = :c",
        ExpressionAttributeValues: { ":c": c.id },
      }));
      entretiens.push(...(r.Items || []));
    }

    entretiens.sort((a, b) => String(a.dateHeure).localeCompare(String(b.dateHeure)));
    ok(res, { entretiens });
  } catch (e) {
    console.error("Erreur entretiens candidat:", e);
    ko(res, "Impossible de charger les entretiens");
  }
});

// ══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════
app.get("/notifications/me", authentifier, async (req, res) => {
  try {
    // Les notifications sont adressées soit à l'email (candidats), soit à
    // l'identifiant employé (congés, paie) : on interroge les deux.
    const cles = [req.user?.email].filter(Boolean);
    const fiche = await employesUtil.parEmail(req.user?.email);
    if (fiche) cles.push(fiche.id);

    const resultats = await Promise.all(cles.map((cle) =>
      docClient.send(new QueryCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        IndexName: "user-date-index",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": cle },
        ScanIndexForward: false,
      }))
    ));

    const notifications = resultats
      .flatMap((r) => r.Items || [])
      .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));

    ok(res, { notifications, nonLues: notifications.filter((n) => !n.lu).length });
  } catch (e) {
    console.error("Erreur notifications:", e);
    ok(res, { notifications: [], nonLues: 0 });
  }
});

app.put("/notifications/:id/lue", authentifier, async (req, res) => {
  try {
    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_NOTIFICATIONS,
      Key: { id: req.params.id },
      UpdateExpression: "SET lu = :v",
      ExpressionAttributeValues: { ":v": true },
    }));
    ok(res, { message: "Notification lue" });
  } catch (e) {
    ko(res, "Impossible de marquer comme lue");
  }
});

app.put("/notifications/lire-tout", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_NOTIFICATIONS,
      IndexName: "user-date-index",
      KeyConditionExpression: "userId = :u",
      FilterExpression: "lu = :faux",
      ExpressionAttributeValues: { ":u": req.user.email, ":faux": false },
    }));

    await Promise.all((r.Items || []).map((n) =>
      docClient.send(new UpdateCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        Key: { id: n.id },
        UpdateExpression: "SET lu = :v",
        ExpressionAttributeValues: { ":v": true },
      }))
    ));

    ok(res, { message: `${r.Items?.length || 0} notification(s) marquée(s) comme lue(s)` });
  } catch (e) {
    ko(res, "Impossible de tout marquer comme lu");
  }
});

// ══════════════════════════════════════════════════════════════════
// CALENDRIER
// ══════════════════════════════════════════════════════════════════
app.get("/evenements", authentifier, via(listerEvenements));
app.post("/evenements", authentifier, via(creerEvenement));
app.put("/evenements/:id", authentifier, via(modifierEvenement));
app.delete("/evenements/:id", authentifier, via(supprimerEvenement));

// ══════════════════════════════════════════════════════════════════
// FACTURES
// ══════════════════════════════════════════════════════════════════
app.post("/factures", authentifier, autoriser("RH"), via(genererFacture));

app.get("/factures", authentifier, async (req, res) => {
  try {
    let factures;

    if (req.user.role === "EMPLOYE") {
      const fiche = await employesUtil.parEmail(req.user.email);
      if (!fiche) return ok(res, { factures: [], total: 0, totalNet: "0.000" });

      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_FACTURES,
        IndexName: "employe-periode-index",
        KeyConditionExpression: "employeId = :e",
        ExpressionAttributeValues: { ":e": fiche.id },
        ScanIndexForward: false,
      }));
      factures = r.Items || [];
    } else if (req.query.employeId) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_FACTURES,
        IndexName: "employe-periode-index",
        KeyConditionExpression: "employeId = :e",
        ExpressionAttributeValues: { ":e": req.query.employeId },
        ScanIndexForward: false,
      }));
      factures = r.Items || [];
    } else {
      // Vue RH globale : aucun index ne couvre « toutes les factures ».
      // Volume borné (un bulletin par employé et par mois), donc acceptable.
      const r = await docClient.send(new ScanCommand({ TableName: T.TABLE_FACTURES }));
      factures = (r.Items || []).sort((a, b) => String(b.periode).localeCompare(String(a.periode)));
    }

    if (req.query.annee) {
      factures = factures.filter((f) => f.annee === parseInt(req.query.annee, 10));
    }

    const totalNet = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);
    ok(res, { factures, total: factures.length, totalNet: totalNet.toFixed(3) });
  } catch (e) {
    console.error("Erreur GET /factures:", e);
    ko(res, "Impossible de récupérer les bulletins");
  }
});

app.get("/factures/pdf/:id", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_FACTURES, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Bulletin introuvable", 404);

    const facture = r.Item;

    if (req.user.role === "EMPLOYE") {
      const fiche = await employesUtil.courant(req.user);
      if (!fiche || facture.employeId !== fiche.id) return ko(res, "Accès refusé", 403);
    }

    if (!facture.pdfKey) return ko(res, "PDF non disponible", 404);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${facture.numero}.pdf"`);

    // Sur AWS le PDF vient de S3, en local du disque : un seul code
    // pour les deux environnements.
    if (s3Lecture) {
      const objet = await s3Lecture.send(new GetObjectCommand({
        Bucket: process.env.DOCUMENTS_BUCKET,
        Key: facture.pdfKey,
      }));
      return objet.Body.pipe(res);
    }

    const chemin = path.join(process.cwd(), "tmp", facture.pdfKey);
    if (!fs.existsSync(chemin)) {
      return ko(res, "PDF absent. Régénérez le bulletin.", 404);
    }
    fs.createReadStream(chemin).pipe(res);
  } catch (e) {
    console.error("Erreur lecture PDF:", e);
    ko(res, e.name === "NoSuchKey" ? "PDF introuvable sur le stockage" : e.message);
  }
});

app.delete("/factures/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: T.TABLE_FACTURES, Key: { id: req.params.id },
    }));
    ok(res, { message: "Bulletin supprimé" });
  } catch (e) {
    ko(res, e.message);
  }
});

// ══════════════════════════════════════════════════════════════════
// TABLEAU DE BORD
// ══════════════════════════════════════════════════════════════════
app.get("/dashboard", authentifier, autoriser("RH"), via(dashboardStats));

// ══════════════════════════════════════════════════════════════════
// OFFRES
// ══════════════════════════════════════════════════════════════════
app.get("/offres", async (req, res) => {
  try {
    // Site carrière public : uniquement les offres actives
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_OFFRES,
      IndexName: "statut-index",
      KeyConditionExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: { ":s": String(req.query.statut || "ACTIVE").toUpperCase() },
      ScanIndexForward: false,
    }));
    ok(res, { offres: r.Items || [] });
  } catch (e) {
    console.error("Erreur GET /offres:", e);
    ko(res, "Impossible de charger les offres");
  }
});

app.post("/offres", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const maintenant = new Date().toISOString();
    const offre = {
      ...req.body,
      id: uuidv4(),
      statut: String(req.body.statut || "ACTIVE").toUpperCase(),
      competences: req.body.competences || [],
      nombreCandidatures: 0,
      creeLe: maintenant,
      misAJourLe: maintenant,
    };
    await docClient.send(new PutCommand({ TableName: T.TABLE_OFFRES, Item: offre }));
    ok(res, { offre }, 201);
  } catch (e) {
    console.error("Erreur création offre:", e);
    ko(res, "Impossible de créer l'offre");
  }
});

app.put("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_OFFRES,
      Key: { id: req.params.id },
      UpdateExpression:
        "SET titre = :t, departement = :d, #ty = :ty, modeTravail = :m, " +
        "description = :desc, competences = :c, #s = :s, misAJourLe = :maj",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeNames: { "#ty": "type", "#s": "statut" },
      ExpressionAttributeValues: {
        ":t": req.body.titre,
        ":d": req.body.departement,
        ":ty": req.body.type,
        ":m": req.body.modeTravail || "",
        ":desc": req.body.description || "",
        ":c": req.body.competences || [],
        ":s": String(req.body.statut || "ACTIVE").toUpperCase(),
        ":maj": new Date().toISOString(),
      },
    }));
    ok(res, { message: "Offre mise à jour" });
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return ko(res, "Offre introuvable", 404);
    console.error("Erreur modification offre:", e);
    ko(res, "Impossible de modifier l'offre");
  }
});

app.delete("/offres/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({ TableName: T.TABLE_OFFRES, Key: { id: req.params.id } }));
    ok(res, { message: "Offre supprimée" });
  } catch (e) {
    ko(res, "Impossible de supprimer l'offre");
  }
});

// ══════════════════════════════════════════════════════════════════
app.use((req, res) => ko(res, `Route inconnue : ${req.method} ${req.path}`, 404));

const PORT = 3000;

// N'écoute que si le fichier est lancé directement. En Lambda, c'est
// lambda.js qui importe l'application sans jamais ouvrir de port.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Serveur RH — http://localhost:${PORT}`);
    console.log(`   Fuseau : ${process.env.FUSEAU_HORAIRE}`);
    console.log(`   Données : ${process.env.DYNAMODB_ENDPOINT}\n`);
  });
}

module.exports = app;