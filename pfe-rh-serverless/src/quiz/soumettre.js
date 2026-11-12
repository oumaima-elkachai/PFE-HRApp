// src/quiz/soumettre.js
// POST /quiz/sessions/:sessionId/soumettre
//
// Corrige les réponses côté serveur et met à jour la candidature.
//
// Les QCM se corrigent par comparaison. Les questions ouvertes sont
// évaluées par Bedrock selon les critères définis à la génération :
// aucun algorithme simple ne sait juger une réponse rédigée.

const { GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite } = require("../utils/contexte");
const { evaluerReponsesOuvertes } = require("../services/bedrockService");
const { v4: uuidv4 } = require("uuid");

const TABLE_QUIZ = process.env.TABLE_QUIZ || "Quiz-local";
const TABLE_SESSIONS = process.env.TABLE_QUIZ_SESSIONS || "QuizSessions-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";

// Pondération du score global. Le CV pèse davantage : il reflète le
// parcours réel, quand le quiz mesure un instant.
const PONDERATION = { cv: 0.6, quiz: 0.4 };

// Tolérance de quelques secondes sur l'échéance, pour absorber la
// latence réseau au moment de la soumission.
const TOLERANCE_MS = 30_000;

/** Comparaison souple : casse et espaces superflus ignorés */
const normaliser = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function corrigerQcm(question, reponse) {
  const attendu = normaliser(question.reponseCorrecte);
  const donne = normaliser(reponse);
  const correct = attendu.length > 0 && attendu === donne;

  return {
    correct,
    pointsObtenus: correct ? (question.points || 10) : 0,
    commentaire: correct ? null : question.explication || null,
  };
}

