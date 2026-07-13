const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const pdf = require("pdf-parse");

// Client Bedrock — utilise les credentials AWS configurés
const bedrock = new BedrockRuntimeClient({
  region: "us-east-1", // Bedrock disponible en us-east-1
  // En local → utilise vos credentials AWS (~/.aws/credentials)
  // En Lambda → utilise le rôle IAM automatiquement
});

const MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"; // Le moins cher

/**
 * Appeler Claude via Bedrock
 */
async function callClaude(prompt, maxTokens = 1000) {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages: [
      { role: "user", content: prompt }
    ],
  });

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  });

  const response = await bedrock.send(command);
  const result   = JSON.parse(Buffer.from(response.body).toString());
  return result.content[0].text;
}

/**
 * Extraire le texte d'un CV (PDF ou DOCX)
 */
async function extraireTexteCV(fileBuffer, mimetype) {
  try {
    if (mimetype === "application/pdf") {
      const data = await pdf(fileBuffer);
      return data.text || "";
    }
    // DOCX → tentative basique
    return fileBuffer.toString("utf-8").replace(/[^\x20-\x7E\u00C0-\u024F\n]/g, " ");
  } catch (e) {
    console.error("Erreur extraction texte:", e);
    return "";
  }
}

/**
 * Analyser un CV avec l'IA et scorer selon l'offre
 */
async function analyserCV({ fileBuffer, mimetype, lettreMotivation, competencesCandidаt, niveauEtude, experience, offre }) {
  // 1. Extraire le texte du CV
  const texteCV = await extraireTexteCV(fileBuffer, mimetype);

  // 2. Valider que c'est bien un CV
  if (!texteCV || texteCV.length < 200) {
    return {
      valide: false,
      erreur: "Impossible d'extraire le contenu du fichier. Assurez-vous que le PDF n'est pas scanné ou protégé.",
      score: 0,
    };
  }

  const motsClesCv = ["expérience", "experience", "formation", "education", "compétences",
    "skills", "projet", "stage", "université", "licence", "master", "bac",
    "travail", "emploi", "diplôme", "email", "téléphone", "phone"];

  const cvLower = texteCV.toLowerCase();
  const motsTrouves = motsClesCv.filter(m => cvLower.includes(m));

  if (motsTrouves.length < 3) {
    return {
      valide: false,
      erreur: "Ce document ne ressemble pas à un CV. Veuillez uploader votre CV au format PDF ou DOCX.",
      score: 0,
    };
  }

  // 3. Construire le prompt pour Claude
  const offreContext = offre
    ? `OFFRE D'EMPLOI:
- Titre: ${offre.titre}
- Département: ${offre.departement}
- Type: ${offre.type}
- Mode: ${offre.modeTravail || ""}
- Description: ${offre.description || ""}
- Compétences requises: ${(offre.competences || []).join(", ") || "Non spécifiées"}`
    : "CANDIDATURE SPONTANÉE (pas d'offre spécifique)";

  const prompt = `Tu es un expert RH senior. Analyse ce CV et cette candidature de façon STRICTE et OBJECTIVE.

${offreContext}

CANDIDAT:
- Niveau d'études: ${niveauEtude || "Non précisé"}
- Expérience déclarée: ${experience || "Non précisée"}
- Compétences déclarées: ${(competencesCandidаt || []).join(", ") || "Non précisées"}

CV (texte extrait):
${texteCV.substring(0, 3000)}

LETTRE DE MOTIVATION:
${(lettreMotivation || "").substring(0, 1000)}

INSTRUCTIONS:
- Sois STRICT: un CV vide ou hors-sujet doit avoir un score bas (< 30)
- Compare OBJECTIVEMENT les compétences du CV avec celles requises par l'offre
- Si l'offre demande des compétences techniques spécifiques et que le CV n'en montre aucune → score très bas
- Un score de 80+ signifie que le candidat est vraiment excellent pour ce poste

Réponds UNIQUEMENT avec ce JSON (pas d'explication autour):
{
  "score": <entier 0-100>,
  "recommendation": "ACCEPTER" | "HESITER" | "REFUSER",
  "competencesMatchees": ["liste des compétences trouvées dans le CV qui correspondent à l'offre"],
  "competencesManquantes": ["liste des compétences requises mais absentes du CV"],
  "pointsForts": ["3 points forts maximum"],
  "pointsFaibles": ["2-3 points faibles"],
  "resumeAnalyse": "2-3 phrases résumant l'adéquation candidat/poste",
  "niveauExperience": "Junior" | "Intermédiaire" | "Senior",
  "pertinenceFormation": <entier 0-100>
}`;

  try {
    const rawResponse = await callClaude(prompt, 800);

    // Nettoyer la réponse (Claude peut ajouter du texte avant/après le JSON)
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Réponse IA invalide");

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      valide:               true,
      score:                Math.min(100, Math.max(0, analysis.score || 0)),
      recommendation:       analysis.recommendation || "HESITER",
      competencesMatchees:  analysis.competencesMatchees || [],
      competencesManquantes:analysis.competencesManquantes || [],
      pointsForts:          analysis.pointsForts || [],
      pointsFaibles:        analysis.pointsFaibles || [],
      resumeAnalyse:        analysis.resumeAnalyse || "",
      niveauExperience:     analysis.niveauExperience || "Junior",
      pertinenceFormation:  analysis.pertinenceFormation || 50,
      texteExtrait:         texteCV.substring(0, 500), // pour debug
    };
  } catch (e) {
    console.error("Erreur IA Bedrock:", e);
    // Fallback sans IA si Bedrock échoue
    return fallbackScoring({ texteCV, competencesCandidаt, offre, niveauEtude, experience });
  }
}

