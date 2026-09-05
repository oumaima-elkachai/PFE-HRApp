// src/services/conges.ts

import api from './api';
import type { StatutConge, TypeConge } from '../types/domaine';



export interface Conge {
  id: string;
  employeId: string;
  employeNom: string;
  type: TypeConge;
  dateDebut: string;
  dateFin: string;
  nbJours: number;
  motif?: string;
  statut: StatutConge;
  demandeLe: string;
  demandeParId?: string;
  traiteLe?: string;
  traitePar?: string;
  traiteParId?: string;
  commentaireRH?: string;
}

export interface SoldeConges {
  total: number;
  utilises: number;
  enAttente: number;
  restants: number;
  /** Solde si toutes les demandes en attente étaient accordées */
  previsionnels: number;
}

export interface ReponseListeConges {
  succes: boolean;
  data: {
    conges: Conge[];
    total: number;
    /** Renseigné uniquement pour un employé, pas pour la RH */
    solde?: SoldeConges;
  };
}

/** Décision possible sur une demande — sous-ensemble des statuts */
export type DecisionConge = Extract<StatutConge, 'APPROUVE' | 'REFUSE'>;



export const congesService = {
  lister: (params?: { employeId?: string; statut?: StatutConge }) =>
    api.get('/conges', { params }) as unknown as Promise<ReponseListeConges>,

  demander: (payload: {
    type: TypeConge;
    dateDebut: string;
    dateFin: string;
    motif?: string;
    employeId?: string;
  }) => api.post('/conges', payload),

  traiter: (id: string, statut: DecisionConge, commentaire?: string) =>
    api.patch(`/conges/${id}`, { statut, commentaire }),
};