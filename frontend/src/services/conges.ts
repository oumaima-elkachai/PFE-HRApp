// src/services/conges.ts
//
// ── Ce qui changeait tout ───────────────────────────────────────────
//
// Ce fichier posait son en-tête lui-même :
//
//     Authorization: `Bearer ${localStorage.getItem('token')}`
//
// La clé `'token'` n'existe pas. Les jetons sont rangés sous
// `terra.jetons`, dans un objet JSON — c'est `cognito.ts` qui les y
// écrit. `getItem('token')` rendait donc `null`, et chaque appel
// partait avec « Bearer null », que le serveur refusait en 401
// « Jeton invalide ou expiré ».
//
// C'était un reste d'avant Cognito, et il a survécu à la bascule parce
// que rien ne le reliait au reste : ce service appelait `fetch`
// directement, sans passer par l'instance `api`.
//
// ── Pourquoi passer par `api` plutôt que corriger la clé ────────────
//
// Corriger la clé aurait suffi aujourd'hui, et aurait recassé demain.
// L'instance `api` apporte quatre choses que ce fichier n'avait pas :
//
//   · `jetonValide()` — le bon jeton, et son renouvellement
//     silencieux quand il arrive à expiration ;
//   · la redirection vers /login sur un 401, au lieu d'une page qui
//     garde son affichage précédent ;
//   · `baseURL`, qui pointe vers l'API Gateway en production et vers
//     le proxy Vite en développement ;
//   · le dépaquetage de la réponse, identique partout.
//
// Les signatures et les types exportés ne changent pas : aucune page
// n'a à être modifiée.

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

  // Écrits par le serveur quand la demande porte une pièce jointe
  // (src/conges/demander.js). Ils manquaient ici, et la page les
  // lisait par « (c as any).justificatifKey » — un contournement qui
  // masquait justement l'oubli.
  justificatifKey?: string;
  justificatifNom?: string;
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

interface ReponseConge {
  succes: boolean;
  data: { conge: Conge; message: string };
}

/** Décision possible sur une demande — sous-ensemble des statuts */
export type DecisionConge = Extract<StatutConge, 'APPROUVE' | 'REFUSE'>;

export const congesService = {
  /**
   * La liste des congés.
   *
   * Sans paramètre : les siens pour un salarié, toute l'entreprise
   * pour la RH. C'est le serveur qui tranche, à partir de
   * `custom:employeId` — et non la page, qui n'a aucun moyen de
   * l'imposer.
   */
  async lister(params?: { employeId?: string; statut?: StatutConge }) {
    // `api` rend déjà le corps de la réponse : pas de `.data` d'axios
    // à retirer ici. Ce qui revient est bien `{ succes, data }`.
    return await api.get('/conges', { params }) as unknown as ReponseListeConges;
  },

  async demander(payload: {
    type: TypeConge;
    dateDebut: string;
    dateFin: string;
    motif?: string;
    /** Réservé à la RH, pour déposer au nom d'un employé */
    employeId?: string;
  }) {
    return await api.post('/conges', payload) as unknown as ReponseConge;
  },

  /**
   * Demande accompagnée d'une pièce jointe.
   *
   * On ne pose PAS `Content-Type`. Le navigateur doit l'écrire
   * lui-même, car il doit y glisser la frontière (« boundary ») qui
   * sépare les parties du corps. L'écrire à la main sans cette
   * frontière rend le corps illisible côté serveur.
   *
   * Avec axios, passer un `FormData` lui fait poser l'en-tête
   * complet, frontière comprise — à une condition : que l'en-tête ne
   * soit pas DÉJÀ posé. Or `api.ts` crée l'instance avec
   * `'Content-Type': 'application/json'` par défaut, et axios
   * respecte ce qu'on lui a dit.
   *
   * Le `undefined` ci-dessous efface ce défaut pour ce seul appel.
   * Sans lui, le fichier part annoncé comme du JSON et le serveur ne
   * voit aucune pièce jointe — sans erreur, ce qui est pire.
   */
  async demanderAvecPiece(donnees: FormData) {
    return await api.post('/conges', donnees, {
      headers: { 'Content-Type': undefined },
    }) as unknown as ReponseConge;
  },

  async traiter(id: string, statut: DecisionConge, commentaire?: string) {
    const reponse = await api.patch(`/conges/${id}`, { statut, commentaire });
    return reponse as unknown as ReponseConge;
  },

  /**
   * Le justificatif d'une demande, en binaire.
   *
   * `responseType: 'blob'` est indispensable : sans lui, axios essaie
   * de lire un PDF comme du texte et le corrompt silencieusement.
   */
  async justificatif(id: string) {
    const reponse = await api.get(`/conges/${id}/justificatif`, {
      responseType: 'blob',
    });
    return reponse as unknown as Blob;
  },
};