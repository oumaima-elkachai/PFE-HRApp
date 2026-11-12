// src/services/quiz.ts

import api from './api';

export interface QuestionQuiz {
  id: string;
  type: 'QCM' | 'TEXTE';
  question: string;
  options?: string[];
  points: number;
  competenceEvaluee?: string;
}

export interface QuizCandidat {
  id: string;
  titre: string;
  offreTitre: string;
  dureeMinutes: number;
  seuilPassage: number;
  questions: QuestionQuiz[];
}

export interface SessionQuiz {
  id: string;
  debutLe: string;
  expireLe: string;
  /** Vrai si une session ouverte a été reprise après un rafraîchissement */
  reprise: boolean;
}

export interface ScoreCompetence {
  nom: string;
  score: number;
}

export interface ResultatQuiz {
  scoreObtenu: number;
  seuilPassage: number;
  reussi: boolean;
  questionsRepondues: number;
  nombreQuestions: number;
  dureeReelleMinutes: number;
  horsDelai: boolean;
  competences: ScoreCompetence[];
}

export interface ReponseCandidat {
  questionId: string;
  reponse: string;
}

export const quizService = {
  /** Liste des quiz à passer par le candidat connecté */
  mesQuiz: () => api.get('/candidat/quizzes'),

  /**
   * Ouvre une session. Appeler cette route deux fois ne crée pas deux
   * sessions : la seconde reprend la première, minuteur compris.
   */
  demarrer: (quizId: string) =>
    api.post(`/quiz/${quizId}/demarrer`) as unknown as Promise<{
      succes: boolean;
      data: { session: SessionQuiz; quiz: QuizCandidat; message?: string };
    }>,

  /**
   * Remonte les indicateurs d'intégrité pendant le passage.
   * Envoyée en cours de route plutôt qu'à la fin : un candidat qui
   * abandonne laisse quand même une trace.
   */
  signalerIntegrite: (
    sessionId: string,
    donnees: { nombreChangementsOnglet?: number; nombreCopierColler?: number }
  ) => api.put(`/quiz/sessions/${sessionId}/integrite`, donnees),

  soumettre: (
    sessionId: string,
    donnees: {
      reponses: ReponseCandidat[];
      nombreChangementsOnglet?: number;
      nombreCopierColler?: number;
    }
  ) =>
    api.post(`/quiz/sessions/${sessionId}/soumettre`, donnees) as unknown as Promise<{
      succes: boolean;
      data: { resultat: ResultatQuiz; message: string };
    }>,

  // ── Côté RH ──────────────────────────────────────────────────

  /** Sessions d'une candidature, avec le détail des corrections */
  sessionsCandidature: (candidatureId: string) =>
    api.get(`/quiz/sessions`, { params: { candidatureId } }),

  /** Détail complet d'une session, réponses corrigées incluses */
  session: (sessionId: string) => api.get(`/quiz/sessions/${sessionId}`),

  /** Génère un quiz pour une offre, via le modèle */
  generer: (offreId: string, candidatureId?: string) =>
    api.post('/quiz/generer', { offreId, candidatureId }),
};