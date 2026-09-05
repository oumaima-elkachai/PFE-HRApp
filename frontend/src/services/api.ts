// src/services/api.ts

import axios from 'axios';
import { jetonValide, effacerJetons } from './cognito';

// En développement, '/api' passe par le proxy Vite vers le serveur
// Express local. En production, l'URL pointe vers l'API Gateway.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30_000,
});

// Le jeton est récupéré à chaque requête, jamais mémorisé : jetonValide()
// le renouvelle silencieusement s'il est sur le point d'expirer.
api.interceptors.request.use(async (config) => {
  const jeton = await jetonValide();
  if (jeton) config.headers.Authorization = `Bearer ${jeton}`;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const statut = error.response?.status;

    // 401 : jeton absent, expiré ou rejeté par la passerelle.
    // Le renouvellement a déjà été tenté en amont — il ne reste qu'à
    // redemander une authentification.
    if (statut === 401) {
      effacerJetons();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    // 403 : jeton valide mais rôle insuffisant. Déconnecter serait
    // déroutant : l'utilisateur est bien identifié, il n'a simplement
    // pas les droits sur cette ressource.
    if (statut === 403) {
      console.warn('Accès refusé :', error.config?.url);
    }

    return Promise.reject(error.response?.data ?? { erreur: error.message });
  }
);

export default api;