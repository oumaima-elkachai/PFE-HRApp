import api from './api';

export const candidaturesService = {
  lister:        ()                 => api.get('/candidatures'),
  parOffre:      (offreId: string)  => api.get('/candidatures', { params: { offreId } }),
  parStatut:     (statut: string)   => api.get('/candidatures', { params: { statut } }),
  classement:    (offreId: string)  => api.get(`/candidatures/ranking/${offreId}`),
  obtenir:       (id: string)       => api.get(`/candidatures/${id}`),
  changerStatut: (id: string, statut: string, commentaire?: string) =>
    api.put(`/candidatures/${id}/statut`, { statut, commentaire }),
};