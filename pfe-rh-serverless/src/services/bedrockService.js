const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");


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
const mammoth = require("mammoth");

async function extraireTexteCV(fileBuffer, mimetype) {
  if (!fileBuffer || fileBuffer.length === 0) return "";

  try {
    if (mimetype === "application/pdf") {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: fileBuffer });
      const { text } = await parser.getText();
      return text || "";
    }

    if (mimetype.includes("wordprocessingml") || mimetype === "application/msword") {
      const mammoth = require("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
      return value || "";
    }

    return "";
  } catch (e) {
    console.error("Extraction du texte impossible:", e.message);
    return "";
  }
}

/**
 * Analyser un CV avec l'IA et scorer selon l'offre
 */

async function analyserCV({
  fileBuffer, mimetype, lettreMotivation,
  competencesCandidat, niveauEtude, experience, offre,
}) {
  const texteCV = await extraireTexteCV(fileBuffer, mimetype);

  const extractionReussie = texteCV.length >= 200;
  if (!extractionReussie) {
    console.warn(
      `Extraction impossible (${mimetype}, ${fileBuffer?.length || 0} octets) — ` +
      `analyse sur les seules déclarations du candidat`
    );
  }

  // Vérification de vraisemblance : seulement si le texte a été lu.
  // Sans extraction, on ne peut rien conclure sur la nature du document.
  const MOTS_CLES_CV = [
    "expérience", "experience", "formation", "education", "compétences",
    "skills", "projet", "stage", "université", "licence", "master", "bac",
    "travail", "emploi", "diplôme", "email", "téléphone", "phone",
  ];

  let documentSuspect = false;
  if (extractionReussie) {
    const minuscules = texteCV.toLowerCase();
    const trouves = MOTS_CLES_CV.filter((m) => minuscules.includes(m));
    documentSuspect = trouves.length < 3;
    if (documentSuspect) {
      console.warn("Le document ne présente pas les marqueurs habituels d'un CV");
    }
  }

  const competences = competencesCandidat || [];

  const contexteOffre = offre
    ? `OFFRE D'EMPLOI
Titre : ${offre.titre}
Département : ${offre.departement || "non précisé"}
Type de contrat : ${offre.type || "non précisé"}
Mode de travail : ${offre.modeTravail || "non précisé"}
Description : ${offre.description || "non précisée"}
Compétences requises : ${(offre.competences || []).join(", ") || "non précisées"}`
    : "CANDIDATURE SPONTANÉE — aucune offre ciblée";

  const sectionCV = extractionReussie
    ? `CV (texte extrait)\n${texteCV.substring(0, 3000)}`
    : `CV : le contenu du fichier n'a pas pu être extrait.
Fonde ton analyse uniquement sur la lettre de motivation et les
déclarations du candidat. Plafonne le score à 70 : sans le CV, une
évaluation complète est impossible.`;

  const prompt = `Tu es un recruteur expérimenté. Évalue cette candidature de façon objective et argumentée.

${contexteOffre}

CANDIDAT
Niveau d'études : ${niveauEtude || "non précisé"}
Expérience déclarée : ${experience || "non précisée"}
Compétences déclarées : ${competences.join(", ") || "non précisées"}

${sectionCV}

LETTRE DE MOTIVATION
${(lettreMotivation || "non fournie").substring(0, 1500)}

CONSIGNES
- Compare les compétences observées à celles attendues pour le poste.
- Un dossier sans lien avec le poste doit obtenir un score inférieur à 30.
- Un score supérieur à 80 signale un profil réellement excellent : réserve-le.
- Appuie chaque point fort et chaque réserve sur un élément du dossier.
- Ne pénalise pas le candidat pour une information absente du dossier :
  signale-la comme un point à vérifier en entretien.

Réponds uniquement par ce JSON, sans texte autour :
{
  "score": <entier 0-100>,
  "recommendation": "ACCEPTER" | "HESITER" | "REFUSER",
  "competencesMatchees": ["compétences attendues et démontrées"],
  "competencesManquantes": ["compétences attendues et absentes"],
  "pointsForts": ["3 au maximum"],
  "pointsFaibles": ["2 à 3"],
  "resumeAnalyse": "2 à 3 phrases sur l'adéquation au poste",
  "niveauExperience": "Junior" | "Intermédiaire" | "Senior",
  "pertinenceFormation": <entier 0-100>
}`;

  try {
    const reponseBrute = await callClaude(prompt, 800);

    // Le modèle peut encadrer le JSON de texte : on isole l'objet.
    const correspondance = reponseBrute.match(/\{[\s\S]*\}/);
    if (!correspondance) throw new Error("Réponse du modèle non exploitable");

    const analyse = JSON.parse(correspondance[0]);

    let score = Math.min(100, Math.max(0, Number(analyse.score) || 0));
    if (!extractionReussie) score = Math.min(score, 70);

    const reserves = analyse.pointsFaibles || [];
    if (!extractionReussie) {
      reserves.unshift("CV illisible : évaluation fondée sur les déclarations");
    }
    if (documentSuspect) {
      reserves.unshift("Le document fourni ne ressemble pas à un CV");
    }

    return {
      valide: true,
      source: "bedrock",
      extractionReussie,
      documentSuspect,
      score,
      recommendation: analyse.recommendation || "HESITER",
      competencesMatchees: analyse.competencesMatchees || [],
      competencesManquantes: analyse.competencesManquantes || [],
      pointsForts: analyse.pointsForts || [],
      pointsFaibles: reserves,
      resumeAnalyse: analyse.resumeAnalyse || "",
      niveauExperience: analyse.niveauExperience || "Junior",
      pertinenceFormation: Number(analyse.pertinenceFormation) || 50,
      texteExtrait: texteCV.substring(0, 500),
    };
  } catch (e) {
    // Le repli produit un score par mots-clés. Il est signalé comme tel :
    // sans cette trace, une panne de Bedrock passerait pour une analyse
    // réussie, et personne ne s'en apercevrait.
    console.error("Analyse Bedrock indisponible, repli sur le calcul local:", e.message);
    return fallbackScoring({
      texteCV, competencesCandidat: competences, offre,
      niveauEtude, experience, extractionReussie, documentSuspect,
    });
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


function fallbackScoring({
  texteCV, competencesCandidat, offre, niveauEtude, experience,
  extractionReussie = false, documentSuspect = false,
}) {
  let score = 30;
  const minuscules = (texteCV || "").toLowerCase();

  // Sans texte de CV, on se rabat sur les compétences déclarées
  const sourceCompetences = extractionReussie
    ? minuscules
    : (competencesCandidat || []).join(" ").toLowerCase();

  if (offre?.competences?.length) {
    const trouvees = offre.competences.filter((c) =>
      sourceCompetences.includes(String(c).toLowerCase())
    );
    score += Math.round((trouvees.length / offre.competences.length) * 40);
  }

  const etudes = (niveauEtude || "").toLowerCase();
  if (/master|ingénieur|ingenieur|doctorat/.test(etudes)) score += 15;
  else if (/licence|bac\s*\+\s*3/.test(etudes)) score += 10;
  else if (etudes) score += 5;

  const anciennete = (experience || "").toLowerCase();
  if (/senior|[5-9]\s*an|1[0-9]\s*an/.test(anciennete)) score += 15;
  else if (/[2-4]\s*an/.test(anciennete)) score += 10;
  else if (anciennete) score += 5;

  score = Math.min(100, score);

  return {
    valide: true,
    source: "fallback",
    extractionReussie,
    documentSuspect,
    score,
    recommendation: score >= 70 ? "ACCEPTER" : score >= 50 ? "HESITER" : "REFUSER",
    competencesMatchees: competencesCandidat || [],
    competencesManquantes: [],
    pointsForts: ["Analyse automatique indisponible"],
    pointsFaibles: ["Score calculé par correspondance de mots-clés"],
    resumeAnalyse: "Le service d'analyse était indisponible. Une relecture manuelle est nécessaire.",
    niveauExperience: "Junior",
    pertinenceFormation: 50,
  };
}

module.exports = { analyserCV, genererQuizIA, extraireTexteCV };