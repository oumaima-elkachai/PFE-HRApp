import { JobOffer } from '@/types';
import api from './api';

export const offresService = {
  lister:      (statut?: string) => api.get('/offres', { params: statut ? { statut } : undefined }),
  obtenir:     (id: string)      => api.get(`/offres/${id}`),
  creer:       (data: Record<string, unknown>) => api.post('/offres', data),
  mettreAJour: (id: string, data: Record<string, unknown>) => api.put(`/offres/${id}`, data),
  supprimer:   (id: string)      => api.delete(`/offres/${id}`),
   // ✅ AJOUT POUR CÔTÉ CANDIDAT


publiques: () =>
  api.get<JobOffer[]>('/offres/publiques'),
};