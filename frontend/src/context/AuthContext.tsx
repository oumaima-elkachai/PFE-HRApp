// src/context/AuthContext.tsx
//
// ⚠ ATTENTION — ce fichier portait un CONFLIT DE FUSION GIT non résolu.
//
// Celui que tu m'as envoyé contenait encore les marqueurs :
//
//     <<<<<<< HEAD
//     ...
//     =======
//     ...
//     >>>>>>> 79c54a4a0269b3e2b221230690fe291ef378d2c9
//
// Deux versions s'y affrontaient : la branche Cognito (`UtilisateurCognito`,
// `lireJetons`, `rafraichir`) et une branche plus ancienne fondée sur
// `User` et un `token` venant de `../types`. Un fichier dans cet état ne
// compile pas.
//
// Ce fichier-ci est la branche Cognito, résolue, plus le nécessaire pour
// la première connexion. **Si tu as déjà résolu le conflit de ton côté,
// compare avant d'écraser** : seules deux choses changent par rapport à
// la branche HEAD d'origine, et elles sont signalées plus bas.
//
// ── Ce qui change ──────────────────────────────────────────────────
//
// 1. `connexion` ne rend plus un utilisateur mais un `ResultatConnexion` :
//    soit la session est ouverte, soit Cognito réclame un mot de passe.
//    TypeScript signalera chaque endroit qui doit s'adapter — c'est
//    voulu, pour qu'aucun appel ne soit oublié.
//
// 2. `choisirMotDePasse` termine une première connexion.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as cognito from '../services/cognito';
import type { UtilisateurCognito, ResultatConnexion } from '../services/cognito';

interface AuthContextType {
  user: UtilisateurCognito | null;
  loading: boolean;
  /**
   * Ouvre une session, ou annonce que Cognito réclame un mot de passe.
   *
   * Un compte créé par la RH reçoit un mot de passe temporaire : à sa
   * première connexion, Cognito ne délivre aucun jeton et répond par un
   * défi. C'est le cas de TOUS les salariés invités.
   */
  connexion: (email: string, motDePasse: string) => Promise<ResultatConnexion>;
  /** Termine une première connexion en posant le mot de passe choisi. */
  choisirMotDePasse: (
    session: string, email: string, nouveau: string,
  ) => Promise<UtilisateurCognito>;
  inscription: (p: { email: string; motDePasse: string; prenom: string; nom: string }) => Promise<void>;
  confirmerInscription: (email: string, code: string) => Promise<void>;
  motDePasseOublie: (email: string) => Promise<void>;
  reinitialiserMotDePasse: (email: string, code: string, nouveau: string) => Promise<void>;
  deconnexion: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UtilisateurCognito | null>(null);
  const [loading, setLoading] = useState(true);

  // Restauration de la session au chargement.
  // Le jeton est reconstruit depuis le stockage local puis renouvelé
  // s'il est expiré : inutile de redemander le mot de passe à chaque
  // rafraîchissement de page.
  useEffect(() => {
    (async () => {
      try {
        const jeton = await cognito.jetonValide();
        if (jeton) setUser(cognito.utilisateurDepuisJeton(jeton));
      } catch {
        cognito.effacerJetons();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connexion = useCallback(async (email: string, motDePasse: string) => {
    const resultat = await cognito.connexion(email.trim().toLowerCase(), motDePasse);

    // Tant que le défi dure, aucun utilisateur n'est posé : la session
    // n'est pas ouverte, et l'interface ne doit surtout pas croire le
    // contraire — elle laisserait passer vers le tableau de bord
    // quelqu'un qui n'a pas encore de jeton.
    if (resultat.etat === 'connecte') setUser(resultat.utilisateur);
    return resultat;
  }, []);

  const choisirMotDePasse = useCallback(
    async (session: string, email: string, nouveau: string) => {
      const utilisateur = await cognito.repondreDefi(session, email, nouveau);
      setUser(utilisateur);
      return utilisateur;
    },
    [],
  );

  const inscription = useCallback(
    async (p: { email: string; motDePasse: string; prenom: string; nom: string }) => {
      await cognito.inscription({ ...p, email: p.email.trim().toLowerCase() });
    },
    []
  );

  const confirmerInscription = useCallback(async (email: string, code: string) => {
    await cognito.confirmerInscription(email.trim().toLowerCase(), code);
  }, []);

  const motDePasseOublie = useCallback(async (email: string) => {
    await cognito.demanderReinitialisation(email.trim().toLowerCase());
  }, []);

  const reinitialiserMotDePasse = useCallback(
    async (email: string, code: string, nouveau: string) => {
      await cognito.confirmerReinitialisation(email.trim().toLowerCase(), code, nouveau);
    },
    []
  );

  const deconnexion = useCallback(() => {
    cognito.deconnexion();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        connexion,
        choisirMotDePasse,
        inscription,
        confirmerInscription,
        motDePasseOublie,
        reinitialiserMotDePasse,
        deconnexion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
};