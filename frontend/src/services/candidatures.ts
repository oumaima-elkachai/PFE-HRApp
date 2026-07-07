import api from './api';

export const candidaturesService = {
  lister:         ()                                        => api.get('/candidats'),
  parOffre:       (offreId: string)                        => api.get(`/candidats?offreId=${offreId}`),
  obtenir:        (id: string)                             => api.get(`/candidats/${id}`),
  creer:          (data: Record<string, unknown>)          => api.post('/candidats', data),
  changerStatut:  (id: string, statut: string, commentaire?: string) =>
    api.put(`/candidats/${id}/statut`, { statut, commentaire }),
  supprimer:      (id: string)                             => api.delete(`/candidats/${id}`),
};