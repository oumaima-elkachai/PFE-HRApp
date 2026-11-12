// src/quiz/demarrer.js
// POST /quiz/:quizId/demarrer
//
// Ouvre une session de passage. Les réponses correctes ne quittent
// jamais le serveur : elles sont retirées avant l'envoi au candidat.

const { GetCommand, PutCommand, QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite } = require("../utils/contexte");
const { v4: uuidv4 } = require("uuid");

const TABLE_QUIZ = process.env.TABLE_QUIZ || "Quiz-local";
const TABLE_SESSIONS = process.env.TABLE_QUIZ_SESSIONS || "QuizSessions-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";

/** Retire tout ce qui permettrait de deviner la réponse */
function questionPourCandidat(q) {
  const { reponseCorrecte, explication, criteresEvaluation, ...visible } = q;
  return visible;
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const quizId = event.pathParameters?.quizId;
    if (!quizId) return erreur("quizId requis", 400);

    // 1. Le quiz existe-t-il et est-il actif ?
    const quizRes = await docClient.send(new GetCommand({
      TableName: TABLE_QUIZ, Key: { id: quizId },
    }));
    if (!quizRes.Item) return erreur("Quiz introuvable", 404);

    const quiz = quizRes.Item;
    if (quiz.statut !== "ACTIF") return erreur("Ce quiz n'est plus disponible", 410);

    // 2. Le candidat a-t-il une candidature rattachée à ce quiz ?
    // Le contrôle porte sur la candidature, pas sur le quiz : sans lui,
    // n'importe quel candidat pourrait passer n'importe quel quiz en
    // devinant son identifiant.
    const candRes = await docClient.send(new QueryCommand({
      TableName: TABLE_CANDIDATURES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      FilterExpression: "quizId = :q",
      ExpressionAttributeValues: { ":e": moi.email, ":q": quizId },
    }));

    const candidature = (candRes.Items || [])[0];
    if (!candidature) return erreur("Vous n'avez pas accès à ce quiz", 403);

    if (candidature.quizStatus === "TERMINE") {
      return erreur("Vous avez déjà passé ce quiz", 409);
    }

    // Échéance d'envoi dépassée
    if (candidature.quizExpirationDate && candidature.quizExpirationDate < new Date().toISOString()) {
      return erreur("Le délai pour passer ce quiz est dépassé", 410);
    }

    const maintenant = new Date();

    // 3. Session déjà ouverte ? On la reprend plutôt que d'en créer
    // une seconde : un rafraîchissement de page ne doit pas offrir un
    // nouveau minuteur.
    const sessionsRes = await docClient.send(new QueryCommand({
      TableName: TABLE_SESSIONS,
      IndexName: "candidature-index",
      KeyConditionExpression: "candidatureId = :c",
      FilterExpression: "quizId = :q AND statut = :s",
      ExpressionAttributeValues: {
        ":c": candidature.id, ":q": quizId, ":s": "EN_COURS",
      },
      ScanIndexForward: false,
      Limit: 1,
    }));

    const existante = (sessionsRes.Items || [])[0];

    if (existante) {
      const expiree = existante.expireLe < maintenant.toISOString();
      if (expiree) {
        return erreur("Le temps imparti est écoulé. Soumettez vos réponses.", 410);
      }

      return succes({
        session: {
          id: existante.id,
          debutLe: existante.debutLe,
          expireLe: existante.expireLe,
          reprise: true,
        },
        quiz: {
          id: quiz.id,
          titre: quiz.titre,
          offreTitre: quiz.offreTitre,
          dureeMinutes: quiz.dureeMinutes,
          seuilPassage: quiz.seuilPassage,
          questions: (quiz.questions || []).map(questionPourCandidat),
        },
        message: "Session reprise",
      });
    }

    // 4. Nouvelle session
    const dureeMinutes = quiz.dureeMinutes || 30;
    const expireLe = new Date(maintenant.getTime() + dureeMinutes * 60000);

    const session = {
      id: uuidv4(),
      quizId,
      candidatureId: candidature.id,
      candidatEmail: moi.email,
      candidatNom: `${candidature.prenom} ${candidature.nom}`,
      offreTitre: quiz.offreTitre || candidature.offreTitre,
      statut: "EN_COURS",
      debutLe: maintenant.toISOString(),
      expireLe: expireLe.toISOString(),
      dureeMinutes,
      nombreQuestions: (quiz.questions || []).length,
      reponses: [],
      // Indicateurs d'intégrité, alimentés pendant le passage
      nombreChangementsOnglet: 0,
      nombreCopierColler: 0,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_SESSIONS, Item: session }));

    await docClient.send(new UpdateCommand({
      TableName: TABLE_CANDIDATURES,
      Key: { id: candidature.id },
      UpdateExpression: "SET quizStatus = :s, quizSessionId = :sid, misAJourLe = :d",
      ExpressionAttributeValues: {
        ":s": "EN_COURS", ":sid": session.id, ":d": maintenant.toISOString(),
      },
    }));

    return succes({
      session: {
        id: session.id,
        debutLe: session.debutLe,
        expireLe: session.expireLe,
        reprise: false,
      },
      quiz: {
        id: quiz.id,
        titre: quiz.titre,
        offreTitre: quiz.offreTitre,
        dureeMinutes,
        seuilPassage: quiz.seuilPassage || 70,
        questions: (quiz.questions || []).map(questionPourCandidat),
      },
    }, 201);

  } catch (e) {
    console.error("Erreur démarrage quiz:", e);
    return erreur("Impossible de démarrer le quiz");
  }
};