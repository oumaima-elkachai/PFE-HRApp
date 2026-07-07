
export interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: 'RH' | 'EMPLOYE' | 'CANDIDAT';
  departement?: string;
  poste?: string;
  statut: string;
  creeLe: string;
}

export interface Employe {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  poste: string;
  departement: string;
  statut: 'actif' | 'archive';
  telephone?: string;
  creeLe: string;
  misAJourLe?: string;
}

export interface Candidat {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  posteVise: string;
  niveauEtude?: string;
  experience?: string;
  lettreMotivation?: string; 
  competences: string[];
  statut: 'SOUMIS' | 'PRESELECTION' | 'ENTRETIEN' | 'OFFRE' | 'EMBAUCHE' | 'REFUSE';
  historiqueStatuts: HistoriqueStatut[];
  soumisLe: string;
  misAJourLe: string;
}

export interface HistoriqueStatut {
  statut: string;
  ancienStatut?: string;
  date: string;
  commentaire: string;
  modifiePar?: string;
}

// ✅ NOUVELLES INTERFACES POUR LE RECRUTEMENT

export interface JobOffer {
  id: string;
  titre: string;
  departement: string;
  type: 'CDI' | 'CDD' | 'Stage' | 'Freelance';
  modetravail: 'Remote' | 'Hybrid' | 'On-site';
  description: string;
  competences: string[];
  salaire?: number;
  salaireMin?: number;
  salaireMax?: number;
  statut: 'active' | 'fermee' | 'urgente' | 'brouillon';
  datePublication: string;
  dateExpiration?: string;
  nombreCandidatures?: number;
  creePar?: string;
  creeLe: string;
  misAJourLe: string;
}

export interface Candidature {
  id: string;
  offreId: string;
  offreTitre?: string; // Pour afficher le titre de l'offre
  candidatId?: string; // Si lié à un compte candidat
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  cv?: string; // URL du CV
  lettreMotivation?: string;
  portfolio?: string;
  linkedin?: string;
  
  // Statut de la candidature
  statut: 'nouveau' | 'en_revue' | 'preselectionne' | 'entretien' | 'offre' | 'accepte' | 'refuse';
  
  // Étape dans le pipeline (pour le Kanban)
  etape: 'Applied' | 'Screened' | 'Interviewed' | 'Offered' | 'Hired' | 'Rejected';
  
  // Informations de suivi
  notesRecruteur?: string;
  score?: number; // Score sur 100
  dateEntretien?: string;
  typeEntretien?: 'phone' | 'video' | 'onsite';
  interviewers?: string[]; // IDs des recruteurs
  
  // Historique
  historique: HistoriqueCandidature[];
  
  // Métadonnées
  source?: 'site_carriere' | 'linkedin' | 'indeed' | 'referral' | 'direct';
  creeLe: string;
  misAJourLe: string;

  
}

export interface HistoriqueCandidature {
  etape: string;
  ancienneEtape?: string;
  statut: string;
  ancienStatut?: string;
  date: string;
  commentaire?: string;
  modifiePar?: string; // ID ou nom du recruteur
  action: 'statut_change' | 'note_ajoutee' | 'entretien_planifie' | 'offre_envoyee' | 'autre';
}

// ✅ INTERFACES POUR LES ENTRETIENS

export interface Entretien {
  id: string;
  candidatureId: string;
  candidatNom: string;
  candidatPrenom: string;
  offreTitre: string;
  type: 'phone' | 'video' | 'onsite';
  dateHeure: string;
  dureeMinutes: number;
  lieu?: string; // Pour les entretiens on-site
  lienVideo?: string; // Pour les entretiens vidéo
  interviewers: string[]; // IDs des recruteurs
  statut: 'planifie' | 'confirme' | 'termine' | 'annule' | 'reporte';
  notes?: string;
  evaluation?: {
    competencesTechniques: number; // 1-5
    softSkills: number; // 1-5
    motivation: number; // 1-5
    culturalFit: number; // 1-5
    recommandation: 'embaucher' | 'peut_etre' | 'refuser';
    commentaires?: string;
  };
  creeLe: string;
  misAJourLe: string;
}

// ✅ INTERFACES EXISTANTES (INCHANGÉES)

