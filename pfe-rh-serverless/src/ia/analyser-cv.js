// backend/services/aiService.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-your-key-here'
});

/**
 * Analyser une candidature (CV + lettre de motivation)
 */
async function analyserCandidature({ lettreMotivation, competences, niveauEtude, experience, offre }) {
  try {
    const prompt = `
Tu es un expert RH. Analyse cette candidature et donne un score sur 100.

${offre ? `
OFFRE D'EMPLOI:
- Titre: ${offre.titre}
- Compétences requises: ${offre.competences?.join(', ') || 'N/A'}
- Département: ${offre.departement}
- Type: ${offre.type}
` : 'CANDIDATURE SPONTANÉE'}

CANDIDATURE:
- Niveau d'étude: ${niveauEtude || 'Non spécifié'}
- Expérience: ${experience || 'Non spécifié'}
- Compétences: ${competences?.join(', ') || 'Non spécifié'}

LETTRE DE MOTIVATION:
${lettreMotivation}

Critères d'évaluation:
1. Adéquation compétences avec le poste (40%)
2. Expérience pertinente (30%)
3. Motivation et clarté de la lettre (20%)
4. Orthographe et présentation (10%)

Réponds UNIQUEMENT avec un JSON valide:
{
  "score": <nombre 0-100>,
  "pointsForts": ["point 1", "point 2", "point 3"],
  "pointsFaibles": ["point 1", "point 2"],
  "competencesMatchees": ["comp1", "comp2"],
  "competencesManquantes": ["comp1", "comp2"],
  "recommendation": "ACCEPTER" | "REFUSER" | "HESITER",
  "aiCommentaire": "Commentaire détaillé sur la candidature"
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    });

    const content = response.choices[0].message.content.trim();
    const analysis = JSON.parse(content);

    return analysis;

  } catch (error) {
    console.error('❌ Erreur analyse IA:', error);
    
    // Fallback: scoring basique sans IA
    return {
      score: 65,
      pointsForts: ['Candidature reçue'],
      pointsFaibles: ['Analyse IA indisponible'],
      competencesMatchees: competences || [],
      competencesManquantes: [],
      recommendation: 'HESITER',
      aiCommentaire: 'Analyse automatique indisponible. Révision manuelle recommandée.'
    };
  }
}

/**
 * Générer un quiz automatique pour une offre
 */
async function genererQuiz(offre) {
  try {
    const prompt = `
Génère un quiz technique pour le poste: ${offre.titre}
Département: ${offre.departement}
Compétences requises: ${offre.competences?.join(', ') || 'Compétences générales'}

Crée 10 questions variées:
- 5 QCM (4 choix, 1 bonne réponse)
- 3 questions de code ou pratiques
- 2 questions ouvertes

Format JSON strict:
{
  "questions": [
    {
      "type": "QCM",
      "question": "Question ici ?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "reponseCorrecte": "Option B",
      "explicationReponse": "Explication courte",
      "points": 10,
      "competenceEvaluee": "React"
    },
    {
      "type": "CODE",
      "question": "Écrivez une fonction qui...",
      "languageProgrammation": "javascript",
      "codeTemplate": "function solution() {\\n  // Votre code ici\\n}",
      "reponseCorrecte": "function solution() { return true; }",
      "points": 15,
      "competenceEvaluee": "JavaScript"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);

  } catch (error) {
    console.error('❌ Erreur génération quiz:', error);
    throw new Error('Impossible de générer le quiz');
  }
}

/**
 * Analyser un entretien
 */
async function analyserEntretien({ transcript, notes, candidatNom, offreTitre, evaluation }) {
  try {
    const prompt = `
Analyse cet entretien d'embauche et génère un résumé structuré.

CANDIDAT: ${candidatNom}
POSTE: ${offreTitre}

TRANSCRIPT:
${transcript || 'Non disponible'}

NOTES DU RECRUTEUR:
${notes || 'Aucune note'}

${evaluation ? `
ÉVALUATION MANUELLE:
- Compétences techniques: ${evaluation.competencesTechniques}/5
- Soft skills: ${evaluation.softSkills}/5
- Motivation: ${evaluation.motivation}/5
` : ''}

Génère un JSON avec:
{
  "resumeGeneral": "Résumé en 2-3 phrases",
  "themesDiscutes": ["thème1", "thème2", "thème3"],
  "questionsClefs": ["question1", "question2"],
  "reponsesNotables": ["réponse1", "réponse2"],
  "signaleursAlerte": ["alerte1 si applicable"],
  "pointsPositifs": ["point1", "point2", "point3"],
  "scoreSoftSkills": <0-100>,
  "scoreMotivation": <0-100>,
  "scoreTechnique": <0-100>,
  "scoreCultureFit": <0-100>,
  "scoreGlobal": <0-100>,
  "recommendationIA": "EMBAUCHER" | "REFUSER" | "HESITER",
  "confiance": <0-100>
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);

  } catch (error) {
    console.error('❌ Erreur analyse entretien:', error);
    throw new Error('Impossible d\'analyser l\'entretien');
  }
}

module.exports = {
  analyserCandidature,
  genererQuiz,
  analyserEntretien
};