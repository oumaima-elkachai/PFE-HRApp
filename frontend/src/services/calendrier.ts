import api from './api';

export const calendrierService = {
  lister:    (params?: Record<string, string>) => api.get('/evenements', { params }),
  creer:     (data: Record<string, unknown>) => api.post('/evenements', data),
  modifier:  (id: string, data: Record<string, unknown>) => api.put(`/evenements/${id}`, data),
  supprimer: (id: string) => api.delete(`/evenements/${id}`),
};