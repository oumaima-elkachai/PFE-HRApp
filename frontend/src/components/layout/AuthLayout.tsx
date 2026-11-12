// src/components/layout/AuthLayout.tsx
//
// Coquille commune aux écrans de connexion, d'inscription et de
// déconnexion. Trois pages qui se ressemblaient de loin mais
// divergeaient sur la palette, la langue et la structure : les faire
// partager un seul composant est ce qui garantit la cohérence.
//
// ── Ce qui a été retiré ────────────────────────────────────────────
//
// Le panneau portait un témoignage signé « Elena Rodriguez, People
// Lead at Bloom », avec sa citation. Personne, entreprise et propos
// inventés, présentés comme réels. Un juré qui cherche ce nom ne
// trouve rien, et c'est la crédibilité du travail qui tombe, pas celle
// du faux avis.
//
// La phrase « Join thousands of organizations » est partie pour la
// même raison : elle est fausse.
//
// À la place, ce que l'application fait pour chaque profil. Un
// argumentaire vérifiable vaut mieux qu'une recommandation fabriquée.
//
// ── Et ce qui a été corrigé ────────────────────────────────────────
//
// Les couleurs étaient écrites en dur — un vert #2D5C1A dans Login,
// un autre #4a7c59 ici, un crème #faf6f0 — donc hors de portée de la
// palette : ces écrans seraient restés verts sur une application
// devenue indigo, et clairs en mode sombre.

import { BasculeTheme } from '../../theme';
import { BasculeLangue, useI18n } from '../../i18n';

export default function AuthLayout({ titre, sousTitre, children, pied, retour }: {
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
  pied?: React.ReactNode;
  /**
   * Flèche de retour posée à gauche du titre — à droite en arabe, le
   * `flex` suit la direction du document. Optionnel : la connexion et
   * la déconnexion ne la passent pas et restent inchangées.
   */
  retour?: React.ReactNode;
}) {
  const { t } = useI18n();

  const ARGUMENTS = [
    [t('login.arg1.t'), t('login.arg1.d')],
    [t('login.arg2.t'), t('login.arg2.d')],
    [t('login.arg3.t'), t('login.arg3.d')],
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-50">

      {/* Les deux bascules restent accessibles avant la connexion :
          quelqu'un qui ne lit pas le français doit pouvoir changer de
          langue sans avoir à entrer d'abord. */}
      <div className="fixed top-4 end-4 flex items-center gap-2 z-10">
        <BasculeLangue />
        <BasculeTheme />
      </div>

      <div className="w-full max-w-5xl flex min-h-150 overflow-hidden
        bg-surface rounded-3xl border border-stone-200 shadow-xl">

        {/* ── Panneau de présentation ── */}
        <div className="w-[42%] p-10 flex-col justify-between hidden lg:flex
          bg-linear-to-br from-brand-600 via-brand-500 to-violet-500">

          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Marque />
            </span>
            <span className="text-white font-bold text-lg">HR UP</span>
          </div>

          <div>
            <h1 className="text-white font-bold text-3xl leading-tight mb-3">
              {t('login.argTitre')}
            </h1>
            <p className="text-white/75 text-sm leading-relaxed mb-8">
              {t('login.argTexte')}
            </p>

            <div className="space-y-3">
              {ARGUMENTS.map(([profil, description]) => (
                <div
                  key={profil}
                  className="rounded-xl p-3.5 bg-white/10 border border-white/15 backdrop-blur-sm"
                >
                  <div className="text-white text-xs font-bold mb-1">{profil}</div>
                  <p className="text-white/75 text-xs leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/55 text-[10px]">
            HR UP · Tunis · {new Date().getFullYear()}
          </p>
        </div>

        {/* ── Panneau de saisie ── */}
        <div className="flex-1 p-8 sm:p-10 flex flex-col justify-center">

          {/* Le logo réapparaît sur petit écran, où le panneau coloré
              disparaît : sans lui, la page n'est plus identifiable. */}
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center
              bg-linear-to-br from-brand-500 to-violet-500">
              <Marque />
            </span>
            <span className="font-bold text-lg text-stone-800">HR UP</span>
          </div>

          <div className="mb-6 flex items-start gap-3">
            {retour}
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-stone-800">{titre}</h2>
              {sousTitre && <p className="text-sm text-stone-500 mt-1">{sousTitre}</p>}
            </div>
          </div>

          {children}

          {pied && <div className="mt-5">{pied}</div>}
        </div>
      </div>
    </div>
  );
}

export function Marque({ taille = 17 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true">
      <path d="M3 17h18" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
      <path d="M7.5 17h9" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="17" cy="8.5" r="2.4" fill="#fff" />
    </svg>
  );
}

// Exporté pour que les trois pages partagent exactement les mêmes
// classes de champ, sans les recopier.
export const CHAMP_AUTH =
  'w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl '
  + 'text-stone-800 placeholder-stone-400 '
  + 'focus:outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 '
  + 'transition-colors';

export const CHAMP_AUTH_ICONE =
  'w-full ps-10 pe-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl '
  + 'text-stone-800 placeholder-stone-400 '
  + 'focus:outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 '
  + 'transition-colors';