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
      // Cognito réutilise ce type pour deux situations sans rapport :
      // un mot de passe faux, et une session de défi expirée. Sans ce
      // test, le salarié qui met trop longtemps à choisir son mot de
      // passe lit « Adresse ou mot de passe incorrect » — et recommence
      // à saisir une adresse qui n'a jamais été en cause.
      if (/session/i.test(message ?? '')) {
        return 'Session expirée. Reconnectez-vous avec le mot de passe reçu par courriel.';
      }
      // Cognito refuse de réinitialiser le mot de passe d'un compte
      // encore en FORCE_CHANGE_PASSWORD. C'est exactement le cas d'un
      // salarié invité qui n'a jamais activé son compte et clique sur
      // « mot de passe oublié » : sans ce test, il lisait « adresse ou
      // mot de passe incorrect », ce qui est faux et ne lui dit rien.
      if (/current state/i.test(message ?? '')) {
        return "Ce compte n'est pas encore activé. Connectez-vous avec le mot de "
          + 'passe temporaire reçu par courriel, puis choisissez le vôtre.';
      }
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
    case 'InvalidParameterException':
      if (/verified email|no registered/i.test(message ?? '')) {
        return "Aucune adresse vérifiée n'est associée à ce compte. "
          + 'Demandez aux ressources humaines de vous renvoyer une invitation.';
      }
      return message || "Donnée refusée par le service d'authentification";
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

/**
 * Ce que peut rendre une tentative de connexion.
 *
 * Un compte créé par la RH avec `AdminCreateUser` reçoit un mot de
 * passe temporaire. À sa première connexion, Cognito ne renvoie PAS de
 * jetons : il renvoie un défi `NEW_PASSWORD_REQUIRED` et une session.
 * La version précédente lisait `AuthenticationResult`, le trouvait
 * absent et levait « Authentification incomplète » — autrement dit,
 * aucun salarié invité ne pouvait entrer.
 */
export type ResultatConnexion =
  | { etat: 'connecte'; utilisateur: UtilisateurCognito }
  | { etat: 'motDePasseAChoisir'; session: string; email: string };

/** Enregistre les jetons d'une réponse d'authentification. */
function accepterJetons(r: any): UtilisateurCognito {
  ecrireJetons({
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken,
    expireLe: Date.now() + r.ExpiresIn * 1000,
  });
  return utilisateurDepuisJeton(r.IdToken);
}

export async function connexion(
  email: string,
  motDePasse: string,
): Promise<ResultatConnexion> {
  const res = await appelCognito('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: motDePasse },
  });

  if (res.AuthenticationResult) {
    return { etat: 'connecte', utilisateur: accepterJetons(res.AuthenticationResult) };
  }

  if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    // Cognito renvoie l'adresse réelle dans les paramètres du défi :
    // c'est elle qu'attend `RespondToAuthChallenge`, et elle peut
    // différer de ce qui a été saisi quand le pool est insensible à la
    // casse.
    let reelle = email;
    try {
      reelle = JSON.parse(res.ChallengeParameters?.userAttributes ?? '{}').email || email;
    } catch { /* paramètres absents : l'adresse saisie fera l'affaire */ }

    return { etat: 'motDePasseAChoisir', session: res.Session, email: reelle };
  }

  // Un autre défi — MFA, par exemple — n'est pas géré ici. Le dire
  // plutôt que de laisser « Authentification incomplète », qui
  // n'apprend rien à personne.
  throw new Error(
    res.ChallengeName
      ? `Cette connexion demande une étape non prise en charge (${res.ChallengeName}).`
      : 'Authentification incomplète',
  );
}

/**
 * Termine une première connexion en posant le mot de passe choisi.
 *
 * La session du défi ne vaut que quelques minutes et ne sert qu'une
 * fois : passé ce délai, il faut se reconnecter avec le mot de passe
 * temporaire pour en obtenir une nouvelle.
 */
export async function repondreDefi(
  session: string,
  email: string,
  nouveauMotDePasse: string,
): Promise<UtilisateurCognito> {
  const res = await appelCognito('RespondToAuthChallenge', {
    ClientId: CLIENT_ID,
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    Session: session,
    ChallengeResponses: {
      USERNAME: email,
      NEW_PASSWORD: nouveauMotDePasse,
    },
  });

  if (!res.AuthenticationResult) {
    throw new Error("Le mot de passe n'a pas pu être enregistré. Reconnectez-vous.");
  }
  return accepterJetons(res.AuthenticationResult);
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