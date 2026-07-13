// backend/routes/candidatures.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/role');
const { uploadCV } = require('../middleware/upload');
const aiService = require('../services/aiService');
const quizService = require('../services/quizService');
const s3Service = require('../services/s3Service');
const emailService = require('../services/emailService');
const { calculerScoreTotal } = require('../utils/scoring');
const { dynamodb } = require('../config/aws');

// ========================================
// 📤 A. UPLOAD CV + ANALYSE IA
// ========================================

router.post('/candidatures', uploadCV.single('cv'), async (req, res) => {
  try {
    const {
      offreId,
      nom,
      prenom,
      email,
      telephone,
      lettreMotivation,
      niveauEtude,
      experience,
      competences, // JSON string
      linkedin,
      portfolio
    } = req.body;

    // 1. Validation
    if (!nom || !prenom || !email || !lettreMotivation) {
      return res.status(400).json({
        succes: false,
        erreur: 'Champs obligatoires manquants'
      });
    }

    // 2. Upload CV vers S3
    let cvUrl = null;
    let cvFileName = null;
    
    if (req.file) {
      const uploadResult = await s3Service.uploadFile(req.file, 'cvs');
      cvUrl = uploadResult.url;
      cvFileName = uploadResult.filename;
    }

    // 3. Récupérer l'offre (si pas spontanée)
    let offre = null;
    let type = 'SPONTANEE';
    let posteVise = 'Candidature spontanée';

    if (offreId) {
      const offreResult = await dynamodb.get({
        TableName: 'Offres',
        Key: { id: offreId }
      }).promise();

      if (offreResult.Item) {
        offre = offreResult.Item;
        posteVise = offre.titre;
        type = 'OFFRE';
      }
    }

    // 4. Analyser CV + Lettre avec IA
    console.log('📊 Analyse IA en cours...');
    const cvAnalysis = await aiService.analyserCandidature({
      lettreMotivation,
      competences: competences ? JSON.parse(competences) : [],
      niveauEtude,
      experience,
      offre
    });

    console.log('✅ Score CV:', cvAnalysis.score);

    // 5. Créer la candidature
    const candidatureId = uuidv4();
    const candidature = {
      id: candidatureId,
      offreId: offreId || null,
      offreTitre: posteVise,
      candidatId: null, // peut être lié plus tard
      type,
      
      // Infos personnelles
      nom,
      prenom,
      email,
      telephone,
      
      // Documents
      cvUrl,
      cvFileName,
      lettreMotivation,
      linkedin,
      portfolio,
      
      // Profil
      competences: competences ? JSON.parse(competences) : [],
      niveauEtude,
      experience,
      posteVise,
      
      // Scores
      scoreCV: cvAnalysis.score,
      scoreQuiz: null,
      scoreEntretien: null,
      scoreTotal: cvAnalysis.score,
      
      // Scoring details
      scoringDetails: {
        cvAnalysis: {
          ...cvAnalysis,
          analyseLe: new Date().toISOString()
        }
      },
      
      // Quiz
      quizId: null,
      quizStatus: 'NON_ENVOYE',
      
      // Statut
      statut: cvAnalysis.score >= 60 ? 'PRESELECTION' : 'REFUSE',
      etape: cvAnalysis.score >= 60 ? 'Screened' : 'Rejected',
      
      // Historique
      historiqueStatuts: [{
        statut: 'SOUMIS',
        date: new Date().toISOString(),
        commentaire: `Candidature ${type === 'OFFRE' ? `pour ${posteVise}` : 'spontanée'} - Score CV: ${cvAnalysis.score}/100`,
        action: 'candidature_soumise'
      }],
      
      // Meta
      source: 'site_carriere',
      creeLe: new Date().toISOString(),
      misAJourLe: new Date().toISOString()
    };

    // 6. Sauvegarder dans DynamoDB
    await dynamodb.put({
      TableName: 'Candidatures',
      Item: candidature
    }).promise();

    // 7. Si score suffisant → envoyer quiz
    if (cvAnalysis.score >= 60 && offreId) {
      console.log('📝 Envoi du quiz...');
      await quizService.envoyerQuiz(candidatureId, offreId, email);
      
      // Mettre à jour le statut
      await dynamodb.update({
        TableName: 'Candidatures',
        Key: { id: candidatureId },
        UpdateExpression: 'SET quizStatus = :status, statut = :stat',
        ExpressionAttributeValues: {
          ':status': 'ENVOYE',
          ':stat': 'QUIZ_ENVOYE'
        }
      }).promise();
    }

    // 8. Email de confirmation au candidat
    await emailService.envoyerConfirmationCandidature({
      email,
      nom,
      prenom,
      posteVise,
      scoreCV: cvAnalysis.score
    });

    // 9. Incrémenter le compteur de candidatures de l'offre
    if (offreId) {
      await dynamodb.update({
        TableName: 'Offres',
        Key: { id: offreId },
        UpdateExpression: 'SET nombreCandidatures = if_not_exists(nombreCandidatures, :zero) + :inc',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': 1
        }
      }).promise();
    }

    res.status(201).json({
      succes: true,
      candidature: {
        id: candidatureId,
        scoreCV: cvAnalysis.score,
        statut: candidature.statut,
        quizEnvoye: cvAnalysis.score >= 60
      }
    });

  } catch (err) {
    console.error('❌ Erreur création candidature:', err);
    res.status(500).json({
      succes: false,
      erreur: err.message || 'Erreur lors de la soumission'
    });
  }
});

