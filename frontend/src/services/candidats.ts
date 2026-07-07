import api from './api';

export const candidatsService = {
  // ✅ Route séparée /mes-candidatures (pas /candidats/mes-candidatures)
  mesCandidatures: () => api.get('/mes-candidatures'),

  lister:        (params?: Record<string, string>) => api.get('/candidats', { params }),
  detail:        (id: string)                      => api.get(`/candidats/${id}`),
  soumettre:     (data: Record<string, unknown>)   => api.post('/candidats', data),
  changerStatut: (id: string, statut: string, commentaire?: string) =>
    api.put(`/candidats/${id}/statut`, { statut, commentaire }),
};