export interface Pointage {
  id: string;
  employeId: string;
  employeNom: string;
  date: string;
  heureArrivee: string;
  heureDepart?: string;
  dureeMinutes?: number;
  statut: 'EN_COURS' | 'TERMINE';
}

export interface Evenement {
  id: string;
  titre: string;
  description: string;
  type: 'REUNION' | 'CONGE' | 'FORMATION' | 'EVENEMENT' | 'RAPPEL';
  dateDebut: string;
  dateFin: string;
  lieu?: string;
  participants: string[];
  statut: 'ACTIF' | 'ANNULE';
  creePar: string;
  creeLe: string;
}

export interface Facture {
  id: string;
  numero: string;
  employeId: string;
  employeNom: string;
  mois: number;
  annee: number;
  moisLabel: string;
  salaireBase: number;
  salaireNet: number;
  statut: string;
  genereLe: string;
}

// ✅ STATS DASHBOARD ENRICHIES

export interface DashboardStats {
  employes: {
    total: number;
    actifs: number;
    archives: number;
    parDepartement: Record<string, number>;
  };
  candidats: {
    total: number;
    soumis: number;
    preselection: number;
    entretien: number;
    offre: number;
    embauche: number;
    refuse: number;
  };
  // ✅ Nouvelles stats recrutement
  recrutement?: {
    offresActives: number;
    candidaturesEnCours: number;
    entretiensASemaine: number;
    tauxConversion: number; // %
    delaiMoyenEmbauche: number; // en jours
  };
  pointages_aujourdhui: {
    total: number;
    en_cours: number;
    termines: number;
    moyenne_duree: string;
  };
  evenements_mois: {
    total: number;
    reunions: number;
    conges: number;
    formations: number;
  };
  factures_mois: {
    total: number;
    total_salaires: string;
  };
}

export interface ApiResponse<T> {
  succes: boolean;
  data: T;
  erreur?: string;
}

// ✅ TYPES UTILITAIRES POUR LE RECRUTEMENT

export type StatutCandidature = Candidature['statut'];
export type EtapeCandidature = Candidature['etape'];
export type TypeOffre = JobOffer['type'];
export type StatutOffre = JobOffer['statut'];
export type ModeTravail = JobOffer['modetravail'];

// Mapping entre statuts et étapes
export const STATUT_TO_ETAPE: Record<StatutCandidature, EtapeCandidature> = {
  nouveau: 'Applied',
  en_revue: 'Screened',
  preselectionne: 'Screened',
  entretien: 'Interviewed',
  offre: 'Offered',
  accepte: 'Hired',
  refuse: 'Rejected',
};

export const ETAPE_TO_STATUT: Record<EtapeCandidature, StatutCandidature> = {
  Applied: 'nouveau',
  Screened: 'en_revue',
  Interviewed: 'entretien',
  Offered: 'offre',
  Hired: 'accepte',
  Rejected: 'refuse',
};

// Couleurs pour les badges
export const STATUT_COLORS: Record<StatutOffre, string> = {
  active: 'green',
  urgente: 'amber',
  fermee: 'gray',
  brouillon: 'blue',
};

export const ETAPE_COLORS: Record<EtapeCandidature, string> = {
  Applied: 'blue',
  Screened: 'purple',
  Interviewed: 'amber',
  Offered: 'green',
  Hired: 'green',
  Rejected: 'red',
};

// ========================================
// 🧠 SYSTÈME DE SCORING AI
// ========================================

export interface ScoringDetails {
  // Analyse CV + Lettre de motivation (40%)
  cvAnalysis: {
    score: number; // 0-100
    pointsForts: string[];
    pointsFaibles: string[];
    competencesMatchees: string[];
    competencesManquantes: string[];
    recommendation: 'ACCEPTER' | 'REFUSER' | 'HESITER';
    aiCommentaire: string;
    analyseLe: string;
  };
  
  // Analyse Quiz technique (30%)
  quizAnalysis?: {
    score: number; // 0-100
    bonnesReponses: number;
    totalQuestions: number;
    tempsEcouleSecondes: number;
    reponses: QuizReponse[];
    completeLe: string;
  };
  
  // Analyse Entretien (30%)
  entretienAnalysis?: {
    score: number; // 0-100
    scoreSoftSkills: number;
    scoreMotivation: number;
    scoreTechnique: number;
    scoreCultureFit: number;
    pointsForts: string[];
    pointsFaibles: string[];
    recommendation: 'EMBAUCHER' | 'REFUSER' | 'HESITER' | 'SECOND_ENTRETIEN';
    aiSummary: string;
    analyseLe: string;
  };
}

