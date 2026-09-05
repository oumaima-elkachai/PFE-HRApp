// src/types/index.ts

// ========================================
// 👤 UTILISATEURS & EMPLOYÉS
// ========================================

export interface User {
  id: string;
  sub?: string;
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

// ========================================
// 📝 CANDIDATS (INTERFACE PRINCIPALE)
// ========================================

export interface Candidat {
  id: string;
  offreId?: string;
  offreTitre?: string;
  offreDepartement?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  posteVise: string;
  niveauEtude?: string;
  experience?: string;
  lettreMotivation?: string;
  competences: string[];
  
  // Statut (avec nouveaux statuts quiz)
  statut: 'SOUMIS' | 'PRESELECTION' | 'QUIZ_EN_ATTENTE' | 'QUIZ_COMPLETE' | 'ENTRETIEN' | 'OFFRE' | 'EMBAUCHE' | 'REFUSE';
  
  historiqueStatuts: HistoriqueStatut[];
  
  // Documents
  cvUrl?: string;
  cvFileName?: string;
  cvS3Key?: string;
  
  // Scores IA
  scoreCV?: number;              // 0-100
  quizResult?: QuizResult;       // Résultat du quiz
  scoreEntretien?: number;       // 0-100
  scoreTotal?: number;           // Score global pondéré
  scoringDetails?: ScoringDetails;
  
  // Quiz
  quizId?: string;
  quizStatus?: 'NON_ENVOYE' | 'ENVOYE' | 'EN_COURS' | 'TERMINE' | 'EXPIRE';
  quizEnvoyeLe?: string;
  quizCompleteLe?: string;
  quizExpirationDate?: string;
  
  // Entretien
  entretien?: EntretienInfo;
  entretienId?: string;
  entretienScheduledAt?: string;
  entretienCompletedAt?: string;
  
  // Type & Source
  type?: 'OFFRE' | 'SPONTANEE';
  source?: 'site_carriere' | 'linkedin' | 'indeed' | 'referral' | 'direct';
  
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

// ========================================
// 🎯 QUIZ & ÉVALUATION
// ========================================

export interface QuizResult {
  scoreQuiz: number;             // 0-100
  totalQuestions: number;
  bonnesReponses: number;
  tempsEcouleSecondes: number;
  passeLe: string;               // ISO date
  reponses?: QuizReponse[];
}

export interface Quiz {
  id: string;
  offreId: string;
  offreTitre: string;
  titre: string;
  description?: string;
  dureeMinutes: number;
  seuilPassage: number;          // % minimum pour réussir (ex: 70)
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
  options?: string[];
  reponseCorrecte: string | string[];
  explicationReponse?: string;
  points: number;
  ordre: number;
  competenceEvaluee?: string;
  
  // Pour questions de code
  languageProgrammation?: string;
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
    qualiteCode: number;
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
// 🎙️ ENTRETIENS
// ========================================

export interface EntretienInfo {
  date: string;                  // ISO date (YYYY-MM-DD)
  heure: string;                 // HH:MM
  type: 'en_ligne' | 'sur_site';
  lien?: string;
  adresse?: string;
  notes?: string;
  dureeMinutes?: number;
  
  interviewers?: string[];
  
  statut?: 'planifie' | 'confirme' | 'termine' | 'annule' | 'reporte';
  
  evaluation?: {
    competencesTechniques: number;  // 1-5
    softSkills: number;
    motivation: number;
    culturalFit: number;
    recommandation: 'embaucher' | 'peut_etre' | 'refuser' | 'second_entretien';
    commentaires?: string;
  };
}

export interface Entretien {
  id: string;
  candidatureId: string;
  candidatNom: string;
  candidatPrenom: string;
  offreTitre: string;
  type: 'phone' | 'video' | 'onsite';
  dateHeure: string;
  dureeMinutes: number;
  lieu?: string;
  lienVideo?: string;
  interviewers: string[];
  statut: 'planifie' | 'confirme' | 'termine' | 'annule' | 'reporte';
  notes?: string;
  evaluation?: {
    competencesTechniques: number;
    softSkills: number;
    motivation: number;
    culturalFit: number;
    recommandation: 'embaucher' | 'peut_etre' | 'refuser';
    commentaires?: string;
  };
  creeLe: string;
  misAJourLe: string;
}

export interface EntretienExtended extends Entretien {
  recordingUrl?: string;
  transcript?: string;
  
  aiSummary?: {
    resumeGeneral: string;
    themesDiscutes: string[];
    questionsClefs: string[];
    reponsesNotables: string[];
    signaleursAlerte: string[];
    pointsPositifs: string[];
    scoreGlobal: number;
    recommendationIA: 'EMBAUCHER' | 'REFUSER' | 'HESITER';
    confiance: number;
    genereLe: string;
  };
  
