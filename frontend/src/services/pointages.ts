import api from './api';

export const pointagesService = {
  arrivee:    ()                                      => api.post('/pointages/arrivee'),
  depart:     ()                                      => api.post('/pointages/depart'),
  historique: (params?: Record<string, string>)       => api.get('/pointages', { params }),
};