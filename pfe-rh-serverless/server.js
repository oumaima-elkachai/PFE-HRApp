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




  process.env.COURRIEL_EXPEDITEUR = "elkachaioumaima@gmail.com";
  process.env.URL_APPLICATION     = "http://localhost:5173";


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
  process.env.TABLE_PROFILS_CANDIDATS = "ProfilsCandidats-local";
  
  process.env.TABLE_DEMANDES_DOCUMENTS = "DemandesDocuments-local";

  process.env.TABLE_NOTES_FRAIS = "NotesFrais-local";  
  process.env.TABLE_MESSAGES = "Messages-local";
  process.env.TABLE_ALERTES_OFFRES = "AlertesOffres-local";
  process.env.TABLE_SITES = "Sites-local";
  
  process.env.TABLE_SITES = "Sites-local";
  process.env.TABLE_BIOMETRIE = "Biometrie-local";

  process.env.TABLE_PIECES_DOSSIER = "PiecesDossier-local";
  process.env.TABLE_COOPTATIONS = "Cooptations-local";
  

}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

const { authentifier, authentifierOptionnel, autoriser } = require("./src/auth/middleware");
const { docClient } = require("./src/utils/dynamodb");
const { analyserCV, genererQuizIA } = require("./src/services/bedrockService");
const employesUtil = require("./src/utils/employe");
const { v4: uuidv4 } = require("uuid");
const documents = require("./src/services/documents");
const notesFrais = require("./src/frais/notes");


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
const demarrerQuiz  = require("./src/quiz/demarrer");
const soumettreQuiz = require("./src/quiz/soumettre");
const courriel = require("./src/services/courriel");
const profilCandidat = require("./src/candidat/profil");
const agendaCandidat = require("./src/candidat/agenda");
const notifications = require("./src/utils/notification");

const cooptation = require("./src/cooptation/cooptations");
const annuaire = require("./src/employes/annuaire");
// ── Utilitaires ──────────────────────────────────────────────────
// ── Téléversements ───────────────────────────────────────────────
// Deux configurations distinctes : un CV est un document, un
// justificatif de frais est le plus souvent une photo de reçu.

const TAILLE_MAX = 5 * 1024 * 1024;

function filtreFormats(acceptes, message) {
  return (req, file, cb) => {
    // Les deux arguments s'excluent : soit une erreur, soit
    // l'acceptation. Les passer ensemble laisse Multer dans un état
    // indéfini — c'était le défaut de la version précédente.
    if (acceptes.includes(file.mimetype)) return cb(null, true);
    cb(new Error(message));
  };
}

const uploadCV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
  fileFilter: filtreFormats(
    [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    "Format non supporté. Utilisez PDF ou DOCX."
  ),
});

const uploadJustificatif = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
  fileFilter: filtreFormats(
    ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    "Format non supporté. Utilisez PDF, JPEG ou PNG."
  ),
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

  if (resultat && resultat.isBase64Encoded) {
    for (const [nom, valeur] of Object.entries(resultat.headers || {})) {
      res.setHeader(nom, valeur);
    }
    return res.status(resultat.statusCode || 200).send(Buffer.from(resultat.body, "base64"));
  }

  const corps = typeof resultat.body === "string" ? JSON.parse(resultat.body) : resultat.body;
  res.status(resultat.statusCode).json(corps);
}