/**
 * Générer un quiz technique selon l'offre avec l'IA
 */
async function genererQuizIA(offre, nbQuestions = 5) {
  const prompt = `Tu es un expert RH et technique. Génère un quiz d'évaluation pour ce poste.

POSTE: ${offre.titre}
DÉPARTEMENT: ${offre.departement}
DESCRIPTION: ${offre.description || ""}
COMPÉTENCES REQUISES: ${(offre.competences || []).join(", ") || "Compétences générales"}

Génère exactement ${nbQuestions} questions variées:
- ${Math.ceil(nbQuestions * 0.6)} QCM avec 4 options (indique la bonne réponse)
- ${Math.floor(nbQuestions * 0.4)} questions ouvertes (type TEXTE)

Les questions doivent être SPÉCIFIQUES au poste et aux compétences requises.

Réponds UNIQUEMENT avec ce JSON:
{
  "titre": "Quiz Technique - ${offre.titre}",
  "questions": [
    {
      "id": "q1",
      "type": "QCM",
      "question": "Question ici ?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "reponseCorrecte": "Option B",
      "explication": "Explication courte de la bonne réponse",
      "points": 10,
      "competenceEvaluee": "Nom de la compétence"
    },
    {
      "id": "q2",
      "type": "TEXTE",
      "question": "Question ouverte ici ?",
      "reponseCorrecte": null,
      "criteresEvaluation": ["critère 1", "critère 2"],
      "points": 20,
      "competenceEvaluee": "Nom de la compétence"
    }
  ]
}`;

  try {
    const rawResponse = await callClaude(prompt, 2000);
    const jsonMatch   = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Réponse IA invalide");

    const quiz = JSON.parse(jsonMatch[0]);

    // S'assurer que les IDs sont uniques
    quiz.questions = quiz.questions.map((q, i) => ({
      ...q,
      id: `q_${Date.now()}_${i}`,
    }));

    return quiz;
  } catch (e) {
    console.error("Erreur génération quiz IA:", e);
    throw new Error("Impossible de générer le quiz. Vérifiez votre accès Bedrock.");
  }
}

/**
 * Fallback scoring sans IA (si Bedrock indisponible)
 */
function fallbackScoring({ texteCV, competencesCandidаt, offre, niveauEtude, experience }) {
  let score = 30; // Score de base
  const texteLower = texteCV.toLowerCase();

  if (offre && offre.competences) {
    const matches = offre.competences.filter(c => texteLower.includes(c.toLowerCase()));
    score += Math.round((matches.length / offre.competences.length) * 40);
  }

  if (niveauEtude) {
    const n = niveauEtude.toLowerCase();
    if (n.includes("master") || n.includes("ingénieur")) score += 15;
    else if (n.includes("licence") || n.includes("bac+3")) score += 10;
    else score += 5;
  }

  if (experience) {
    const e = experience.toLowerCase();
    if (e.includes("5") || e.includes("senior")) score += 15;
    else if (e.includes("3") || e.includes("2")) score += 10;
    else score += 5;
  }

  return {
    valide: true,
    score: Math.min(100, score),
    recommendation: score >= 70 ? "ACCEPTER" : score >= 50 ? "HESITER" : "REFUSER",
    competencesMatchees: competencesCandidаt || [],
    competencesManquantes: [],
    pointsForts: ["Analyse manuelle requise"],
    pointsFaibles: ["IA temporairement indisponible"],
    resumeAnalyse: "Analyse IA indisponible. Révision manuelle recommandée.",
    niveauExperience: "Junior",
    pertinenceFormation: 50,
  };
}

module.exports = { analyserCV, genererQuizIA, extraireTexteCV };