  evaluationDetaille?: {
    competencesTechniques: {
      score: number;
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
    scoreGlobal: number;
    recommandation: 'EMBAUCHER' | 'REFUSER' | 'HESITER' | 'SECOND_ENTRETIEN';
    commentaires: string;
  };
}

// ========================================
// 💼 OFFRES D'EMPLOI
// ========================================

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
  
  // Seuils de scoring automatiques
  seuilScoreCV?: number;
  seuilScoreQuiz?: number;
  
  datePublication: string;
  dateExpiration?: string;
  nombreCandidatures?: number;
  creePar?: string;
  creeLe: string;
  misAJourLe: string;
}

// ========================================
// 🔔 NOTIFICATIONS
// ========================================

export interface Notification {
  id: string;
  userId: string;
  type: 
    | 'ENTRETIEN_PLANIFIE'
    | 'QUIZ_DISPONIBLE'
    | 'STATUT_CHANGE'
    | 'OFFRE_RECUE'
    | 'CANDIDATURE_RECUE';
  
  titre: string;
  message: string;
  lu: boolean;
  
  metadata?: {
    candidatId?: string;
    offreId?: string;
    entretienId?: string;
    quizId?: string;
    [key: string]: any;
  };
  
  creeLe: string;
}

// ========================================
// 🧠 SCORING IA
// ========================================

export interface ScoringDetails {
  cvAnalysis: {
    score: number;
    pointsForts: string[];
    pointsFaibles: string[];
    competencesMatchees: string[];
    competencesManquantes: string[];
    recommendation: 'ACCEPTER' | 'REFUSER' | 'HESITER';
    aiCommentaire: string;
    analyseLe: string;
  };
  
  quizAnalysis?: {
    score: number;
    bonnesReponses: number;
    totalQuestions: number;
    tempsEcouleSecondes: number;
    reponses: QuizReponse[];
    completeLe: string;
  };
  
