import api from './api';

export const candidatsService = {
  mesCandidatures: () => api.get('/mes-candidatures'),
  lister:        (params?: Record<string, string>) => api.get('/candidatures', { params }),
  detail:        (id: string)                      => api.get(`/candidatures/${id}`),
  changerStatut: (id: string, statut: string, commentaire?: string) =>
    api.put(`/candidatures/${id}/statut`, { statut, commentaire }),
};