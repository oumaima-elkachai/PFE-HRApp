// backend/routes/quiz.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/role');
const quizService = require('../services/quizService');
const aiService = require('../services/aiService');
const { calculerScoreTotal } = require('../utils/scoring');
const { dynamodb } = require('../config/aws');

// ========================================
// B. GÉNÉRATION DE QUIZ AUTOMATIQUE
// ========================================

router.post('/quiz/generer', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const { offreId } = req.body;

    // Récupérer l'offre
    const offreResult = await dynamodb.get({
      TableName: 'Offres',
      Key: { id: offreId }
    }).promise();

    if (!offreResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Offre introuvable'
      });
    }

    const offre = offreResult.Item;

    console.log('🤖 Génération du quiz par IA...');
    const quizGenere = await aiService.genererQuiz(offre);

    const quizId = uuidv4();
    const quiz = {
      id: quizId,
      offreId,
      offreTitre: offre.titre,
      titre: `Quiz - ${offre.titre}`,
      description: `Évaluation technique pour le poste de ${offre.titre}`,
      dureeMinutes: 30,
      seuilPassage: 70,
      questions: quizGenere.questions.map((q, index) => ({
        ...q,
        id: uuidv4(),
        ordre: index + 1
      })),
      statut: 'ACTIF',
      creeLe: new Date().toISOString(),
      misAJourLe: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Quiz',
      Item: quiz
    }).promise();

    console.log('✅ Quiz créé:', quizId);

    res.json({
      succes: true,
      quiz
    });

  } catch (err) {
    console.error('❌ Erreur génération quiz:', err);
    res.status(500).json({
      succes: false,
      erreur: err.message
    });
  }
});

// ========================================
// 📤 ENVOYER QUIZ À UN CANDIDAT
// ========================================