  entretienAnalysis?: {
    score: number;
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

// ========================================
// 📊 CANDIDATURE (POUR LE SYSTÈME KANBAN)
// ========================================

export interface Candidature {
  id: string;
  offreId: string;
  offreTitre?: string;
  candidatId?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  cv?: string;
  lettreMotivation?: string;
  portfolio?: string;
  linkedin?: string;
  
  statut: 'nouveau' | 'en_revue' | 'preselectionne' | 'entretien' | 'offre' | 'accepte' | 'refuse';
  etape: 'Applied' | 'Screened' | 'Interviewed' | 'Offered' | 'Hired' | 'Rejected';
  
  notesRecruteur?: string;
  score?: number;
  dateEntretien?: string;
  typeEntretien?: 'phone' | 'video' | 'onsite';
  interviewers?: string[];
  
  historique: HistoriqueCandidature[];
  
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
  modifiePar?: string;
  action: 'statut_change' | 'note_ajoutee' | 'entretien_planifie' | 'offre_envoyee' | 'autre';
}

// ========================================
// 📈 ANALYTICS & STATISTIQUES
// ========================================

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
    quizEnAttente: number;
    quizComplete: number;
    entretien: number;
    offre: number;
    embauche: number;
    refuse: number;
  };
  recrutement?: {
    offresActives: number;
    candidaturesEnCours: number;
    entretiensASemaine: number;
    tauxConversion: number;
    delaiMoyenEmbauche: number;
    scoreMoyenCV: number;
    scoreMoyenQuiz: number;
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

export interface RecrutementAnalytics {
  periode: {
    debut: string;
    fin: string;
  };
  scoresMoyens: {
    cv: number;
    quiz: number;
    entretien: number;
    global: number;
  };
  tauxReussite: {
    cvVersQuiz: number;
    quizVersEntretien: number;
    entretienVersOffre: number;
    offreVersEmbauche: number;
    global: number;
  };
  delais: {
    cvVersQuiz: number;
    quizVersEntretien: number;
    entretienVersOffre: number;
    offreVersEmbauche: number;
    global: number;
  };
  competences: {
    recherchees: { nom: string; occurrences: number }[];
    trouvees: { nom: string; occurrences: number }[];
    matchRate: number;
  };
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
  tags?: string[];
}

// ========================================
// ⚙️ CONFIGURATION
// ========================================

export interface RecrutementConfig {
  scoring: {
    poidsCV: number;
    poidsQuiz: number;
    poidsEntretien: number;
    seuilPreselection: number;
    seuilEntretien: number;
    seuilOffre: number;
  };
  quiz: {
    dureeParDefautMinutes: number;
    nombreQuestionsMin: number;
    nombreQuestionsMax: number;
    seuilReussiteDefaut: number;
    delaiExpirationJours: number;
    autoGenerate: boolean;
  };
  entretiens: {
    dureesDisponibles: number[];
    delaiMinimumHeures: number;
    rappelAvantHeures: number;
    enregistrementAuto: boolean;
    transcriptionAuto: boolean;
  };
  ia: {
    provider: 'openai' | 'anthropic' | 'custom';
    modeleCVAnalysis: string;
    modeleQuizGeneration: string;
    modeleEntretienSummary: string;
    temperature: number;
    enabled: boolean;
  };
}

// ========================================
// 🔐 PERMISSIONS
// ========================================

export interface RecrutementPermissions {
  canViewAllCandidatures: boolean;
  canViewOwnCandidatures: boolean;
  canEditCandidatures: boolean;
  canDeleteCandidatures: boolean;
  canExportCandidatures: boolean;
  canViewScores: boolean;
  canEditScores: boolean;
  canViewAIAnalysis: boolean;
  canTriggerAIAnalysis: boolean;
  canCreateQuiz: boolean;
  canSendQuiz: boolean;
  canViewQuizResults: boolean;
  canScheduleEntretiens: boolean;
  canConductEntretiens: boolean;
  canViewEntretienRecordings: boolean;
  canEditEntretienEvaluations: boolean;
  canCreateOffres: boolean;
  canEditOffres: boolean;
  canDeleteOffres: boolean;
  canPublishOffres: boolean;
  canSendOffers: boolean;
  canHireCandidates: boolean;
  canRejectCandidates: boolean;
  canViewAnalytics: boolean;
  canExportReports: boolean;
  canManageConfig: boolean;
  canManageAISettings: boolean;
}

// ========================================
// 📋 AUTRES INTERFACES
// ========================================

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

export interface ApiResponse<T> {
  succes: boolean;
  data: T;
  erreur?: string;
}

// ========================================
// 🎯 TYPES UTILITAIRES
// ========================================

export type StatutCandidature = Candidature['statut'];
export type EtapeCandidature = Candidature['etape'];
export type TypeOffre = JobOffer['type'];
export type StatutOffre = JobOffer['statut'];
export type ModeTravail = JobOffer['modetravail'];
export type ScoreRange = 'EXCELLENT' | 'BON' | 'MOYEN' | 'FAIBLE';
export type QuizStatus = QuizSession['statut'];
export type RecommandationIA = 'EMBAUCHER' | 'REFUSER' | 'HESITER' | 'SECOND_ENTRETIEN';

// ========================================
// 📊 CONSTANTES
// ========================================

export const STATUT_CANDIDAT_LABELS: Record<Candidat['statut'], string> = {
  SOUMIS:          'Soumis',
  PRESELECTION:    'CV Analysé',
  QUIZ_EN_ATTENTE: 'Quiz Envoyé',
  QUIZ_COMPLETE:   'Quiz Complété',
  ENTRETIEN:       'Entretien',
  OFFRE:           'Offre',
  EMBAUCHE:        'Embauché',
  REFUSE:          'Refusé',
};

export const STATUT_CANDIDAT_COLORS: Record<Candidat['statut'], string> = {
  SOUMIS:          'blue',
  PRESELECTION:    'amber',
  QUIZ_EN_ATTENTE: 'indigo',
  QUIZ_COMPLETE:   'cyan',
  ENTRETIEN:       'purple',
  OFFRE:           'green',
  EMBAUCHE:        'green',
  REFUSE:          'red',
};

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

export const SCORE_RANGES: Record<ScoreRange, { min: number; max: number; color: string }> = {
  EXCELLENT: { min: 85, max: 100, color: 'green' },
  BON:       { min: 70, max: 84,  color: 'blue' },
  MOYEN:     { min: 50, max: 69,  color: 'amber' },
  FAIBLE:    { min: 0,  max: 49,  color: 'red' },
};

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
// 🔧 HELPER FUNCTIONS
// ========================================

export function formatDateFR(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function tempsEcouleDepuis(isoDate: string): string {
  const heures = Math.floor((Date.now() - new Date(isoDate).getTime()) / 3600000);
  if (heures < 24) return `${heures}h`;
  const jours = Math.floor(heures / 24);
  if (jours < 7) return `${jours}j`;
  return `${Math.floor(jours / 7)}sem`;
}

export function getScoreRange(score: number): ScoreRange {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'BON';
  if (score >= 50) return 'MOYEN';
  return 'FAIBLE';
}

export function calculerScoreTotal(
  scoreCV: number,
  scoreQuiz: number | null,
  scoreEntretien: number | null,
  poids: { cv: number; quiz: number; entretien: number } = { cv: 0.4, quiz: 0.3, entretien: 0.3 }
): number {
  if (!scoreQuiz && !scoreEntretien) {
    return Math.round(scoreCV);
  }
  
  if (!scoreEntretien) {
    const totalPoids = poids.cv + poids.quiz;
    return Math.round(
      (scoreCV * poids.cv + scoreQuiz! * poids.quiz) / totalPoids
    );
  }
  
  return Math.round(
    scoreCV * poids.cv +
    (scoreQuiz || 0) * poids.quiz +
    scoreEntretien * poids.entretien
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