/** Raccourci : route qui délègue entièrement à un handler */
const via = (handler) => async (req, res) => {
  try {
    // req.file n'existe que sur une route passée par multer ; ailleurs
    // il vaut undefined, ce que les handlers traitent déjà.
    envoyer(res, await handler.handler(toEvent(req), req.file));
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

    // Route LIBRE-SERVICE : elle n'exige pas le rôle RH, donc elle ne
    // doit écrire que ce qu'un salarié a le droit de changer sur
    // lui-même. « poste » et « departement » en sont retirés : ils
    // décrivent la place du salarié dans l'entreprise, pas ses
    // coordonnées, et relèvent de PUT /employes/:id — réservé à la RH.
    //
    // Les retirer du formulaire React n'aurait rien fermé : une
    // interface cache un bouton, elle n'empêche pas une requête.
    const { telephone, adresse } = req.body;

    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_EMPLOYES,
      Key: { id: fiche.id },
      UpdateExpression:
        "SET telephone = :t, adresse = :a, misAJourLe = :maj",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: {
        ":t": telephone ?? fiche.telephone ?? "",
        ":a": adresse ?? fiche.adresse ?? "",
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

const recommandations = require("./src/offres/recommandations");
const messagerie = require("./src/messagerie/fils");

app.get("/offres/recommandations", authentifier, async (req, res) => {
  envoyer(res, await recommandations.recommander(toEvent(req)));
});
app.get("/offres/alerte", authentifier, async (req, res) => {
  envoyer(res, await recommandations.lireAlerte(toEvent(req)));
});
app.put("/offres/alerte", authentifier, async (req, res) => {
  envoyer(res, await recommandations.enregistrerAlerte(toEvent(req)));
});

// ── MESSAGERIE INTERNE ─────────────────────────────────────────────
const internes = require("./src/messagerie/internes");

// Mes fils, tous confondus
app.get("/messages/internes", authentifier, async (req, res) => {
  try {
    const r = await internes.handlerFils(toEvent(req));
    res.status(r.statusCode).send(r.body);
  } catch (e) {
    console.error("Erreur GET /messages/internes :", e);
    res.status(500).json({ succes: false, erreur: "Erreur serveur" });
  }
});

// Un fil avec un collègue, et marquage des messages reçus comme lus
app.get("/messages/internes/:employeId", authentifier, async (req, res) => {
  try {
    const r = await internes.handlerFil(toEvent(req));
    res.status(r.statusCode).send(r.body);
  } catch (e) {
    console.error("Erreur GET fil interne :", e);
    res.status(500).json({ succes: false, erreur: "Erreur serveur" });
  }
});

app.post("/messages/internes/:employeId", authentifier, async (req, res) => {
  try {
    const r = await internes.handlerEnvoyer(toEvent(req));
    res.status(r.statusCode).send(r.body);
  } catch (e) {
    console.error("Erreur POST fil interne :", e);
    res.status(500).json({ succes: false, erreur: "Erreur serveur" });
  }
});

app.get("/messages/conversations", authentifier, async (req, res) => {
  envoyer(res, await messagerie.mesConversations(toEvent(req)));
});
app.get("/messages/:candidatureId", authentifier, async (req, res) => {
  envoyer(res, await messagerie.lire(toEvent(req)));
});
app.post("/messages/:candidatureId", authentifier, async (req, res) => {
  envoyer(res, await messagerie.envoyer(toEvent(req)));
});

app.post("/employes/:id/adresse-professionnelle", authentifier, autoriser("RH"),
  async (req, res) => {
    try {
      envoyer(res, await invitations.handlerAdressePro(toEvent(req)));
    } catch (e) {
      console.error("[adresse-pro]", e);
      res.status(500).json({ erreur: e.message });
    }
  });

const dossier = require("./src/dossier/pieces");

// ── Dossier du personnel ──
// Le salarié, en son propre nom
app.get("/dossier/mes-pieces", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerMesPieces(toEvent(req))); }
  catch (e) { console.error("Erreur GET mes-pieces :", e); res.status(500).json({ erreur: e.message }); }
});

app.post("/dossier/pieces", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerDeposer(toEvent(req))); }
  catch (e) { console.error("Erreur POST piece :", e); res.status(500).json({ erreur: e.message }); }
});

app.get("/dossier/pieces/:id/fichier", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerFichier(toEvent(req))); }
  catch (e) { console.error("Erreur GET fichier piece :", e); res.status(500).json({ erreur: e.message }); }
});

// La RH — « a-valider » AVANT « :employeId »
app.get("/dossier/a-valider", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerAValider(toEvent(req))); }
  catch (e) { console.error("Erreur GET a-valider :", e); res.status(500).json({ erreur: e.message }); }
});

app.get("/dossier/employes/:employeId/pieces", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerDossierEmploye(toEvent(req))); }
  catch (e) { console.error("Erreur GET dossier employe :", e); res.status(500).json({ erreur: e.message }); }
});

app.put("/dossier/pieces/:id", authentifier, async (req, res) => {
  try { envoyer(res, await dossier.handlerTraiter(toEvent(req))); }
  catch (e) { console.error("Erreur PUT piece :", e); res.status(500).json({ erreur: e.message }); }
});


const importEmployes = require("./src/employes/import-employes");

app.post("/employes/import", authentifier, async (req, res) => {
  try { envoyer(res, await importEmployes.handlerImporter(toEvent(req))); }
  catch (e) { console.error("Erreur POST import employes :", e); res.status(500).json({ erreur: e.message }); }
});

app.get("/employes/import/modele", authentifier, async (req, res) => {
  try { envoyer(res, await importEmployes.handlerModele(toEvent(req))); }
  catch (e) { console.error("Erreur GET modele import :", e); res.status(500).json({ erreur: e.message }); }
});
// ══════════════════════════════════════════════════════════════════
// POINTAGES
// ══════════════════════════════════════════════════════════════════

const biometrie = require("./src/biometrie/biometrie");
const corrections = require("./src/pointages/corrections");

app.post("/biometrie/enroler",      authentifier, async (req, res) => envoyer(res, await biometrie.enroler(toEvent(req))));
app.get("/biometrie/etat",          authentifier, async (req, res) => envoyer(res, await biometrie.etat(toEvent(req))));
app.delete("/biometrie",            authentifier, async (req, res) => envoyer(res, await biometrie.revoquer(toEvent(req))));
app.get("/biometrie/statistiques",  authentifier, async (req, res) => envoyer(res, await biometrie.statistiques(toEvent(req))));

app.post("/biometrie/mesurer", authentifier, async (req, res) => envoyer(res, await biometrie.mesurer(toEvent(req))));


app.post("/pointages/arrivee", authentifier, via(pointageArrivee));
app.post("/pointages/depart",  authentifier, via(pointageDepart));
app.get("/pointages",          authentifier, via(historiquePointages));

app.post("/pointages/corrections", authentifier,
  async (req, res) => envoyer(res, await corrections.demander(toEvent(req))));

app.get("/pointages/corrections", authentifier,
  async (req, res) => envoyer(res, await corrections.lister(toEvent(req))));

