// src/services/cognito.ts
//
// Authentification Cognito, sans bibliothèque supplémentaire.
//
// Le flux USER_PASSWORD_AUTH envoie le mot de passe au service Cognito
// sur une liaison chiffrée. Le flux SRP ne transmettrait jamais le mot
// de passe, même chiffré, mais impose un calcul cryptographique lourd
// qu'aucune implémentation légère ne fournit — d'où ce choix, activé
// uniquement en développement côté pool.

const REGION = import.meta.env.VITE_AWS_REGION ?? 'eu-west-3';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
const ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;

const CLE_JETONS = 'terra.jetons';

export interface Jetons {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Instant d'expiration en millisecondes */
  expireLe: number;
}

export interface UtilisateurCognito {
  sub: string;
  email: string;
  prenom: string;
  nom: string;
  role: 'RH' | 'EMPLOYE' | 'CANDIDAT';
  groupes: string[];
  employeId: string | null;
  departement: string | null;
}

// ── Appel bas niveau ───────────────────────────────────────────────

async function appelCognito(cible: string, corps: unknown) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${cible}`,
    },
    body: JSON.stringify(corps),
  });

  const donnees = await res.json();

  if (!res.ok) {
    throw new Error(traduireErreur(donnees.__type, donnees.message));
  }
  return donnees;
}

/** Messages Cognito traduits, sans révéler si un compte existe */
function traduireErreur(type?: string, message?: string): string {
  switch (type) {
    case 'NotAuthorizedException':
      return 'Adresse ou mot de passe incorrect';
    case 'UserNotFoundException':
      return 'Adresse ou mot de passe incorrect';
    case 'UserNotConfirmedException':
      return 'Compte non confirmé. Vérifiez votre boîte de réception.';
    case 'PasswordResetRequiredException':
      return 'Réinitialisation du mot de passe requise';
    case 'TooManyRequestsException':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'InvalidPasswordException':
      return 'Mot de passe trop faible : 8 caractères, majuscule, chiffre et symbole';
    case 'UsernameExistsException':
      return 'Un compte existe déjà avec cette adresse';
    case 'CodeMismatchException':
      return 'Code de confirmation invalide';
    case 'ExpiredCodeException':
      return 'Code expiré. Demandez-en un nouveau.';
    default:
      return message || 'Erreur d\'authentification';
  }
}

// ── Décodage du jeton ──────────────────────────────────────────────

/**
 * Lit la charge utile d'un JWT sans en vérifier la signature.
 *
 * La vérification revient au serveur : l'API Gateway rejette tout jeton
 * invalide avant d'atteindre l'application. Ce décodage ne sert qu'à
 * afficher le nom et adapter l'interface au rôle.
 */
function lireCharge(jwt: string): Record<string, any> {
  const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(json);
}

function normaliserGroupes(brut: unknown): string[] {
  if (!brut) return [];
  if (Array.isArray(brut)) return brut as string[];
  return String(brut).replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean);
}

export function utilisateurDepuisJeton(idToken: string): UtilisateurCognito {
  const c = lireCharge(idToken);
  const groupes = normaliserGroupes(c['cognito:groups']);

  const role: UtilisateurCognito['role'] =
    groupes.includes('RH') ? 'RH'
    : groupes.includes('EMPLOYE') ? 'EMPLOYE'
    : 'CANDIDAT';

  return {
    sub: c.sub,
    email: c.email,
    prenom: c.given_name || '',
    nom: c.family_name || '',
    role,
    groupes,
    employeId: c['custom:employeId'] || null,
    departement: c['custom:departement'] || null,
  };
}

// ── Stockage local ─────────────────────────────────────────────────

export function lireJetons(): Jetons | null {
  const brut = localStorage.getItem(CLE_JETONS);
  if (!brut) return null;
  try {
    return JSON.parse(brut) as Jetons;
  } catch {
    localStorage.removeItem(CLE_JETONS);
    return null;
  }
}

function ecrireJetons(j: Jetons) {
  localStorage.setItem(CLE_JETONS, JSON.stringify(j));
}

export function effacerJetons() {
  localStorage.removeItem(CLE_JETONS);
}

// ── Opérations ─────────────────────────────────────────────────────

export async function connexion(email: string, motDePasse: string): Promise<UtilisateurCognito> {
  const res = await appelCognito('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: motDePasse },
  });

  const r = res.AuthenticationResult;
  if (!r) throw new Error('Authentification incomplète');

  ecrireJetons({
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken,
    expireLe: Date.now() + r.ExpiresIn * 1000,
  });

  return utilisateurDepuisJeton(r.IdToken);
}

/** Inscription libre : réservée aux candidats, groupe attribué par Cognito */
export async function inscription(params: {
  email: string;
  motDePasse: string;
  prenom: string;
  nom: string;
}) {
  await appelCognito('SignUp', {
    ClientId: CLIENT_ID,
    Username: params.email,
    Password: params.motDePasse,
    UserAttributes: [
      { Name: 'email', Value: params.email },
      { Name: 'given_name', Value: params.prenom },
      { Name: 'family_name', Value: params.nom },
    ],
  });
}

export async function confirmerInscription(email: string, code: string) {
  await appelCognito('ConfirmSignUp', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function demanderReinitialisation(email: string) {
  await appelCognito('ForgotPassword', { ClientId: CLIENT_ID, Username: email });
}

export async function confirmerReinitialisation(
  email: string, code: string, nouveauMotDePasse: string
) {
  await appelCognito('ConfirmForgotPassword', {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: nouveauMotDePasse,
  });
}

/**
 * Renouvelle le jeton d'accès à partir du jeton de rafraîchissement.
 * Cognito ne renvoie pas de nouveau refreshToken : on conserve l'ancien.
 */
export async function rafraichir(): Promise<string | null> {
  const jetons = lireJetons();
  if (!jetons?.refreshToken) return null;

  try {
    const res = await appelCognito('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: jetons.refreshToken },
    });

    const r = res.AuthenticationResult;
    if (!r) return null;

    ecrireJetons({
      idToken: r.IdToken,
      accessToken: r.AccessToken,
      refreshToken: jetons.refreshToken,
      expireLe: Date.now() + r.ExpiresIn * 1000,
    });

    return r.IdToken;
  } catch {
    effacerJetons();
    return null;
  }
}

/**
 * Jeton valide pour l'appel courant, renouvelé si nécessaire.
 * La marge d'une minute évite d'envoyer un jeton qui expirerait
 * pendant le trajet réseau.
 */
export async function jetonValide(): Promise<string | null> {
  const jetons = lireJetons();
  if (!jetons) return null;

  if (Date.now() < jetons.expireLe - 60_000) return jetons.idToken;
  return rafraichir();
}

export function deconnexion() {
  effacerJetons();
}