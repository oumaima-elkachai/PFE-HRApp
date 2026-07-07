import api from './api';
import type { ApiResponse, User } from '../types';

interface ConnexionResponse {
  token: string;
  expiresIn: string;
  user: User;
}

export const authService = {
  connexion: (email: string, motDePasse: string) =>
    api.post<ApiResponse<ConnexionResponse>, ApiResponse<ConnexionResponse>>(
      '/auth/connexion', { email, motDePasse }
    ),

  inscription: (data: Partial<User> & { motDePasse: string }) =>
    api.post('/auth/inscription', data),

  profil: () => api.get('/auth/profil'),

  deconnexion: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};