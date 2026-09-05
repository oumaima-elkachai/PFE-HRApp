import api from './api';
import type { JobOffer } from '../types';

export interface ReponseOffres {
  succes: boolean;
  data: { offres: JobOffer[] };
}

export const offresService = {
  // Sans paramètre, le serveur renvoie les offres ACTIVE
  lister:      (statut?: string) => api.get('/offres', { params: statut ? { statut } : undefined }),
  obtenir:     (id: string)      => api.get(`/offres/${id}`),
  creer:       (data: Record<string, unknown>) => api.post('/offres', data),
  mettreAJour: (id: string, data: Record<string, unknown>) => api.put(`/offres/${id}`, data),
  supprimer:   (id: string)      => api.delete(`/offres/${id}`),
};