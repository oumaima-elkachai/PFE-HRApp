// src/taches/rappels.js
//
// Tache planifiee : parcourt les echeances a venir et envoie les
// rappels correspondants.
//
// C'est le premier traitement du projet declenche par le temps et non
// par une requete HTTP. EventBridge Scheduler l'invoque chaque matin ;
// aucune ressource ne tourne entre deux executions.
//
// L'idempotence est assuree par un marqueur sur l'entretien ou la
// candidature : une seconde execution le meme jour n'enverra pas de
// second message.

const { ScanCommand, QueryCommand, GetCommand, UpdateCommand, PutCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const courriel = require("../services/courriel");
const { v4: uuidv4 } = require("uuid");

const TABLE_ENTRETIENS = process.env.TABLE_ENTRETIENS || "Entretiens-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";
const URL_APPLICATION = process.env.URL_APPLICATION || "https://d2cc1fkfzt3nok.cloudfront.net";

const JOUR_MS = 86_400_000;

// Un rappel a J-3 laisse le temps de s'organiser, J-1 sert de
// piqure de rappel. Au-dela, le message serait oublie ; en deca,
// il arriverait trop tard.
const JALONS = [3, 1, 0];

function joursRestants(iso) {
  const cible = new Date(iso);
  const aujourdhui = new Date();

  const a = Date.UTC(cible.getFullYear(), cible.getMonth(), cible.getDate());
  const b = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());

  return Math.round((a - b) / JOUR_MS);
}

/** Clef du jour, pour ne pas renvoyer deux fois le meme rappel */
function marqueur(jours) {
  const d = new Date();
  const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${cle}#J${jours}`;
}

async function notifier({ userId, type, titre, message, metadata }) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NOTIFICATIONS,
    Item: {
      id: uuidv4(),
      userId,
      type,
      titre,
      message,
      lu: false,
      creeLe: new Date().toISOString(),
      expireLe: Math.floor(Date.now() / 1000) + 30 * 86400,
      metadata: metadata || {},
    },
  }));
}

// ── Entretiens ─────────────────────────────────────────────────────

async function rappelsEntretiens(bilan) {
  // Les entretiens planifies a venir : l'index par statut evite de
  // parcourir l'historique complet.
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_ENTRETIENS,
    IndexName: "statut-date-index",
    KeyConditionExpression: "#s = :s AND #d >= :maintenant",
    ExpressionAttributeNames: { "#s": "statut", "#d": "dateHeure" },
    ExpressionAttributeValues: {
      ":s": "PLANIFIE",
      ":maintenant": new Date().toISOString(),
    },
  }));

  for (const entretien of res.Items || []) {
    const jours = joursRestants(entretien.dateHeure);
    if (!JALONS.includes(jours)) continue;

    const cle = marqueur(jours);
    if (entretien.dernierRappel === cle) {
      bilan.ignores++;
      continue;
    }

    const prenom = String(entretien.candidatNom || "").split(" ")[0] || "";

    const resultat = await courriel.rappel({
      destinataire: entretien.candidatEmail,
      prenom,
      type: "ENTRETIEN",
      titre: entretien.offreTitre || "votre candidature",
      dateHeure: entretien.dateHeure,
      jours,
      lien: `${URL_APPLICATION}/candidat/agenda`,
    });

    await notifier({
      userId: entretien.candidatEmail,
      type: "RAPPEL_ENTRETIEN",
      titre: jours === 0 ? "Entretien aujourd'hui" : `Entretien dans ${jours} jour${jours > 1 ? "s" : ""}`,
      message: `Votre entretien pour ${entretien.offreTitre} approche.`,
      metadata: { entretienId: entretien.id, jours },
    });

    // Le marqueur est pose meme si le courriel a echoue : la
    // notification dans l'application, elle, est bien creee, et on
    // evite d'insister a chaque execution sur une adresse invalide.
    await docClient.send(new UpdateCommand({
      TableName: TABLE_ENTRETIENS,
      Key: { id: entretien.id },
      UpdateExpression: "SET dernierRappel = :r",
      ExpressionAttributeValues: { ":r": cle },
    }));

    bilan.entretiens++;
    if (resultat.envoye) bilan.courrielsEnvoyes++;
    else bilan.courrielsEchoues++;
  }
}