// ========================================
// 📋 LISTER LES CANDIDATURES (RH)
// ========================================

router.get('/candidatures', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const { offreId, statut, minScore } = req.query;

    let params = {
      TableName: 'Candidatures'
    };

    // Filtres
    if (offreId) {
      params.FilterExpression = 'offreId = :offreId';
      params.ExpressionAttributeValues = { ':offreId': offreId };
    }

    const result = await dynamodb.scan(params).promise();
    let candidatures = result.Items || [];

    // Filtres additionnels
    if (statut) {
      candidatures = candidatures.filter(c => c.statut === statut);
    }
    if (minScore) {
      candidatures = candidatures.filter(c => c.scoreTotal >= parseInt(minScore));
    }

    // Trier par score décroissant
    candidatures.sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0));

    res.json({
      succes: true,
      candidatures,
      total: candidatures.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// 👤 MES CANDIDATURES (CANDIDAT)
// ========================================

router.get('/mes-candidatures', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'CANDIDAT') {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès réservé aux candidats'
      });
    }

    const params = {
      TableName: 'Candidatures',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': req.user.email
      }
    };

    const result = await dynamodb.scan(params).promise();
    const candidatures = result.Items || [];

    // Enrichir avec les détails de l'offre
    const enriched = await Promise.all(candidatures.map(async (cand) => {
      if (cand.offreId) {
        const offreResult = await dynamodb.get({
          TableName: 'Offres',
          Key: { id: cand.offreId }
        }).promise();
        
        return {
          ...cand,
          offre: offreResult.Item || null
        };
      }
      return cand;
    }));

    res.json({
      succes: true,
      candidatures: enriched
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// 🔍 DÉTAIL D'UNE CANDIDATURE
// ========================================

router.get('/candidatures/:id', verifyToken, async (req, res) => {
  try {
    const result = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: req.params.id }
    }).promise();

    if (!result.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Candidature introuvable'
      });
    }

    // Vérifier les permissions
    const candidature = result.Item;
    const isOwner = req.user.email === candidature.email;
    const isRH = req.user.role === 'RH';

    if (!isOwner && !isRH) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé'
      });
    }

    res.json({
      succes: true,
      candidature
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

// ========================================
// 🔄 CHANGER STATUT (RH)
// ========================================

router.put('/candidatures/:id/statut', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const { statut, commentaire } = req.body;

    const getResult = await dynamodb.get({
      TableName: 'Candidatures',
      Key: { id: req.params.id }
    }).promise();

    if (!getResult.Item) {
      return res.status(404).json({
        succes: false,
        erreur: 'Candidature introuvable'
      });
    }

    const candidature = getResult.Item;
    const historiqueStatuts = candidature.historiqueStatuts || [];

    historiqueStatuts.push({
      statut,
      ancienStatut: candidature.statut,
      date: new Date().toISOString(),
      commentaire: commentaire || '',
      modifiePar: req.user.email,
      action: 'statut_change'
    });

    await dynamodb.update({
      TableName: 'Candidatures',
      Key: { id: req.params.id },
      UpdateExpression: 'SET statut = :statut, historiqueStatuts = :hist, misAJourLe = :date',
      ExpressionAttributeValues: {
        ':statut': statut,
        ':hist': historiqueStatuts,
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
// 📊 RANKING DES CANDIDATS
// ========================================

router.get('/candidatures/ranking/:offreId', verifyToken, checkRole('RH'), async (req, res) => {
  try {
    const params = {
      TableName: 'Candidatures',
      FilterExpression: 'offreId = :offreId',
      ExpressionAttributeValues: {
        ':offreId': req.params.offreId
      }
    };

    const result = await dynamodb.scan(params).promise();
    let candidatures = result.Items || [];

    // Trier par score total décroissant
    candidatures.sort((a, b) => (b.scoreTotal || 0) - (a.scoreTotal || 0));

    // Créer le ranking
    const ranking = candidatures.map((c, index) => ({
      candidatureId: c.id,
      candidatNom: c.nom,
      candidatPrenom: c.prenom,
      offreTitre: c.offreTitre,
      scoreTotal: c.scoreTotal || 0,
      scoreCV: c.scoreCV || 0,
      scoreQuiz: c.scoreQuiz,
      scoreEntretien: c.scoreEntretien,
      rang: index + 1,
      statut: c.statut,
      recommendation: getRecommandation(c.scoreTotal || 0)
    }));

    res.json({
      succes: true,
      ranking
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

function getRecommandation(score) {
  if (score >= 85) return 'PRIORITAIRE';
  if (score >= 70) return 'BON_PROFIL';
  if (score >= 50) return 'MOYEN';
  return 'FAIBLE';
}

module.exports = router;