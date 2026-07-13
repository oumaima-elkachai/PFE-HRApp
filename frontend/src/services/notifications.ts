// src/services/notifications.ts
import api from './api';

export const notificationsService = {
  mesNotifications: () => api.get('/notifications/me'),
  marquerLue:       (id: string) => api.put(`/notifications/${id}/lue`),
  marquerToutesLues:() => api.put('/notifications/lire-tout'),
};