// src/services/employes.ts
//
// Fichier du FRONT. Rien à voir avec `src/employes/lister.js`, qui est
// un module du serveur.

import api from './api';

/** Champs modifiables d'une fiche salarié */
export interface FicheSalarie {
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  poste?: string;
  departement?: string;
  dateEmbauche?: string;
  salaireBrutMensuel?: number;
  heuresMensuelles?: number;
  chefDeFamille?: boolean;
  nbEnfants?: number;
  statut?: string;
  cin?: string;
  cinDelivreLe?: string;
  cinDelivreA?: string;
}

export const employesService = {
  creer: (fiche: FicheSalarie) => api.post('/employes', fiche),

  // Partial : la sortie des effectifs n'envoie que { statut }
  modifier: (id: string, champs: Partial<FicheSalarie>) =>
    api.patch(`/employes/${encodeURIComponent(id)}`, champs),

  // Réservé à la RH depuis le correctif de `lister.js` côté serveur :
  // un salarié reçoit un 403. Pour joindre un collègue, c'est
  // `GET /annuaire`.
  lister:   (params?: Record<string, string>) => api.get('/employes', { params }),
  detail:   (id: string)                      => api.get(`/employes/${id}`),
  archiver: (id: string)                      => api.delete(`/employes/${id}`),
};