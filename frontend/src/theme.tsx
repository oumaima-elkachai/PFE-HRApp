// src/theme.tsx
//
// Choix du thème : clair, sombre, ou celui du système.
//
// Le fournisseur ne fait qu'une chose — poser data-theme sur <html> —
// et toutes les couleurs en découlent par theme.css. Il n'y a donc
// aucune liste de composants à tenir à jour : une page écrite demain
// bascule sans qu'on y pense.

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react';

export type Theme = 'clair' | 'sombre' | 'systeme';

const CLE = 'hrup-theme';

/** Lecture du choix mémorisé. Hors navigateur — ou si le stockage est
 *  refusé, ce qui arrive en navigation privée — on retombe sur le
 *  système plutôt que d'imposer le mode clair. */
function themeMemorise(): Theme {
  try {
    const v = localStorage.getItem(CLE);
    if (v === 'clair' || v === 'sombre' || v === 'systeme') return v;
  } catch { /* stockage indisponible */ }
  return 'systeme';
}

interface Contexte {
  theme: Theme;
  /** Le thème réellement appliqué : « systeme » y est déjà résolu. */
  effectif: 'clair' | 'sombre';
  definir: (t: Theme) => void;
  /** Fait tourner clair → sombre → système → clair. */
  suivant: () => void;
}

const Ctx = createContext<Contexte | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(themeMemorise);
  const [prefereSombre, setPrefereSombre] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  // Le système peut changer d'avis pendant la session — un portable qui
  // bascule au coucher du soleil. Sans cet écouteur, « systeme » ne
  // serait évalué qu'au chargement et mentirait le reste de la soirée.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const surChangement = (e: MediaQueryListEvent) => setPrefereSombre(e.matches);
    mq.addEventListener('change', surChangement);
    return () => mq.removeEventListener('change', surChangement);
  }, []);

  const effectif: 'clair' | 'sombre' =
    theme === 'systeme' ? (prefereSombre ? 'sombre' : 'clair') : theme;

  useEffect(() => {
    const racine = document.documentElement;

    // « systeme » RETIRE l'attribut au lieu d'écrire une valeur : c'est
    // ce qui laisse la règle @media de theme.css reprendre la main. Y
    // écrire « clair » ou « sombre » figerait le choix et le mot
    // « système » ne voudrait plus rien dire.
    if (theme === 'systeme') racine.removeAttribute('data-theme');
    else racine.setAttribute('data-theme', theme === 'sombre' ? 'dark' : 'light');

    try { localStorage.setItem(CLE, theme); } catch { /* sans gravité */ }
  }, [theme]);

  // La couleur de la barre du navigateur sur mobile. Sans elle, une
  // application sombre garde un bandeau clair en haut de l'écran.
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = effectif === 'sombre' ? '#141A18' : '#F6F7F4';
  }, [effectif]);

  const suivant = useCallback(() => {
    setTheme((t) => (t === 'clair' ? 'sombre' : t === 'sombre' ? 'systeme' : 'clair'));
  }, []);

  return (
    <Ctx.Provider value={{ theme, effectif, definir: setTheme, suivant }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return c;
}

// ── La bascule ──────────────────────────────────────────────────────
//
// Trois états, donc un bouton qui tourne plutôt qu'un interrupteur :
// un interrupteur à deux positions ne peut pas exprimer « suis le
// système », et c'est l'état par défaut.

export function BasculeTheme({ className = '' }: { className?: string }) {
  const { theme, effectif, suivant } = useTheme();

  const titre = theme === 'systeme'
    ? `Thème : système (${effectif}). Cliquer pour forcer le mode clair.`
    : theme === 'clair'
      ? 'Thème : clair. Cliquer pour le mode sombre.'
      : 'Thème : sombre. Cliquer pour suivre le système.';

  return (
    <button
      type="button"
      onClick={suivant}
      title={titre}
      aria-label={titre}
      className={'p-2 rounded-lg text-stone-500 hover:text-stone-800 '
        + 'hover:bg-stone-100 transition-colors ' + className}
    >
      {theme === 'clair' && <IconeSoleil />}
      {theme === 'sombre' && <IconeLune />}
      {theme === 'systeme' && <IconeEcran />}
    </button>
  );
}

const traits = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const IconeSoleil = () => (
  <svg {...traits}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
);

const IconeLune = () => (
  <svg {...traits}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const IconeEcran = () => (
  <svg {...traits}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </svg>
);