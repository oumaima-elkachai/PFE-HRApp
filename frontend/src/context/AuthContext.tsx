// src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as cognito from '../services/cognito';
import type { UtilisateurCognito } from '../services/cognito';

interface AuthContextType {
  user: UtilisateurCognito | null;
  loading: boolean;
  connexion: (email: string, motDePasse: string) => Promise<UtilisateurCognito>;
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
    const utilisateur = await cognito.connexion(email.trim().toLowerCase(), motDePasse);
    setUser(utilisateur);
    return utilisateur;
  }, []);

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