// backend/routes/entretiens.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/role');
const aiService = require('../services/aiService');
const emailService = require('../services/emailService');
const { calculerScoreTotal } = require('../utils/scoring');
const { dynamodb } = require('../config/aws');

// ========================================
// D. PLANIFIER UN ENTRETIEN
// ========================================

router.post('/entretiens/planifier', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const {
      candidatureId,
      type, // 'phone' | 'video' | 'onsite'
      dateHeure,
      dureeMinutes,
      lieu,
      lienVideo,
      interviewers
    } = req.body;

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

    // Créer l'entretien
    const entretienId = uuidv4();
    const entretien = {
      id: entretienId,
      candidatureId,
      candidatNom: candidature.nom,
      candidatPrenom: candidature.prenom,
      candidatEmail: candidature.email,
      offreTitre: candidature.offreTitre,
      type,
      dateHeure,
      dureeMinutes,
      lieu: type === 'onsite' ? lieu : null,
      lienVideo: type === 'video' ? lienVideo : null,
      interviewers: interviewers || [],
      statut: 'PLANIFIE',
      notes: '',
      creeLe: new Date().toISOString(),
      misAJourLe: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Entretiens',
      Item: entretien
    }).promise();

    // Mettre à jour la candidature
    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: candidatureId },
      UpdateExpression: 'SET statut = :stat, entretienId = :eid, entretienScheduledAt = :date',
      ExpressionAttributeValues: {
        ':stat': 'ENTRETIEN',
        ':eid': entretienId,
        ':date': dateHeure
      }
    }).promise();

    // Envoyer invitation par email
    await emailService.envoyerInvitationEntretien({
      email: candidature.email,
      nom: candidature.nom,
      prenom: candidature.prenom,
      offreTitre: candidature.offreTitre,
      dateHeure,
      type,
      lienVideo,
      lieu
    });

    res.json({
      succes: true,
      entretien
    });

  } catch (err) {
    console.error('❌ Erreur planification entretien:', err);
    res.status(500).json({
      succes: false,
      erreur: err.message
    });
  }
});

// ========================================
// D. ANALYSER UN ENTRETIEN AVEC IA
// ========================================

router.post('/entretiens/:id/analyser', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const { transcript, notes, evaluation } = req.body;

    const entretienResult = await dynamodb.get({
      TableName: 'Entretiens',
      Key: { id: req.params.id }
    }).promise();

    if (!entretienResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Entretien introuvable'
      });
    }

    const entretien = entretienResult.Item;

    console.log('🤖 Analyse IA de l\'entretien...');

    // Analyser avec IA
    const aiAnalysis = await aiService.analyserEntretien({
      transcript,
      notes,
      candidatNom: entretien.candidatNom,
      offreTitre: entretien.offreTitre,
      evaluation
    });

    console.log('✅ Score entretien:', aiAnalysis.scoreGlobal);

    // Mettre à jour l'entretien
    await dynamodb.update({
      TableName: 'Entretiens',
      Key: { id: req.params.id },
      UpdateExpression: `
        SET statut = :stat,
            transcript = :trans,
            notes = :notes,
            evaluation = :eval,
            aiSummary = :ai,
            misAJourLe = :date
      `,
      ExpressionAttributeValues: {
        ':stat': 'TERMINE',
        ':trans': transcript,
        ':notes': notes,
        ':eval': evaluation,
        ':ai': {
          ...aiAnalysis,
          genereLe: new Date().toISOString()
        },
        ':date': new Date().toISOString()
      }
    }).promise();

    // Récupérer la candidature pour mettre à jour le score total
    const candResult = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: entretien.candidatureId }
    }).promise();

    const candidature = candResult.Item;
    const scoreEntretien = aiAnalysis.scoreGlobal;
    const scoreTotal = calculerScoreTotal(
      candidature.scoreCV,
      candidature.scoreQuiz,
      scoreEntretien,
      { poidsCV: 0.4, poidsQuiz: 0.3, poidsEntretien: 0.3 }
    );

    // Mettre à jour la candidature
    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: entretien.candidatureId },
      UpdateExpression: `
        SET scoreEntretien = :se,
            scoreTotal = :st,
            entretienCompletedAt = :date,
            scoringDetails.entretienAnalysis = :ea,
            misAJourLe = :updated
      `,
      ExpressionAttributeValues: {
        ':se': scoreEntretien,
        ':st': scoreTotal,
        ':date': new Date().toISOString(),
        ':ea': {
          ...aiAnalysis,
          analyseLe: new Date().toISOString()
        },
        ':updated': new Date().toISOString()
      }
    }).promise();

    res.json({
      succes: true,
      analysis: aiAnalysis,
      scoreTotal
    });

  } catch (err) {
    console.error('❌ Erreur analyse entretien:', err);
    res.status(500).json({
      succes: false,
      erreur: err.message
    });
  }
});

// ========================================
// LISTER LES ENTRETIENS
// ========================================

router.get('/entretiens', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const { statut, dateDebut, dateFin } = req.query;

    const params = {
      TableName: 'Entretiens'
    };

    const result = await dynamodb.scan(params).promise();
    let entretiens = result.Items || [];

    // Filtres
    if (statut) {
      entretiens = entretiens.filter(e => e.statut === statut);
    }

    if (dateDebut && dateFin) {
      entretiens = entretiens.filter(e => {
        const date = new Date(e.dateHeure);
        return date >= new Date(dateDebut) && date <= new Date(dateFin);
      });
    }

    // Trier par date
    entretiens.sort((a, b) => new Date(a.dateHeure).getTime() - new Date(b.dateHeure).getTime());

    res.json({
      succes: true,
      entretiens
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

module.exports = router;