exports.handler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const sessionId = event.pathParameters?.sessionId;
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const { reponses = [], nombreChangementsOnglet = 0, nombreCopierColler = 0 } = body;

    if (!sessionId) return erreur("sessionId requis", 400);
    if (!Array.isArray(reponses)) return erreur("reponses doit être un tableau", 400);

    // 1. Session
    const sessionRes = await docClient.send(new GetCommand({
      TableName: TABLE_SESSIONS, Key: { id: sessionId },
    }));
    if (!sessionRes.Item) return erreur("Session introuvable", 404);

    const session = sessionRes.Item;
    if (session.candidatEmail !== moi.email) return erreur("Accès refusé", 403);
    if (session.statut === "TERMINE") return erreur("Ce quiz a déjà été soumis", 409);

    const maintenant = new Date();
    const horsDelai = new Date(session.expireLe).getTime() + TOLERANCE_MS < maintenant.getTime();

    // 2. Quiz et corrigé
    const quizRes = await docClient.send(new GetCommand({
      TableName: TABLE_QUIZ, Key: { id: session.quizId },
    }));
    if (!quizRes.Item) return erreur("Quiz introuvable", 404);

    const quiz = quizRes.Item;
    const questions = quiz.questions || [];
    const parId = new Map(reponses.map((r) => [r.questionId, r.reponse]));

    // 3. Correction des QCM, immédiate et déterministe
    const resultats = [];
    const ouvertes = [];

    for (const question of questions) {
      const reponse = parId.get(question.id);
      const points = question.points || 10;

      if (!reponse || normaliser(reponse).length === 0) {
        resultats.push({
          questionId: question.id,
          type: question.type,
          competenceEvaluee: question.competenceEvaluee || null,
          reponse: null,
          pointsMax: points,
          pointsObtenus: 0,
          correct: false,
          commentaire: "Sans réponse",
        });
        continue;
      }

      if (question.type === "QCM") {
        const { correct, pointsObtenus, commentaire } = corrigerQcm(question, reponse);
        resultats.push({
          questionId: question.id,
          type: "QCM",
          competenceEvaluee: question.competenceEvaluee || null,
          reponse,
          pointsMax: points,
          pointsObtenus,
          correct,
          commentaire,
        });
      } else {
        // Évaluée par le modèle, en un seul appel groupé plus bas
        ouvertes.push({ question, reponse });
      }
    }

    // 4. Évaluation des questions ouvertes
    let sourceEvaluation = "aucune";

    if (ouvertes.length > 0) {
      const evaluation = await evaluerReponsesOuvertes({
        offreTitre: quiz.offreTitre || "",
        elements: ouvertes.map(({ question, reponse }) => ({
          questionId: question.id,
          question: question.question,
          criteres: question.criteresEvaluation || [],
          points: question.points || 20,
          reponse,
        })),
      });

      sourceEvaluation = evaluation.source;

      for (const { question, reponse } of ouvertes) {
        const note = evaluation.notes[question.id];
        const points = question.points || 20;
        // Le modèle renvoie un pourcentage de satisfaction des critères
        const pourcentage = Math.max(0, Math.min(100, note?.score ?? 0));
        const pointsObtenus = Math.round((points * pourcentage) / 100);

        resultats.push({
          questionId: question.id,
          type: "TEXTE",
          competenceEvaluee: question.competenceEvaluee || null,
          reponse,
          pointsMax: points,
          pointsObtenus,
          correct: pourcentage >= 60,
          pourcentage,
          commentaire: note?.commentaire || null,
          criteresSatisfaits: note?.criteresSatisfaits || [],
        });
      }
    }

    // 5. Score global
    const pointsMax = resultats.reduce((s, r) => s + r.pointsMax, 0);
    const pointsObtenus = resultats.reduce((s, r) => s + r.pointsObtenus, 0);
    const scoreObtenu = pointsMax > 0 ? Math.round((pointsObtenus / pointsMax) * 100) : 0;
    const seuil = quiz.seuilPassage || 70;

    // Synthèse par compétence : bien plus parlant pour la RH qu'un
    // score global, et cela justifie la décision.
    const parCompetence = {};
    for (const r of resultats) {
      const cle = r.competenceEvaluee || "Général";
      parCompetence[cle] ??= { pointsMax: 0, pointsObtenus: 0 };
      parCompetence[cle].pointsMax += r.pointsMax;
      parCompetence[cle].pointsObtenus += r.pointsObtenus;
    }
    const competences = Object.entries(parCompetence).map(([nom, v]) => ({
      nom,
      score: v.pointsMax > 0 ? Math.round((v.pointsObtenus / v.pointsMax) * 100) : 0,
    }));

    // 6. Indicateurs d'intégrité. Ils ne pénalisent aucun score :
    // ils signalent à la RH un passage à vérifier, sans automatiser
    // une accusation de fraude.
    const changementsOnglet = Math.max(session.nombreChangementsOnglet || 0, nombreChangementsOnglet);
    const copierColler = Math.max(session.nombreCopierColler || 0, nombreCopierColler);

    const alertes = [];
    if (changementsOnglet >= 5) alertes.push(`${changementsOnglet} sorties de la page`);
    if (copierColler >= 3) alertes.push(`${copierColler} copier-coller détectés`);
    if (horsDelai) alertes.push("Soumission hors délai");

    const dureeReelleMinutes = Math.round(
      (maintenant.getTime() - new Date(session.debutLe).getTime()) / 60000
    );
    if (dureeReelleMinutes < 2 && questions.length >= 5) {
      alertes.push(`Quiz complété en ${dureeReelleMinutes} minute(s)`);
    }

    // 7. Enregistrement
    const sessionTerminee = {
      ...session,
      statut: horsDelai ? "EXPIRE" : "TERMINE",
      finLe: maintenant.toISOString(),
      dureeReelleMinutes,
      reponses: resultats,
      pointsMax,
      pointsObtenus,
      scoreObtenu,
      reussi: scoreObtenu >= seuil,
      competences,
      sourceEvaluation,
      nombreChangementsOnglet: changementsOnglet,
      nombreCopierColler: copierColler,
      alertesIntegrite: alertes,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_SESSIONS, Item: sessionTerminee,
    }));

    // 8. Mise à jour de la candidature
    const candRes = await docClient.send(new GetCommand({
      TableName: TABLE_CANDIDATURES, Key: { id: session.candidatureId },
    }));
    const candidature = candRes.Item;

    if (candidature) {
      const scoreCV = typeof candidature.scoreCV === "number" ? candidature.scoreCV : 0;
      const scoreTotal = Math.round(scoreCV * PONDERATION.cv + scoreObtenu * PONDERATION.quiz);

      const historique = [...(candidature.historiqueStatuts || []), {
        statut: "QUIZ_TERMINE",
        ancienStatut: candidature.statut,
        date: maintenant.toISOString(),
        commentaire: `Quiz : ${scoreObtenu}/100 (seuil ${seuil}) — score global ${scoreTotal}`,
        action: "quiz_soumis",
      }];

      await docClient.send(new UpdateCommand({
        TableName: TABLE_CANDIDATURES,
        Key: { id: candidature.id },
        UpdateExpression:
          "SET scoreQuiz = :sq, scoreTotal = :st, quizStatus = :qs, " +
          "#s = :statut, historiqueStatuts = :h, misAJourLe = :d",
        ExpressionAttributeNames: { "#s": "statut" },
        ExpressionAttributeValues: {
          ":sq": scoreObtenu,
          ":st": scoreTotal,
          ":qs": "TERMINE",
          ":statut": "QUIZ_TERMINE",
          ":h": historique,
          ":d": maintenant.toISOString(),
        },
      }));
    }

    // 9. Notification à la RH. Un échec ici ne doit pas annuler la
    // soumission, qui est déjà enregistrée.
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NOTIFICATIONS,
        Item: {
          id: uuidv4(),
          userId: "RH",
          type: "QUIZ_TERMINE",
          titre: "Quiz complété",
          message:
            `${session.candidatNom} a obtenu ${scoreObtenu}/100 sur « ${quiz.titre} »` +
            (alertes.length ? ` — ${alertes.length} signalement(s) d'intégrité` : ""),
          lu: false,
          creeLe: maintenant.toISOString(),
          expireLe: Math.floor(Date.now() / 1000) + 90 * 86400,
          metadata: { sessionId, candidatureId: session.candidatureId, scoreObtenu },
        },
      }));
    } catch (e) {
      console.error("Notification non envoyée:", e.message);
    }

    // 10. Retour au candidat — sans les réponses correctes ni les
    // commentaires détaillés, qui restent réservés à la RH.
    return succes({
      resultat: {
        scoreObtenu,
        seuilPassage: seuil,
        reussi: scoreObtenu >= seuil,
        questionsRepondues: resultats.filter((r) => r.reponse !== null).length,
        nombreQuestions: questions.length,
        dureeReelleMinutes,
        horsDelai,
        competences,
      },
      message: scoreObtenu >= seuil
        ? "Quiz réussi. Votre candidature poursuit son parcours."
        : "Quiz terminé. Vos réponses ont été transmises au recruteur.",
    });

  } catch (e) {
    console.error("Erreur soumission quiz:", e);
    return erreur("Impossible d'enregistrer vos réponses : " + e.message);
  }
};