// Extension de l'interface Candidat existante (ajoutez ces champs)
export interface CandidatExtended extends Candidat {
  // Documents
  cvUrl?: string;
  cvFileName?: string;
  
  // Scores AI
  scoreCV?: number; // 0-100
  scoreQuiz?: number; // 0-100
  scoreEntretien?: number; // 0-100
  scoreTotal?: number; // Moyenne pondérée
  scoringDetails?: ScoringDetails;
  
  // Quiz
  quizId?: string;
  quizStatus?: 'NON_ENVOYE' | 'ENVOYE' | 'EN_COURS' | 'TERMINE' | 'EXPIRE';
  quizEnvoyeLe?: string;
  quizCompleteLe?: string;
  quizExpirationDate?: string;
  
  // Entretien
  entretienId?: string;
  entretienScheduledAt?: string;
  entretienCompletedAt?: string;
  
  // Type de candidature
  type?: 'OFFRE' | 'SPONTANEE';
}

// ========================================
// 📝 QUIZ SYSTÈME
// ========================================

export interface Quiz {
  id: string;
  offreId: string;
  offreTitre: string;
  titre: string;
  description?: string;
  dureeMinutes: number;
  seuilPassage: number; // % minimum pour réussir (ex: 70)
  questions: QuizQuestion[];
  statut: 'ACTIF' | 'ARCHIVE';
  creeLe: string;
  misAJourLe: string;
}

export interface QuizQuestion {
  id: string;
  type: 'QCM' | 'CODE' | 'TEXTE_LIBRE' | 'VRAI_FAUX';
  question: string;
  description?: string;
  options?: string[]; // Pour QCM
  reponseCorrecte: string | string[];
  explicationReponse?: string;
  points: number;
  ordre: number;
  competenceEvaluee?: string;
  
  // Pour questions de code
  languageProgrammation?: string; // 'javascript', 'python', 'sql'
  codeTemplate?: string;
  testsUnitaires?: {
    input: string;
    expectedOutput: string;
  }[];
}

export interface QuizReponse {
  questionId: string;
  reponse: string | string[];
  tempsReponseSecondes: number;
  estCorrecte: boolean;
  pointsObtenus: number;
  
  // Pour code
  codeAnalysis?: {
    passeTousLesTests: boolean;
    testsReussis: number;
    testsTotal: number;
    qualiteCode: number; // 0-100
    commentaireIA?: string;
  };
}

export interface QuizSession {
  id: string;
  quizId: string;
  candidatId: string;
  candidatEmail: string;
  
  statut: 'EN_COURS' | 'TERMINE' | 'EXPIRE' | 'ABANDONNE';
  
  debutLe: string;
  finLe?: string;
  expirationDate: string;
  
  questionActuelle: number;
  reponses: QuizReponse[];
  
  // Anti-triche
  nombreChangementsOnglet: number;
  nombreCopierColler: number;
  tempsInactifSecondes: number;
  
  // Résultats
  scoreObtenu?: number;
  resultat?: 'REUSSI' | 'ECHOUE';
  
  creeLe: string;
  misAJourLe: string;
}

// ========================================
// 🎥 EXTENSION ENTRETIEN (avec IA)
// ========================================

export interface EntretienExtended extends Entretien {
  // Enregistrement
  recordingUrl?: string;
  transcript?: string; // Transcription audio/vidéo
  
  // Analyse IA post-entretien
  aiSummary?: {
    resumeGeneral: string;
    themesDiscutes: string[];
    questionsClefs: string[];
    reponsesNotables: string[];
    signaleursAlerte: string[]; // red flags
    pointsPositifs: string[];
    scoreGlobal: number; // 0-100
    recommendationIA: 'EMBAUCHER' | 'REFUSER' | 'HESITER';
    confiance: number; // 0-100 (confiance dans l'analyse)
    genereLe: string;
  };
  
