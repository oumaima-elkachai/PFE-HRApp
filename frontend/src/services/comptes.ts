// src/services/comptes.ts
//
// Le compte de connexion d'un salarié : l'attribution de son adresse
// professionnelle, son invitation, et la désactivation.
//
// Trois routes, et une distinction qui porte tout le reste :
//
//   · `email`       — l'IDENTIFIANT de connexion, dans un domaine de
//                     l'entreprise ;
//   · `emailPerso`  — l'adresse personnelle, où l'on joint vraiment la
//                     personne. Jamais un identifiant.

import api from './api';

/** L'état du compte, tel que le serveur le nomme */
export type EtatCompte = 'SANS_COMPTE' | 'INVITE' | 'ACTIF' | 'DESACTIVE';

/** Comment les accès ont été transmis */
export type ModeEnvoi = 'COURRIEL' | 'A_REMETTRE';

export interface EtatCompteSalarie {
  etat: EtatCompte;
  email: string | null;
  emailPerso: string | null;
  /** L'adresse de connexion est encore une adresse personnelle */
  adressePersonnelle: boolean;
  inviteLe?: string | null;
  invitePar?: string | null;
  accesEnvoiA?: string | null;
  groupe?: string | null;
}

/**
 * Ce que rend une invitation.
 *
 * `motDePasseProvisoire` est TOUJOURS présent, même quand le courriel
 * est parti : si l'envoi se perd, la RH doit pouvoir transmettre les
 * accès sans tout recommencer.
 */
export interface AccesCrees {
  message: string;
  etat: EtatCompte;
  groupe: string;
  identifiant: string;
  motDePasseProvisoire: string;
  envoi: ModeEnvoi;
  envoyeA: string | null;
  raison: string | null;
  urlConnexion: string;
}

export interface AdresseAttribuee {
  message: string;
  email: string;
  emailPerso: string | null;
  ancienCompte: {
    email: string;
    etat: EtatCompte;
    avertissement: string;
  } | null;
}

const chemin = (id: string) => `/employes/${encodeURIComponent(id)}`;

export const comptesService = {
  /** L'état du compte d'un salarié */
  async etat(id: string) {
    const r = await api.get(`${chemin(id)}/compte`) as any;
    return (r?.data ?? r) as EtatCompteSalarie;
  },

  /**
   * Attribue une adresse professionnelle.
   *
   * Sans `email`, le serveur la fabrique : `prenom.nom@domaine`, avec
   * les homonymes. Avec, il vérifie qu'elle appartient bien à
   * l'entreprise et qu'elle est libre.
   */
  async attribuerAdresse(id: string, email?: string) {
    const r = await api.post(
      `${chemin(id)}/adresse-professionnelle`,
      email ? { email } : {},
    ) as any;
    return (r?.data ?? r) as AdresseAttribuee;
  },

  /** Crée le compte et engendre les accès */
  async inviter(id: string, groupe: 'EMPLOYE' | 'RH' = 'EMPLOYE') {
    const r = await api.post(`${chemin(id)}/invitation`, { groupe }) as any;
    return (r?.data ?? r) as AccesCrees;
  },

  /**
   * Ferme un compte.
   *
   * `email` permet de fermer un ANCIEN compte, resté sur l'adresse
   * d'avant la régularisation et qui n'est plus celle de la fiche.
   */
  async desactiver(id: string, email?: string) {
    const r = await api.delete(`${chemin(id)}/compte`, email ? { data: { email } } : undefined) as any;
    return (r?.data ?? r) as { message: string; etat: EtatCompte };
  },
};

/**
 * Le message d'une erreur venue du serveur.
 *
 * Les pages avalaient ces messages et affichaient « L'opération a
 * échoué », ce qui oblige à ouvrir l'onglet Réseau pour savoir quoi
 * corriger. Or le serveur dit précisément ce qui ne va pas : adresse
 * hors domaine, compte déjà actif, droit IAM manquant.
 */
export function messageErreur(e: unknown, quoi: string): string {
  const x = e as Record<string, any> | null;

  const duServeur = x?.response?.data?.erreur ?? x?.erreur ?? x?.data?.erreur;
  if (typeof duServeur === 'string' && duServeur.trim()) return duServeur;

  const code = x?.response?.status ?? x?.status ?? x?.statusCode;
  if (code === 401) return 'Votre session a expiré. Reconnectez-vous.';
  if (code === 403) return `${quoi} : accès refusé.`;
  if (code === 404) return `${quoi} : la fiche est introuvable.`;
  if (code === 409) return `${quoi} : l'opération entre en conflit avec l'état actuel.`;
  if (code === 429) return 'Trop de demandes. Réessayez dans quelques minutes.';
  if (code === 503) {
    return `${quoi} : le service d'authentification n'est pas joignable `
      + `(configuration Cognito ou droits AWS).`;
  }
  if (!x?.response && (x?.message === 'Network Error' || x?.code === 'ERR_NETWORK')) {
    return 'Le serveur ne répond pas. Vérifiez qu’il est démarré.';
  }
  return `${quoi} : ${x?.message ?? 'erreur inconnue'}.`;
}