app.post("/pointages/corrections/:id/decision", authentifier, autoriser("RH"),
  async (req, res) => envoyer(res, await corrections.decider(toEvent(req))));

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

const invitations = require("./src/employes/invitations");
const entreprise = require("./src/factures/entreprise");

app.get("/entreprise", authentifier, async (req, res) => {
  try { envoyer(res, await entreprise.handlerLire(toEvent(req))); }
  catch (e) { console.error("Erreur GET entreprise :", e); res.status(500).json({ erreur: e.message }); }
});

app.put("/entreprise", authentifier, async (req, res) => {
  try { envoyer(res, await entreprise.handlerEnregistrer(toEvent(req))); }
  catch (e) { console.error("Erreur PUT entreprise :", e); res.status(500).json({ erreur: e.message }); }
});


app.post("/employes/:id/invitation", authentifier, async (req, res) => {
  try { envoyer(res, await invitations.handlerInviter(toEvent(req))); }
  catch (e) { console.error("Erreur POST invitation :", e); res.status(500).json({ erreur: e.message }); }
});

app.get("/employes/:id/compte", authentifier, async (req, res) => {
  try { envoyer(res, await invitations.handlerEtatCompte(toEvent(req))); }
  catch (e) { console.error("Erreur GET compte :", e); res.status(500).json({ erreur: e.message }); }
});

app.delete("/employes/:id/compte", authentifier, async (req, res) => {
  try { envoyer(res, await invitations.handlerDesactiver(toEvent(req))); }
  catch (e) { console.error("Erreur DELETE compte :", e); res.status(500).json({ erreur: e.message }); }
});


// ══════════════════════════════════════════════════════════════════
// CONGÉS
// ══════════════════════════════════════════════════════════════════
const justificatifConge = require("./src/conges/justificatif");


// En mémoire : le fichier part ensuite vers S3 ou le disque, il n'a
// pas à transiter par un répertoire temporaire.
const televerser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Multer ne traite que le multipart ; sur une requête JSON il laisse
 * le corps intact mais empêche express.json() de s'exécuter ensuite.
 * On ne l'engage donc que lorsque le type de contenu l'appelle.
 */
const pieceOptionnelle = (champ) => (req, res, next) => {
  const type = req.headers["content-type"] || "";
  if (type.startsWith("multipart/form-data")) {
    return televerser.single(champ)(req, res, next);
  }
  next();
};

app.get("/conges", authentifier, via(listerConges));
app.patch("/conges/:id", authentifier, autoriser("RH"), via(traiterConge));




// Multer pose le fichier sur req.file et les champs texte sur req.body
app.post(
  "/conges",
  authentifier,
  pieceOptionnelle("justificatif"),
  async (req, res) => {
    try {
      const r = await demanderConge.handler(toEvent(req), req.file);
      res.status(r.statusCode).json(JSON.parse(r.body));
    } catch (e) {
      console.error("Erreur POST /conges :", e);
      res.status(500).json({ succes: false, erreur: e.message });
    }
  },
);
app.get("/conges/:id/justificatif", authentifier, async (req, res) => {
  const r = await justificatifConge.handler(toEvent(req));
  if (r.isBase64Encoded) {
    res.set(r.headers);
    return res.send(Buffer.from(r.body, "base64"));
  }
  res.status(r.statusCode).json(JSON.parse(r.body));
});



app.post(
  "/cooptations",
  authentifier,
  pieceOptionnelle("cv"),
  async (req, res) => {
    try {
      const r = await cooptation.proposer(toEvent(req), req.file);
      res.status(r.statusCode).json(JSON.parse(r.body));
    } catch (e) {
      console.error("Erreur POST /cooptations :", e);
      res.status(500).json({ succes: false, erreur: e.message });
    }
  },
);
 