  // Évaluation enrichie (remplace/complète evaluation existante)
  evaluationDetaille?: {
    competencesTechniques: {
      score: number; // 0-100
      details: string;
      competencesValidees: string[];
    };
    softSkills: {
      score: number;
      communication: number;
      travailEquipe: number;
      adaptabilite: number;
      leadership: number;
    };
    motivation: {
      score: number;
      connaissanceEntreprise: number;
      alignementValeurs: number;
      projetProfessionnel: number;
    };
    culturalFit: {
      score: number;
      details: string;
    };
    scoreGlobal: number; // 0-100
    recommandation: 'EMBAUCHER' | 'REFUSER' | 'HESITER' | 'SECOND_ENTRETIEN';
    commentaires: string;
  };
}

// ========================================
// 📊 ANALYTICS & STATISTIQUES
// ========================================

export interface RecrutementAnalytics {
  periode: {
    debut: string;
    fin: string;
  };
  
  // Scores moyens
  scoresMoyens: {
    cv: number;
    quiz: number;
    entretien: number;
    global: number;
  };
  
  // Taux de réussite par étape
  tauxReussite: {
    cvVersQuiz: number; // %
    quizVersEntretien: number;
    entretienVersOffre: number;
    offreVersEmbauche: number;
    global: number; // candidature → embauche
  };
  
  // Délais moyens
  delais: {
    cvVersQuiz: number; // jours
    quizVersEntretien: number;
    entretienVersOffre: number;
    offreVersEmbauche: number;
    global: number;
  };
  
  // Top compétences recherchées vs trouvées
  competences: {
    recherchees: { nom: string; occurrences: number }[];
    trouvees: { nom: string; occurrences: number }[];
    matchRate: number; // %
  };
  
  // Sources de candidatures
  sources: {
    nom: string;
    nombre: number;
    tauxConversion: number;
  }[];
}

export interface CandidatRanking {
  candidatId: string;
  candidatNom: string;
  candidatPrenom: string;
  offreTitre: string;
  
  scoreTotal: number;
  scoreCV: number;
  scoreQuiz: number | null;
  scoreEntretien: number | null;
  
  rang: number;
  statut: string;
  
  recommendation: 'PRIORITAIRE' | 'BON_PROFIL' | 'MOYEN' | 'FAIBLE';
  tags?: string[]; // ['Compétences rares', 'Expérience senior', 'Multilingue']
}

// ========================================
// 🔧 CONFIGURATION
// ========================================

export interface RecrutementConfig {
  // Poids des scores (doivent totaliser 1.0)
  scoring: {
    poidsCV: number; // ex: 0.4 (40%)
    poidsQuiz: number; // ex: 0.3 (30%)
    poidsEntretien: number; // ex: 0.3 (30%)
    seuilPreselection: number; // score minimum pour quiz
    seuilEntretien: number; // score minimum pour entretien
    seuilOffre: number; // score minimum pour offre
  };
  
  // Paramètres quiz
  quiz: {
    dureeParDefautMinutes: number;
    nombreQuestionsMin: number;
    nombreQuestionsMax: number;
    seuilReussiteDefaut: number; // %
    delaiExpirationJours: number;
    autoGenerate: boolean; // génération auto par IA
  };
  
  // Paramètres entretiens
  entretiens: {
    dureesDisponibles: number[]; // [30, 45, 60, 90]
    delaiMinimumHeures: number;
    rappelAvantHeures: number;
    enregistrementAuto: boolean;
    transcriptionAuto: boolean;
  };
  
  // IA Configuration
  ia: {
    provider: 'openai' | 'anthropic' | 'custom';
    modeleCVAnalysis: string; // 'gpt-4', 'claude-3-opus'
    modeleQuizGeneration: string;
    modeleEntretienSummary: string;
    temperature: number; // 0-1
    enabled: boolean;
  };
}

// ========================================
// 🎯 TYPES UTILITAIRES SUPPLÉMENTAIRES
// ========================================

export type ScoreRange = 'EXCELLENT' | 'BON' | 'MOYEN' | 'FAIBLE';
export type QuizStatus = QuizSession['statut'];
export type RecommandationIA = 'EMBAUCHER' | 'REFUSER' | 'HESITER' | 'SECOND_ENTRETIEN';

export const SCORE_RANGES: Record<ScoreRange, { min: number; max: number; color: string }> = {
  EXCELLENT: { min: 85, max: 100, color: 'green' },
  BON: { min: 70, max: 84, color: 'blue' },
  MOYEN: { min: 50, max: 69, color: 'amber' },
  FAIBLE: { min: 0, max: 49, color: 'red' },
};

