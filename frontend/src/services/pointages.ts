import api from './api';

export const pointagesService = {
  arrivee: () => api.post('/pointages/arrivee'),
  depart:  () => api.post('/pointages/depart'),

  // Un employé ne voit que ses pointages ; la RH voit tout le monde,
  // ou un employé précis via employeId. Le filtrage est fait par le serveur.
  historique: (params?: { date?: string; mois?: string; employeId?: string }) =>
    api.get('/pointages', { params }),

  // Saisie rétroactive, réservée à la RH
  creerRetroactif: (data: {
    employeId: string; date: string; heureArrivee: string; heureDepart: string;
  }) => api.post('/pointages/historique/create', data),
};