router.post('/candidatures/:id/envoyer-quiz', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const candidatureId = req.params.id;

    // Récupérer la candidature
    const candResult = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: candidatureId }
    }).promise();

    if (!candResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Candidature introuvable'
      });
    }

    const candidature = candResult.Item;

    if (!candidature.offreId) {
      return res.status(400).json({
        succes: false,
        erreur: 'Pas de quiz pour les candidatures spontanées'
      });
    }

    // Envoyer le quiz
    await quizService.envoyerQuiz(
      candidatureId,
      candidature.offreId,
      candidature.email
    );

    // Mettre à jour la candidature
    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: candidatureId },
      UpdateExpression: 'SET quizStatus = :status, statut = :stat, quizEnvoyeLe = :date',
      ExpressionAttributeValues: {
        ':status': 'ENVOYE',
        ':stat': 'QUIZ_ENVOYE',
        ':date': new Date().toISOString()
      }
    }).promise();

    res.json({ succes: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// C. DÉMARRER UNE SESSION DE QUIZ
// ========================================

router.post('/quiz/:quizId/demarrer', verifyToken, async (req, res) => {
  try {
    const { candidatureId } = req.body;

    // Vérifier que le candidat est autorisé
    const candResult = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: candidatureId }
    }).promise();

    if (!candResult.Item || candResult.Item.email !== req.user.email) {
      return res.status(403).json({
        succes: false,
        erreur: 'Non autorisé'
      });
    }

    // Récupérer le quiz
    const quizResult = await dynamodb.get({
      TableName: 'Quiz',
      Key: { id: req.params.quizId }
    }).promise();

    if (!quizResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Quiz introuvable'
      });
    }

    const quiz = quizResult.Item;

    // Créer la session
    const sessionId = uuidv4();
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + quiz.dureeMinutes);

    const session = {
      id: sessionId,
      quizId: req.params.quizId,
      candidatureId,
      candidatEmail: req.user.email,
      statut: 'EN_COURS',
      debutLe: new Date().toISOString(),
      expirationDate: expirationDate.toISOString(),
      questionActuelle: 1,
      reponses: [],
      nombreChangementsOnglet: 0,
      nombreCopierColler: 0,
      tempsInactifSecondes: 0,
      creeLe: new Date().toISOString(),
      misAJourLe: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'QuizSessions',
      Item: session
    }).promise();

    // Mettre à jour la candidature
    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: candidatureId },
      UpdateExpression: 'SET quizStatus = :status, statut = :stat',
      ExpressionAttributeValues: {
        ':status': 'EN_COURS',
        ':stat': 'QUIZ_EN_COURS'
      }
    }).promise();

    // Retourner le quiz sans les réponses correctes
    const quizSansReponses = {
      ...quiz,
      questions: quiz.questions.map(q => ({
        id: q.id,
        type: q.type,
        question: q.question,
        description: q.description,
        options: q.options,
        points: q.points,
        ordre: q.ordre,
        languageProgrammation: q.languageProgrammation,
        codeTemplate: q.codeTemplate
        // ❌ Pas de reponseCorrecte
      }))
    };

    res.json({
      succes: true,
      session: {
        id: sessionId,
        expirationDate: expirationDate.toISOString()
      },
      quiz: quizSansReponses
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// C. SOUMETTRE UNE RÉPONSE
// ========================================

router.post('/quiz-sessions/:sessionId/repondre', verifyToken, async (req, res) => {
  try {
    const { questionId, reponse, tempsReponseSecondes } = req.body;

    const sessionResult = await dynamodb.get({
      TableName: 'QuizSessions',
      Key: { id: req.params.sessionId }
    }).promise();

    if (!sessionResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Session introuvable'
      });
    }

    const session = sessionResult.Item;

    // Vérifier expiration
    if (new Date() > new Date(session.expirationDate)) {
      await dynamodb.update({
        TableName: 'QuizSessions',
        Key: { id: req.params.sessionId },
        UpdateExpression: 'SET statut = :stat',
        ExpressionAttributeValues: { ':stat': 'EXPIRE' }
      }).promise();

      return res.status(400).json({
        succes: false,
        erreur: 'Le quiz a expiré'
      });
    }

    // Ajouter la réponse
    const reponses = session.reponses || [];
    reponses.push({
      questionId,
      reponse,
      tempsReponseSecondes
    });

    await dynamodb.update({
      TableName: 'QuizSessions',
      Key: { id: req.params.sessionId },
      UpdateExpression: 'SET reponses = :rep, questionActuelle = questionActuelle + :inc, misAJourLe = :date',
      ExpressionAttributeValues: {
        ':rep': reponses,
        ':inc': 1,
        ':date': new Date().toISOString()
      }
    }).promise();

    res.json({ succes: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// C. SOUMETTRE LE QUIZ COMPLET
// ========================================

router.post('/quiz-sessions/:sessionId/soumettre', verifyToken, async (req, res) => {
  try {
    const sessionResult = await dynamodb.get({
      TableName: 'QuizSessions',
      Key: { id: req.params.sessionId }
    }).promise();

    if (!sessionResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Session introuvable'
      });
    }

    const session = sessionResult.Item;

    // Récupérer le quiz
    const quizResult = await dynamodb.get({
      TableName: 'Quiz',
      Key: { id: session.quizId }
    }).promise();

    const quiz = quizResult.Item;

    console.log('📊 Correction du quiz...');

    // Corriger les réponses
    const reponsesCorrigees = await quizService.corrigerQuiz(
      quiz.questions,
      session.reponses
    );

    // Calculer le score
    const pointsObtenus = reponsesCorrigees.reduce((sum, r) => sum + r.pointsObtenus, 0);
    const pointsTotal = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    const scoreQuiz = Math.round((pointsObtenus / pointsTotal) * 100);
    const resultat = scoreQuiz >= quiz.seuilPassage ? 'REUSSI' : 'ECHOUE';

    console.log(`✅ Score: ${scoreQuiz}/100 (${resultat})`);

    // Mettre à jour la session
    await dynamodb.update({
      TableName: 'QuizSessions',
      Key: { id: req.params.sessionId },
      UpdateExpression: 'SET statut = :stat, finLe = :fin, scoreObtenu = :score, resultat = :res, reponses = :rep',
      ExpressionAttributeValues: {
        ':stat': 'TERMINE',
        ':fin': new Date().toISOString(),
        ':score': scoreQuiz,
        ':res': resultat,
        ':rep': reponsesCorrigees
      }
    }).promise();

    // Récupérer la candidature pour calculer le score total
    const candResult = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: session.candidatureId }
    }).promise();

    const candidature = candResult.Item;
    const scoreTotal = calculerScoreTotal(
      candidature.scoreCV,
      scoreQuiz,
      null,
      { poidsCV: 0.4, poidsQuiz: 0.6, poidsEntretien: 0 }
    );

    const nouveauStatut = resultat === 'REUSSI' ? 'PRESELECTION' : 'REFUSE';

    // Mettre à jour la candidature
    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: session.candidatureId },
      UpdateExpression: `
        SET scoreQuiz = :sq,
            scoreTotal = :st,
            statut = :stat,
            quizStatus = :qstat,
            quizCompleteLe = :date,
            scoringDetails.quizAnalysis = :qa,
            misAJourLe = :updated
      `,
      ExpressionAttributeValues: {
        ':sq': scoreQuiz,
        ':st': scoreTotal,
        ':stat': nouveauStatut,
        ':qstat': 'TERMINE',
        ':date': new Date().toISOString(),
        ':qa': {
          score: scoreQuiz,
          bonnesReponses: reponsesCorrigees.filter(r => r.estCorrecte).length,
          totalQuestions: quiz.questions.length,
          tempsEcouleSecondes: session.reponses.reduce((sum, r) => sum + (r.tempsReponseSecondes || 0), 0),
          reponses: reponsesCorrigees,
          completeLe: new Date().toISOString()
        },
        ':updated': new Date().toISOString()
      }
    }).promise();

    res.json({
      succes: true,
      resultat: {
        score: scoreQuiz,
        scoreTotal,
        resultat,
        bonnesReponses: reponsesCorrigees.filter(r => r.estCorrecte).length,
        totalQuestions: quiz.questions.length,
        statut: nouveauStatut
      }
    });

  } catch (err) {
    console.error('❌ Erreur soumission quiz:', err);
    res.status(500).json({
      succes: false,
      erreur: err.message
    });
  }
});

module.exports = router;