export function getScoreRange(score: number): ScoreRange {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'BON';
  if (score >= 50) return 'MOYEN';
  return 'FAIBLE';
}

export const QUIZ_STATUS_LABELS: Record<QuizStatus, string> = {
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  EXPIRE: 'Expiré',
  ABANDONNE: 'Abandonné',
};

export const RECOMMANDATION_LABELS: Record<RecommandationIA, { label: string; color: string }> = {
  EMBAUCHER: { label: 'Recommandé pour embauche', color: 'green' },
  HESITER: { label: 'Profil à revoir', color: 'amber' },
  REFUSER: { label: 'Non recommandé', color: 'red' },
  SECOND_ENTRETIEN: { label: 'Second entretien conseillé', color: 'blue' },
};

// ========================================
// 📤 HELPER FUNCTIONS
// ========================================

export function calculerScoreTotal(
  scoreCV: number,
  scoreQuiz: number | null,
  scoreEntretien: number | null,
  config: RecrutementConfig['scoring']
): number {
  const { poidsCV, poidsQuiz, poidsEntretien } = config;
  
  if (!scoreQuiz && !scoreEntretien) {
    // Seulement CV
    return Math.round(scoreCV);
  }
  
  if (!scoreEntretien) {
    // CV + Quiz (redistribuer les poids)
    const totalPoids = poidsCV + poidsQuiz;
    return Math.round(
      (scoreCV * poidsCV + scoreQuiz! * poidsQuiz) / totalPoids
    );
  }
  
  // CV + Quiz + Entretien (complet)
  return Math.round(
    scoreCV * poidsCV +
    (scoreQuiz || 0) * poidsQuiz +
    scoreEntretien * poidsEntretien
  );
}

export function getRecommandationFromScore(
  scoreTotal: number,
  config: RecrutementConfig['scoring']
): 'PRIORITAIRE' | 'BON_PROFIL' | 'MOYEN' | 'FAIBLE' {
  if (scoreTotal >= config.seuilOffre) return 'PRIORITAIRE';
  if (scoreTotal >= config.seuilEntretien) return 'BON_PROFIL';
  if (scoreTotal >= config.seuilPreselection) return 'MOYEN';
  return 'FAIBLE';
}

// ========================================
// 📋 INTERFACES POUR LES EMAILS
// ========================================

export interface EmailTemplate {
  type: 
    | 'QUIZ_INVITATION'
    | 'ENTRETIEN_INVITATION'
    | 'ENTRETIEN_RAPPEL'
    | 'OFFRE_EMPLOI'
    | 'CANDIDATURE_REFUSE'
    | 'CANDIDATURE_RECU';
  
  destinataire: string;
  sujet: string;
  corps: string;
  
  // Variables dynamiques
  variables: {
    candidatNom?: string;
    candidatPrenom?: string;
    offreTitre?: string;
    dateEntretien?: string;
    lienQuiz?: string;
    lienEntretien?: string;
    [key: string]: string | undefined;
  };
}

// ========================================
// 🔐 PERMISSIONS ÉTENDUES
// ========================================

export interface RecrutementPermissions {
  // Candidatures
  canViewAllCandidatures: boolean;
  canViewOwnCandidatures: boolean;
  canEditCandidatures: boolean;
  canDeleteCandidatures: boolean;
  canExportCandidatures: boolean;
  
  // Scores & Analyses
  canViewScores: boolean;
  canEditScores: boolean;
  canViewAIAnalysis: boolean;
  canTriggerAIAnalysis: boolean;
  
  // Quiz
  canCreateQuiz: boolean;
  canSendQuiz: boolean;
  canViewQuizResults: boolean;
  
  // Entretiens
  canScheduleEntretiens: boolean;
  canConductEntretiens: boolean;
  canViewEntretienRecordings: boolean;
  canEditEntretienEvaluations: boolean;
  
  // Offres d'emploi
  canCreateOffres: boolean;
  canEditOffres: boolean;
  canDeleteOffres: boolean;
  canPublishOffres: boolean;
  
  // Décisions
  canSendOffers: boolean;
  canHireCandidates: boolean;
  canRejectCandidates: boolean;
  
  // Analytics
  canViewAnalytics: boolean;
  canExportReports: boolean;
  
  // Configuration
  canManageConfig: boolean;
  canManageAISettings: boolean;
}