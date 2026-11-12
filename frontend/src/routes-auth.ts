// src/routes-auth.ts
//
// Les routes de sortie et de profil, définies une seule fois et
// partagées par la barre latérale et l'en-tête. Deux constantes dans
// deux fichiers finissent toujours par diverger : un bouton mène à la
// page de déconnexion, l'autre renvoie à l'écran de connexion, et
// personne ne comprend pourquoi le comportement change selon l'endroit
// cliqué.

/** ⚠️ À ADAPTER si ta page de déconnexion est sur un autre chemin. */
export const ROUTE_DECONNEXION = '/logout';

/**
 * Où mène le bouton d'identité de l'en-tête, selon le rôle.
 *
 * ⚠️ Ton application n'a pas de route de profil pour la RH : seules
 * `/employe/profile` et `/candidat/profile` existent. La RH est donc
 * envoyée vers celle du salarié. Si cette route est réservée au rôle
 * EMPLOYE par un garde, la RH sera rejetée : crée alors une route
 * `/admin/profil` et change la ligne ci-dessous.
 */
export const ROUTES_PROFIL: Record<string, string> = {
  RH: '/employe/profile',
  EMPLOYE: '/employe/profile',
  CANDIDAT: '/candidat/profile',
};

/** La route de profil du rôle, avec un repli sûr. */
export const routeProfil = (role?: string | null) =>
  ROUTES_PROFIL[String(role ?? '')] ?? ROUTES_PROFIL.CANDIDAT;