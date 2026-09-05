import api from './api';

export const facturesService = {
  lister:  (params?: Record<string, string | number>) => api.get('/factures', { params }),
  generer: (data: Record<string, unknown>)            => api.post('/factures', data),

  supprimer:(id: string)                               => api.delete(`/factures/${id}`),

  telechargerPDF: (id: string) =>
    api.get(`/factures/pdf/${id}`, { responseType: 'blob' }),
};