// ── Echeances de quiz ──────────────────────────────────────────────

async function rappelsQuiz(bilan) {
  // Aucun index ne couvre « quiz a passer » : le volume de
  // candidatures reste borne, un parcours filtre est acceptable ici.
  const res = await docClient.send(new ScanCommand({
    TableName: TABLE_CANDIDATURES,
    FilterExpression: "quizStatus IN (:envoye, :encours) AND attribute_exists(quizExpirationDate)",
    ExpressionAttributeValues: { ":envoye": "ENVOYE", ":encours": "EN_COURS" },
  }));

  for (const candidature of res.Items || []) {
    const jours = joursRestants(candidature.quizExpirationDate);
    if (!JALONS.includes(jours)) continue;

    const cle = marqueur(jours);
    if (candidature.dernierRappelQuiz === cle) {
      bilan.ignores++;
      continue;
    }

    const resultat = await courriel.rappel({
      destinataire: candidature.email,
      prenom: candidature.prenom || "",
      type: "QUIZ",
      titre: candidature.offreTitre || candidature.posteVise || "votre candidature",
      dateHeure: candidature.quizExpirationDate,
      jours,
      lien: `${URL_APPLICATION}/candidat/quiz/${candidature.quizId}`,
    });

    await notifier({
      userId: candidature.email,
      type: "RAPPEL_QUIZ",
      titre: jours === 0 ? "Dernier jour pour votre évaluation" : `Évaluation à passer sous ${jours} jour${jours > 1 ? "s" : ""}`,
      message: `L'évaluation pour ${candidature.offreTitre || candidature.posteVise} expire bientôt.`,
      metadata: { candidatureId: candidature.id, quizId: candidature.quizId, jours },
    });

    await docClient.send(new UpdateCommand({
      TableName: TABLE_CANDIDATURES,
      Key: { id: candidature.id },
      UpdateExpression: "SET dernierRappelQuiz = :r",
      ExpressionAttributeValues: { ":r": cle },
    }));

    bilan.quiz++;
    if (resultat.envoye) bilan.courrielsEnvoyes++;
    else bilan.courrielsEchoues++;
  }
}

async function alertesNouvellesOffres(bilan) {
  const hier = new Date(Date.now() - JOUR_MS).toISOString();

  const res = await docClient.send(new QueryCommand({
    TableName: process.env.TABLE_OFFRES,
    IndexName: "statut-index",
    KeyConditionExpression: "statut = :s AND creeLe >= :h",
    ExpressionAttributeValues: { ":s": "ACTIVE", ":h": hier },
  }));

  for (const offre of res.Items || []) {
    if (offre.alerteEnvoyee) { bilan.ignores++; continue; }

    const destinataires = await recommandations.destinatairesPour(offre);

    for (const d of destinataires) {
      await courriel.nouvelleOffre({ ...d, offre });
      bilan.courrielsEnvoyes++;
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_OFFRES,
      Key: { id: offre.id },
      UpdateExpression: "SET alerteEnvoyee = :v, nbAlertes = :n",
      ExpressionAttributeValues: { ":v": true, ":n": destinataires.length },
    }));

    bilan.alertes += destinataires.length;
  }
}

// ── Point d'entree ─────────────────────────────────────────────────

exports.handler = async () => {
  const debut = Date.now();
  const bilan = {
    entretiens: 0,
    quiz: 0,
    ignores: 0,
    courrielsEnvoyes: 0,
    courrielsEchoues: 0,
    erreurs: [],
  };

  // Les deux sources sont traitees independamment : une panne sur
  // l'une ne doit pas priver l'autre de ses rappels.
  try {
    await rappelsEntretiens(bilan);
  } catch (e) {
    console.error("Rappels d'entretiens:", e);
    bilan.erreurs.push(`entretiens: ${e.message}`);
  }

  try {
    await rappelsQuiz(bilan);
  } catch (e) {
    console.error("Rappels de quiz:", e);
    bilan.erreurs.push(`quiz: ${e.message}`);
  }

  const resume = {
    ...bilan,
    dureeMs: Date.now() - debut,
    courrielActif: courriel.actif,
  };

  console.log("Rappels traités:", JSON.stringify(resume));
  return resume;
};