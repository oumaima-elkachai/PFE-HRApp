// src/services/pointages.ts

import api from './api';

/** Type de segment ouvert ou fermé par un pointage. */
export type TypeSegment = 'TRAVAIL' | 'PAUSE_DEJEUNER' | 'PAUSE_CAFE';

/** Un segment de la journée : une plage continue d'un même type. */
export interface Segment {
  debut: string;
  fin: string | null;
  type: TypeSegment;
  methode?: 'QR' | 'FACIAL' | 'CORRECTION';
  biometrie?: { distance: number; aVerifier: boolean; apparence: string | null } | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceMetres?: number | null;
  aVerifier?: boolean;
  motifVerification?: string | null;
  dureeMs?: number | null;
}

/** Une journée. Les trois champs de l'ancien modèle sont conservés. */
export interface Journee {
  employeId: string;
  date: string;
  segments: Segment[];
  statut: 'EN_COURS' | 'TERMINE' | 'VIDE';
  heureArrivee: string | null;
  heureDepart: string | null;
  dureeMinutes: number;
  minutesPause: number;
  nbSegments: number;
  saisieRetroactive?: boolean;
  employeNom?: string;
}

/** Calculs dérivés renvoyés par le serveur après un pointage. */
export interface ResumeJournee {
  minutesTravaillees: number;
  minutesPause: number;
  minutesPrevues: number;
  ecartMinutes: number;
  minutesSupplementaires: number;
  estRetard: boolean;
  minutesRetard: number;
  minutesApresReference: number;
  enCours: boolean;
  pourcentage: number;
  horaire: {
    arrivee: string;
    depart: string;
    pauseMinutes: number;
    toleranceMinutes: number;
    joursOuvres: number[];
  };
}

/** Contexte du pointage : position et site, vérifiés côté serveur. */
export interface ContextePointage {
  latitude?: number;
  longitude?: number;
  precisionMetres?: number;
  siteCode?: string | null;
  /** Méthode d'attestation. Absente, le serveur retient « QR ». */
  methode?: 'QR' | 'FACIAL';
  /** Descripteurs faciaux, quand la méthode est « FACIAL ». */
  descripteurs?: number[][];
  /** Type de segment à ouvrir. Absent, le serveur ouvre du travail. */
  type?: TypeSegment;
  /** Durée du geste côté client, pour la comparaison des méthodes. */
  dureeMs?: number;
}

export type StatutCorrection = 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE';

/** Demande de correction pour un jour où le pointage a été oublié. */
export interface DemandeCorrection {
  id: string;
  employeId: string;
  employeNom: string;
  date: string;
  heureArriveeDeclaree: string;
  heureDepartDeclaree: string;
  motif: string;
  statut: StatutCorrection;
  demandeLe: string;
  decideLe: string | null;
  decidePar: string | null;
  commentaireRH: string | null;
}

export const pointagesService = {
  // Le corps est optionnel : un poste fixe sans caméra ni GPS continue
  // de pointer comme avant.
  arrivee: (contexte?: ContextePointage) =>
    api.post('/pointages/arrivee', contexte ?? {}),

  depart: (contexte?: ContextePointage) =>
    api.post('/pointages/depart', contexte ?? {}),

  /** Ouvre une pause. C'est la même route que l'arrivée : ce qui
   *  change est le type de segment, pas la nature de l'opération. */
  commencerPause: (type: 'PAUSE_DEJEUNER' | 'PAUSE_CAFE', contexte?: ContextePointage) =>
    api.post('/pointages/arrivee', { ...(contexte ?? {}), type }),

  /** Ferme la pause en cours — même route que le départ. */
  terminerPause: (contexte?: ContextePointage) =>
    api.post('/pointages/depart', contexte ?? {}),

  // Un employé ne voit que ses pointages ; la RH voit tout le monde, ou
  // un employé précis via employeId. Le filtrage est fait par le serveur.
  historique: (params?: { date?: string; mois?: string; employeId?: string }) =>
    api.get('/pointages', { params }),

  // Saisie rétroactive directe, réservée à la RH.
  creerRetroactif: (data: {
    employeId: string; date: string; heureArrivee: string; heureDepart: string;
  }) => api.post('/pointages/historique/create', data),

  // ── Oubli de pointage ──
  //
  // Le salarié déclare, la RH décide. Le pointage n'est écrit qu'à
  // l'acceptation : une demande en attente ne compte pas dans le mois.
  corrections: {
    demander: (data: {
      date: string; heureArrivee: string; heureDepart: string; motif: string;
    }) => api.post('/pointages/corrections', data),

    lister: (params?: { statut?: StatutCorrection | 'TOUTES' }) =>
      api.get('/pointages/corrections', { params }),

    decider: (id: string, data: { approuve: boolean; commentaire?: string }) =>
      api.post(`/pointages/corrections/${encodeURIComponent(id)}/decision`, data),
  },
};