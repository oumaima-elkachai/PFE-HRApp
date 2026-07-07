import api from './api';

export const employesService = {
  lister:   (params?: Record<string, string>) => api.get('/employes', { params }),
  detail:   (id: string)                      => api.get(`/employes/${id}`),
  creer:    (data: Record<string, unknown>)   => api.post('/employes', data),
  modifier: (id: string, data: Record<string, unknown>) => api.put(`/employes/${id}`, data),
  archiver: (id: string)                      => api.delete(`/employes/${id}`),
};