app.get("/cooptations", authentifier, async (req, res) => {
  try {
    const r = await cooptation.lister(toEvent(req));
    res.status(r.statusCode).json(JSON.parse(r.body));
  } catch (e) {
    console.error("Erreur GET /cooptations :", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
 
app.get("/cooptations/:id", authentifier, async (req, res) => {
  try {
    const r = await cooptation.detail(toEvent(req));
    res.status(r.statusCode).json(JSON.parse(r.body));
  } catch (e) {
    console.error("Erreur GET /cooptations/:id :", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
 
app.patch("/cooptations/:id", authentifier, async (req, res) => {
  try {
    const r = await cooptation.decider(toEvent(req));
    res.status(r.statusCode).json(JSON.parse(r.body));
  } catch (e) {
    console.error("Erreur PATCH /cooptations/:id :", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
 
app.post("/cooptations/:id/prime", authentifier, async (req, res) => {
  try {
    const r = await cooptation.accorderPrime(toEvent(req));
    res.status(r.statusCode).json(JSON.parse(r.body));
  } catch (e) {
    console.error("Erreur POST /cooptations/:id/prime :", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});
 
// ── Le CV ───────────────────────────────────────────────────────────
//
// Celle-ci ne renvoie pas du JSON mais le fichier lui-même, comme ta
// route de téléchargement des attestations. Le front le reçoit en
// `blob` et le pose dans les téléchargements.
//
// Pas d'adresse directe vers le seau : une adresse se copie, se colle
// dans un message, et le CV d'un candidat se retrouve lisible par
// quelqu'un qui n'a jamais eu le droit de l'ouvrir.
 
app.get("/cooptations/:id/cv", authentifier, async (req, res) => {
  try {
    const r = await cooptation.telechargerCv(toEvent(req));
 
    // Un refus garde la forme habituelle ; on le relaie tel quel.
    if (r.statusCode) {
      return res.status(r.statusCode).json(JSON.parse(r.body));
    }
 
    res.setHeader("Content-Type", r.type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(r.nom)}`,
    );
    res.send(r.corps);
  } catch (e) {
    console.error("Erreur GET /cooptations/:id/cv :", e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// CANDIDATURES
// ══════════════════════════════════════════════════════════════════
// Le candidat peut passer par une offre ou postuler spontanement.
// Dans le second cas, il reutilise souvent le CV deja depose dans son
// profil plutot que d'en joindre un nouveau.
app.post("/candidatures", authentifierOptionnel, uploadCV.single("cv"), async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone, lettreMotivation,
      niveauEtude, experience, competences, offreId, linkedin,
      posteVise: posteVoulu, reutiliserCvProfil,
    } = req.body;

    if (!nom || !prenom || !email || !lettreMotivation) {
      return ko(res, "Champs obligatoires manquants", 400);
    }

    let offre = null;
    let posteVise = posteVoulu || "Candidature spontanée";
    if (offreId) {
      const r = await docClient.send(new GetCommand({
        TableName: T.TABLE_OFFRES, Key: { id: offreId },
      }));
      if (r.Item) { offre = r.Item; posteVise = offre.titre; }
    }

    const listeCompetences = (() => {
      try { return JSON.parse(competences || "[]"); }
      catch { return String(competences || "").split(",").map((c) => c.trim()).filter(Boolean); }
    })();

    // ── Resolution du CV ─────────────────────────────────────────
    // Trois cas : un fichier joint, la reutilisation du CV du profil,
    // ou rien du tout. La reutilisation recopie la cle sans dupliquer
    // le fichier sur le stockage.
    let cvKey = null;
    let cvFileName = req.file?.originalname || null;
    let bufferPourAnalyse = req.file?.buffer || null;
    let mimetypePourAnalyse = req.file?.mimetype || "application/pdf";

    if (req.file) {
      cvKey = await documents.stockerCv(req.file);
    } else if (reutiliserCvProfil === "true" && req.user?.sub) {
      const p = await docClient.send(new GetCommand({
        TableName: T.TABLE_PROFILS_CANDIDATS, Key: { id: req.user.sub },
      }));
      if (p.Item?.cvKey) {
        cvKey = p.Item.cvKey;
        cvFileName = p.Item.cvFileName || cvFileName;

        // Le CV est relu depuis le stockage pour que l'analyse porte
        // sur son contenu, et non sur les seules declarations.
        try {
          const doc = await documents.lireDocument(cvKey);
          if (doc?.contenu) {
            bufferPourAnalyse = doc.contenu;
            mimetypePourAnalyse = doc.type || mimetypePourAnalyse;
          } else if (doc?.flux) {
            const morceaux = [];
            for await (const m of doc.flux) morceaux.push(m);
            bufferPourAnalyse = Buffer.concat(morceaux);
            mimetypePourAnalyse = doc.type || mimetypePourAnalyse;
          }
        } catch (e) {
          console.warn("CV du profil illisible, analyse sur declarations:", e.message);
        }
      }
    }

    const analyse = await analyserCV({
      fileBuffer: bufferPourAnalyse || Buffer.from(""),
      mimetype: mimetypePourAnalyse,
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
      // offreId est OMIS et non mis a null : DynamoDB refuse une valeur
      // nulle sur une cle d'index. L'absence exclut la candidature
      // spontanee du classement par offre, ce qui est voulu.
      ...(offreId ? { offreId } : {}),
      offreTitre: posteVise,
      posteVise,
      nom, prenom,
      email: String(email).trim().toLowerCase(),
      telephone: telephone || "",
      cvFileName,
      cvKey,
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
      // Le service renvoie desormais la source explicitement : sans
      // cette trace, un score calcule par repli passerait pour une
      // analyse par le modele.
      sourceAnalyse: analyse.source || "bedrock",
      extractionReussie: analyse.extractionReussie ?? null,
      quizId: null,
      quizStatus: "NON_ENVOYE",
      statut,
      historiqueStatuts: [{
        statut: "SOUMIS", date: maintenant,
        commentaire: `Score ${analyse.score}/100 — ${analyse.recommendation}`,
        action: "candidature_soumise",
      }],
      source: offreId ? "site_carriere" : "spontanee",
      creeLe: maintenant,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({
      TableName: T.TABLE_CANDIDATURES, Item: candidature,
    }));

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

app.get("/candidatures/:id/cv", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_CANDIDATURES, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Candidature introuvable", 404);
    if (!r.Item.cvKey) return ko(res, "Aucun CV enregistré pour cette candidature", 404);

    const doc = await documents.lireDocument(r.Item.cvKey);
    if (!doc) return ko(res, "Fichier introuvable sur le stockage", 404);

    const nom = r.Item.cvFileName || `CV_${r.Item.nom}_${r.Item.prenom}.pdf`;
    res.setHeader("Content-Type", doc.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);

    if (doc.flux) return doc.flux.pipe(res);
    res.send(doc.contenu);
  } catch (e) {
    console.error("Erreur lecture CV:", e);
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

        // Prevenir le candidat : sans message, il ne saurait pas qu'un
        // quiz l'attend avant de se connecter. L'envoi reste dans ce
        // bloc : quizId n'existe que si le quiz a ete cree.
        await courriel.quizEnvoye({
          destinataire: candidature.email,
          prenom: candidature.prenom,
          offreTitre: candidature.offreTitre || candidature.posteVise,
          quizId,
          dureeMinutes: 30,
          echeance: valeurs[":qx"],
        }).catch((e) => console.error("Courriel de quiz non envoyé:", e.message));
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

      // Un echec d'envoi ne doit pas annuler la planification :
      // l'entretien est deja enregistre et visible dans l'agenda.
      await courriel.entretienPlanifie({
        destinataire: candidature.email,
        prenom: candidature.prenom,
        offreTitre: candidature.offreTitre || candidature.posteVise,
        entretien: {
          dateHeure: `${entretien.date}T${entretien.heure}:00`,
          dureeMinutes: entretien.dureeMinutes || 60,
          lienVideo: entretien.lien || null,
          lieu: entretien.adresse || null,
        },
      }).catch((e) => console.error("Courriel d'entretien non envoyé:", e.message));
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
// Consultation RH
app.get("/quiz/sessions", authentifier, autoriser("RH"), async (req, res) => {
  try {
    if (!req.query.candidatureId) return ko(res, "candidatureId requis", 400);
    const r = await docClient.send(new QueryCommand({
      TableName: T.TABLE_QUIZ_SESSIONS,
      IndexName: "candidature-index",
      KeyConditionExpression: "candidatureId = :c",
      ExpressionAttributeValues: { ":c": req.query.candidatureId },
      ScanIndexForward: false,
    }));
    ok(res, { sessions: r.Items || [] });
  } catch (e) {
    ko(res, e.message);
  }
});

app.get("/quiz/sessions/:id", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_QUIZ_SESSIONS, Key: { id: req.params.id },
    }));
    if (!r.Item) return ko(res, "Session introuvable", 404);
    ok(res, { session: r.Item });
  } catch (e) {
    ko(res, e.message);
  }
});


// Indicateurs d'intégrité remontés pendant le passage
app.put("/quiz/sessions/:id/integrite", authentifier, async (req, res) => {
  try {
    const { nombreChangementsOnglet = 0, nombreCopierColler = 0 } = req.body;
    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_QUIZ_SESSIONS,
      Key: { id: req.params.id },
      UpdateExpression: "SET nombreChangementsOnglet = :o, nombreCopierColler = :c",
      // Ne touche qu'une session en cours appartenant au candidat
      ConditionExpression: "candidatEmail = :e AND statut = :s",
      ExpressionAttributeValues: {
        ":o": Number(nombreChangementsOnglet) || 0,
        ":c": Number(nombreCopierColler) || 0,
        ":e": req.user.email,
        ":s": "EN_COURS",
      },
    }));
    ok(res, { enregistre: true });
  } catch {
    // Silencieux : un échec ici ne doit pas perturber le passage
    ok(res, { enregistre: false });
  }
});





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
app.post("/quiz/:quizId/demarrer", authentifier, via(demarrerQuiz));
app.post("/quiz/sessions/:sessionId/soumettre", authentifier, via(soumettreQuiz));

// Consultation d'un quiz avec son corrigé — réservée à la RH.
// Un candidat passe par POST /quiz/:quizId/demarrer, qui ouvre une
// session et retire les réponses correctes.
app.get("/quiz/:quizId", authentifier, autoriser("RH"), async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_QUIZ, Key: { id: req.params.quizId },
    }));
    if (!r.Item) return ko(res, "Quiz introuvable", 404);
    ok(res, { quiz: r.Item });
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
      // TERMINE inclus : le candidat doit retrouver ses evaluations
      // passees et leur resultat, pas seulement celles a faire.
      FilterExpression: "quizStatus IN (:envoye, :encours, :termine)",
      ExpressionAttributeValues: {
        ":e": req.user.email,
        ":envoye": "ENVOYE",
        ":encours": "EN_COURS",
        ":termine": "TERMINE",
      },
    }));

    const quizzes = [];

    for (const c of r.Items || []) {
      if (!c.quizId) continue;

      const q = await docClient.send(new GetCommand({
        TableName: T.TABLE_QUIZ, Key: { id: c.quizId },
      }));
      if (!q.Item) continue;

      const details = q.Item;
      const termine = c.quizStatus === "TERMINE";

      // Un quiz archive reste visible une fois passe : le candidat
      // conserve l'acces a son resultat.
      if (!termine && details.statut !== "ACTIF") continue;

      const echeance = c.quizExpirationDate
        || new Date(Date.now() + 7 * 864e5).toISOString();
      const heuresRestantes = (new Date(echeance) - Date.now()) / 36e5;
      const seuil = details.seuilPassage || 70;

      quizzes.push({
        id: details.id,
        candidatureId: c.id,
        titre: details.titre || `Évaluation — ${c.offreTitre || c.posteVise}`,
        offreTitre: c.offreTitre || c.posteVise,
        dureeMinutes: details.dureeMinutes || 30,
        nombreQuestions: (details.questions || []).length,
        seuilPassage: seuil,
        echeance,
        statut: termine ? "termine" : c.quizStatus === "ENVOYE" ? "a_faire" : "en_cours",
        urgent: !termine && heuresRestantes > 0 && heuresRestantes < 48,
        expire: !termine && heuresRestantes <= 0,
        // Resultat, uniquement pour un quiz passe
        scoreObtenu: termine ? (c.scoreQuiz ?? null) : null,
        reussi: termine && c.scoreQuiz != null ? c.scoreQuiz >= seuil : null,
      });
    }

    // A faire d'abord, par echeance ; puis les termines
    quizzes.sort((a, b) => {
      if ((a.statut === "termine") !== (b.statut === "termine")) {
        return a.statut === "termine" ? 1 : -1;
      }
      return String(a.echeance).localeCompare(String(b.echeance));
    });

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


app.get("/candidat/agenda", authentifier, async (req, res) => {
  envoyer(res, await agendaCandidat.lister(toEvent(req)));
});

// L'export renvoie du texte brut, pas du JSON : envoyer() casserait
// le format attendu par les clients d'agenda.
app.get("/candidat/agenda.ics", authentifier, async (req, res) => {
  const resultat = await agendaCandidat.exporterIcs(toEvent(req));
  if (resultat.statusCode !== 200) return envoyer(res, resultat);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="hr-up-agenda.ics"');
  res.send(resultat.body);
});



app.get("/candidat/profil", authentifier, async (req, res) => {
  envoyer(res, await profilCandidat.lire(toEvent(req)));
});

app.put("/candidat/profil", authentifier, async (req, res) => {
  envoyer(res, await profilCandidat.modifier(toEvent(req)));
});

app.post("/candidat/profil/cv", authentifier, uploadCV.single("cv"), async (req, res) => {
  envoyer(res, await profilCandidat.televerserCv(toEvent(req), req.file));
});

app.delete("/candidat/profil/cv", authentifier, async (req, res) => {
  envoyer(res, await profilCandidat.supprimerCv(toEvent(req)));
});

// Lecture du CV par le candidat lui-même
app.get("/candidat/profil/cv", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_PROFILS_CANDIDATS, Key: { id: req.user.sub },
    }));
    if (!r.Item?.cvKey) return ko(res, "Aucun CV", 404);

    const doc = await documents.lireDocument(r.Item.cvKey);
    if (!doc) return ko(res, "Fichier introuvable", 404);

    res.setHeader("Content-Type", doc.type || "application/pdf");
    if (doc.flux) return doc.flux.pipe(res);
    res.send(doc.contenu);
  } catch (e) {
    ko(res, e.message);
  }
});


// ══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════


async function clesNotification(utilisateur) {
  const email = utilisateur?.email ?? null;

  // La fiche peut ne pas exister : un candidat n'en a pas, et un
  // compte RH mal rattaché non plus. Ce n'est pas une erreur.
  let fiche = null;
  try {
    if (email) fiche = await employesUtil.parEmail(email);
  } catch (e) {
    console.error("Fiche introuvable pour les notifications :", e.message);
  }

  return notifications.clesLecture({
    email,
    employeId: fiche?.id ?? null,
    roles: notifications.rolesDe(utilisateur),
  });
}

app.get("/notifications/me", authentifier, async (req, res) => {
  try {
    const cles = await clesNotification(req.user);

    const resultats = await Promise.all(cles.map((cle) =>
      docClient.send(new QueryCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        IndexName: "user-date-index",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": cle },
        ScanIndexForward: false,
      }))
    ));

    // Déduplication par identifiant. Deux clés différentes ne peuvent
    // pas rendre la même ligne aujourd'hui, mais ce sera le cas le
    // jour où un émetteur écrira vers un rôle ET vers la personne —
    // et une notification affichée deux fois se remarque tout de
    // suite, alors que la cause ne se voit pas.
    const vues = new Set();
    const liste = [];

    for (const r of resultats) {
      for (const n of r.Items || []) {
        if (vues.has(n.id)) continue;
        vues.add(n.id);
        liste.push(n);
      }
    }

    liste.sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));

    ok(res, {
      notifications: liste,
      nonLues: liste.filter((n) => !n.lu).length,
    });
  } catch (e) {
    console.error("Erreur notifications:", e);
    ok(res, { notifications: [], nonLues: 0 });
  }
});

app.put("/notifications/:id/lue", authentifier, async (req, res) => {
  try {
    // ── Contrôle d'appartenance ──
    //
    // La version précédente marquait n'importe quelle notification
    // comme lue, sur simple connaissance de son identifiant. Un
    // compte authentifié pouvait donc marquer celles des autres.
    //
    // Ce n'est pas une fuite de données — rien n'est renvoyé — mais
    // c'est une écriture sur le bien d'autrui, et c'est le genre de
    // chose qu'un jury cherche quand il voit une route avec un
    // identifiant dans l'URL.
    const lu = await docClient.send(new GetCommand({
      TableName: T.TABLE_NOTIFICATIONS,
      Key: { id: req.params.id },
    }));

    const notification = lu.Item;

    // Même réponse pour « inexistante » et « pas à vous » : distinguer
    // les deux permettrait de deviner l'existence d'une notification
    // en essayant des identifiants.
    if (!notification) return ko(res, "Notification introuvable");

    const cles = await clesNotification(req.user);
    if (!cles.includes(notification.userId)) {
      return ko(res, "Notification introuvable");
    }

    await docClient.send(new UpdateCommand({
      TableName: T.TABLE_NOTIFICATIONS,
      Key: { id: req.params.id },
      UpdateExpression: "SET lu = :v",
      ExpressionAttributeValues: { ":v": true },
    }));

    ok(res, { message: "Notification lue" });
  } catch (e) {
    console.error("Erreur marquage notification:", e);
    ko(res, "Impossible de marquer comme lue");
  }
});

app.put("/notifications/lire-tout", authentifier, async (req, res) => {
  try {
    const cles = await clesNotification(req.user);

    // Les identifiants sont rassemblés avant d'écrire : une même
    // notification atteignable par deux clés serait sinon mise à jour
    // deux fois, et comptée deux fois dans le total annoncé.
    const aMarquer = new Set();

    for (const cle of cles) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        IndexName: "user-date-index",
        KeyConditionExpression: "userId = :u",
        FilterExpression: "lu = :faux",
        ExpressionAttributeValues: { ":u": cle, ":faux": false },
      }));

      for (const n of r.Items || []) aMarquer.add(n.id);
    }

    await Promise.all([...aMarquer].map((id) =>
      docClient.send(new UpdateCommand({
        TableName: T.TABLE_NOTIFICATIONS,
        Key: { id },
        UpdateExpression: "SET lu = :v",
        ExpressionAttributeValues: { ":v": true },
      }))
    ));

    ok(res, {
      message: `${aMarquer.size} notification(s) marquée(s) comme lue(s)`,
    });
  } catch (e) {
    console.error("Erreur lecture de tout:", e);
    ko(res, "Impossible de tout marquer comme lu");
  }
});

const demandesDoc = require("./src/documents/demandes");


app.get("/documents/types", authentifier, via(demandesDoc.typesDisponibles));
app.get("/documents/demandes", authentifier, async (req, res) => {
  envoyer(res, await demandesDoc.lister(toEvent(req)));
});
app.post("/documents/demandes", authentifier, async (req, res) => {
  envoyer(res, await demandesDoc.demander(toEvent(req)));
});
app.put("/documents/demandes/:id", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await demandesDoc.traiter(toEvent(req)));
});


app.get("/documents/demandes/:id/fichier", authentifier, async (req, res) => {
  const r = await demandesDoc.telecharger(toEvent(req));
  if (r.statusCode) return envoyer(res, r);

  const doc = await documents.lireDocument(r.pdfKey);
  if (!doc) return ko(res, "Fichier introuvable", 404);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${r.nom}"`);
  if (doc.flux) return doc.flux.pipe(res);
  res.send(doc.contenu);
});

// Délivrance directe par la RH — celle qui donnait 404
app.post("/documents/delivrer", authentifier, async (req, res) => {
  try { envoyer(res, await demandesDoc.delivrer(toEvent(req))); }
  catch (e) { console.error("Erreur délivrance :", e); res.status(500).json({ erreur: e.message }); }
});

// Annulation par le salarié
app.delete("/documents/demandes/:id", authentifier, async (req, res) => {
  try { envoyer(res, await demandesDoc.annuler(toEvent(req))); }
  catch (e) { console.error("Erreur annulation :", e); res.status(500).json({ erreur: e.message }); }
});



app.get("/annuaire", authentifier, autoriser("RH", "EMPLOYE"), async (req, res) => {
  try {
    envoyer(res, await annuaire.handler(toEvent(req)));
  } catch (e) {
    console.error("[annuaire]", e);
    res.status(500).json({ erreur: e.message });
  }
});





app.get("/frais/notes", authentifier, async (req, res) => {
  envoyer(res, await notesFrais.lister(toEvent(req)));
});

app.post("/frais/notes", authentifier, uploadJustificatif.single("justificatif"), async (req, res) => {
  envoyer(res, await notesFrais.declarer(toEvent(req), req.file));
});

app.put("/frais/notes/:id", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await notesFrais.traiter(toEvent(req)));
});

app.delete("/frais/notes/:id", authentifier, async (req, res) => {
  envoyer(res, await notesFrais.supprimer(toEvent(req)));
});

app.get("/frais/notes/:id/justificatif", authentifier, async (req, res) => {
  try {
    const r = await docClient.send(new GetCommand({
      TableName: T.TABLE_NOTES_FRAIS, Key: { id: req.params.id },
    }));
    if (!r.Item?.justificatifKey) return ko(res, "Aucun justificatif", 404);

    // Un salarié ne consulte que ses propres justificatifs
    if (req.user.role !== "RH") {
      const fiche = await employesUtil.courant(req.user);
      if (!fiche || fiche.id !== r.Item.employeId) return ko(res, "Accès refusé", 403);
    }

    const doc = await documents.lireDocument(r.Item.justificatifKey);
    if (!doc) return ko(res, "Fichier introuvable", 404);

    const extension = path.extname(r.Item.justificatifKey) || ".pdf";
    const nom = r.Item.justificatifNom || `justificatif${extension}`;

    res.setHeader("Content-Type", doc.type || "application/octet-stream");
    // inline affiche le document dans le navigateur ; attachment le
    // telecharge. Un justificatif se consulte, il ne s'archive pas.
    res.setHeader("Content-Disposition", `inline; filename="${nom}"`);

    if (doc.flux) return doc.flux.pipe(res);
    res.send(doc.contenu);
  } catch (e) {
    console.error("Erreur lecture justificatif:", e);
    ko(res, e.message);
  }
});
// ══════════════════════════════════════════════════════════════════
// CALENDRIER
// ══════════════════════════════════════════════════════════════════
const evenements = require("./src/evenements/gestion");

app.get("/evenements", authentifierOptionnel, async (req, res) => {
  envoyer(res, await evenements.lister(toEvent(req)));
});
app.get("/evenements/mes-inscriptions", authentifier, async (req, res) => {
  envoyer(res, await evenements.mesEvenements(toEvent(req)));
});
app.get("/evenements/:id", authentifierOptionnel, async (req, res) => {
  envoyer(res, await evenements.detail(toEvent(req)));
});
app.post("/evenements/:id/inscription", authentifier, async (req, res) => {
  envoyer(res, await evenements.sInscrire(toEvent(req)));
});
app.delete("/evenements/:id/inscription", authentifier, async (req, res) => {
  envoyer(res, await evenements.seDesinscrire(toEvent(req)));
});

app.post("/evenements", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await evenements.creer(toEvent(req)));
});
app.put("/evenements/:id", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await evenements.modifier(toEvent(req)));
});
app.put("/evenements/:id/annuler", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await evenements.annuler(toEvent(req)));
});
app.delete("/evenements/:id", authentifier, autoriser("RH"), async (req, res) => {
  envoyer(res, await evenements.supprimer(toEvent(req)));
});

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
    const statut = req.query.statut;

    // Sans filtre explicite, la RH doit voir toutes les offres :
    // ne renvoyer que les actives faisait disparaitre les pourvues et
    // les archivees des compteurs.
    let items;

    if (statut) {
      const r = await docClient.send(new QueryCommand({
        TableName: T.TABLE_OFFRES,
        IndexName: "statut-index",
        KeyConditionExpression: "statut = :s",
        ExpressionAttributeValues: { ":s": String(statut).toUpperCase() },
        ScanIndexForward: false,
      }));
      items = r.Items || [];
    } else {
      const r = await docClient.send(new ScanCommand({ TableName: T.TABLE_OFFRES }));
      items = (r.Items || []).sort((a, b) =>
        String(b.creeLe).localeCompare(String(a.creeLe))
      );
    }

    // Les postes pourvus se comptent, ils ne se stockent pas : un
    // compteur decremente se desynchroniserait a la premiere embauche
    // annulee.
    const offres = await Promise.all(items.map(async (offre) => {
      const c = await docClient.send(new QueryCommand({
        TableName: T.TABLE_CANDIDATURES,
        IndexName: "offre-index",
        KeyConditionExpression: "offreId = :o",
        FilterExpression: "statut = :e",
        ExpressionAttributeValues: { ":o": offre.id, ":e": "EMBAUCHE" },
        Select: "COUNT",
      }));

      const cible = offre.nombrePostes ?? 1;
      const pourvus = c.Count ?? 0;

      return {
        ...offre,
        nombrePostes: cible,
        postesPourvus: pourvus,
        postesRestants: Math.max(0, cible - pourvus),
        complet: pourvus >= cible,
      };
    }));

    ok(res, { offres });
  } catch (e) {
    console.error("Erreur liste des offres:", e);
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
      // Normalises explicitement : le client pourrait envoyer la
      // chaine "true" ou une valeur absurde, et nombrePostes sert au
      // calcul du remplissage.
      urgente: req.body.urgente === true || req.body.urgente === "true",
      nombrePostes: Math.max(1, Number(req.body.nombrePostes) || 1),
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
        "description = :desc, competences = :c, #s = :s, " +
        "urgente = :u, nombrePostes = :np, misAJourLe = :maj",

      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeNames: { "#ty": "type", "#s": "statut" },
      ExpressionAttributeValues: {
        ":t": req.body.titre,
        ":d": req.body.departement,
        ":ty": req.body.type,
        ":m": req.body.modeTravail || "",
        ":desc": req.body.description || "",
        ":u": req.body.urgente === true,
        ":np": Math.max(1, Number(req.body.nombrePostes) || 1),
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

// Les erreurs de Multer remontent comme des erreurs serveur si elles
// ne sont pas interceptées : un format refusé mérite un 400 explicite.
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return ko(res, "Le fichier dépasse 5 Mo", 413);
  }
  if (err?.message?.startsWith("Format non supporté")) {
    return ko(res, err.message, 415);
  }
  console.error("Erreur non interceptée:", err);
  ko(res, "Erreur serveur");
});

module.exports = app;