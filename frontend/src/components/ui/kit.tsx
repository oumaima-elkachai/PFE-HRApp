// src/components/ui/kit.tsx
//
// Les briques d'interface communes à l'espace candidat.
//
// ── Pourquoi ce fichier existe ──────────────────────────────────────
//
// StatCard était recopié dans quatre pages, Toast dans trois, Section
// dans deux. Chaque copie avait dérivé : des bordures différentes, des
// durées d'affichage différentes, un Toast qui débordait sur
// téléphone. Une seule définition supprime la dérive.
//
// ── La palette ──────────────────────────────────────────────────────
//
// Quatre tons portent le sens commun à toute l'application : brand
// pour ce qui va bien, amber pour ce qui attend, red pour ce qui est
// refusé, stone pour le neutre.
//
// Trois tons de plus distinguent les natures de rendez-vous, et
// seulement elles : un entretien n'est pas un quiz. Ils sont déclarés
// ici plutôt qu'écrits à la main dans chaque page, parce que c'est
// comme ça qu'un violet devient trois violets différents.
//
// Aucun code hexadécimal n'est écrit ailleurs que dans `pastille`, où
// une couleur de fond doit être calculée au rendu (les cases du
// calendrier). Partout ailleurs, les classes Tailwind.

import { useEffect } from 'react';

export const ACCENT = '#4F46E5';

export interface Ton {
  bg: string;
  text: string;
  barre: string;
  bord: string;
  pastille: string;
}

export const TONS: Record<string, Ton> = {
  brand:  { bg: 'bg-brand-500/10', text: 'text-brand-texte',  barre: 'bg-brand-500',  bord: 'border-brand-500/30', pastille: '#4F46E5' },
  amber:  { bg: 'bg-amber-50',     text: 'text-amber-600',    barre: 'bg-amber-400',  bord: 'border-amber-200',    pastille: '#f59e0b' },
  red:    { bg: 'bg-red-50',       text: 'text-red-500',      barre: 'bg-red-400',    bord: 'border-red-200',      pastille: '#ef4444' },
  stone:  { bg: 'bg-stone-100',    text: 'text-stone-500',    barre: 'bg-stone-300',  bord: 'border-stone-100',    pastille: '#a8a29e' },

  // Natures de rendez-vous, et rien d'autre.
  violet: { bg: 'bg-purple-50',    text: 'text-purple-600',   barre: 'bg-purple-400', bord: 'border-purple-200',   pastille: '#a855f7' },
  bleu:   { bg: 'bg-blue-50',      text: 'text-blue-600',     barre: 'bg-blue-400',   bord: 'border-blue-200',     pastille: '#3b82f6' },
};

export const ton = (nom: string): Ton => TONS[nom] ?? TONS.stone;

/** La carte de base. Toute surface posée sur le fond passe par là. */
export const CARTE = 'bg-surface rounded-2xl shadow-sm border border-stone-100';

/** Le champ de saisie de base. */
export const CHAMP =
  'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

// ── En-tête de page ─────────────────────────────────────────────────

export function EnTete({ fil, titre, sousTitre, children }: {
  /** Fil d'Ariane : le dernier élément est mis en avant. */
  fil: string[];
  titre: string;
  sousTitre?: React.ReactNode;
  /** Boutons et champs alignés à droite, en dessous sur téléphone. */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-stone-200">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
        <div className="min-w-0">
          <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center flex-wrap">
            {fil.map((element, i) => (
              <span key={element} className="flex items-center gap-2">
                {i > 0 && <ChevronSeparateur />}
                <span className={i === fil.length - 1 ? 'text-brand-texte font-semibold' : ''}>
                  {element}
                </span>
              </span>
            ))}
          </nav>

          <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">{titre}</h2>
          {sousTitre && <p className="text-stone-500 mt-1 text-sm">{sousTitre}</p>}
        </div>

        {children && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronSeparateur() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ── Indicateur ──────────────────────────────────────────────────────

export function StatCard({
  icon: Icone, label, value, sub, tonalite = 'brand', alerte, onClick, actif, delai = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  /** Une clé de TONS. */
  tonalite?: string;
  /** Entoure la carte : sert à signaler ce qui demande une action. */
  alerte?: boolean;
  onClick?: () => void;
  actif?: boolean;
  /** Décalage d'apparition, en millisecondes. */
  delai?: number;
}) {
  const t = ton(tonalite);
  const Balise = onClick ? 'button' : 'div';

  return (
    <Balise
      onClick={onClick}
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter ${onClick ? 'hrup-carte cursor-pointer' : ''} bg-surface rounded-2xl shadow-sm border p-5 text-start w-full ${
        actif ? 'border-brand-500 ring-1 ring-brand-500/20'
          : alerte ? 'border-amber-200 ring-1 ring-amber-100'
          : 'border-stone-100'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${t.bg}`}>
        <Icone className={`w-4 h-4 ${t.text}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${t.text}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </Balise>
  );
}

// ── Toast ───────────────────────────────────────────────────────────
//
// Pleine largeur sur téléphone, ancré à droite ensuite. L'ancienne
// version gardait `min-w-70` à toutes les tailles et dépassait de
// l'écran sur un téléphone étroit.

export function Toast({ message, onClose, duree = 3500 }: {
  message: string;
  onClose: () => void;
  duree?: number;
}) {
  useEffect(() => {
    const minuteur = setTimeout(onClose, duree);
    return () => clearTimeout(minuteur);
  }, [onClose, duree]);

  return (
    <div className="fixed top-4 start-4 end-4 sm:start-auto sm:top-6 sm:end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-start gap-3 sm:max-w-md">
        <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
        <p className="text-sm font-medium flex-1 leading-relaxed">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white shrink-0" aria-label="Fermer">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────

export function Section({ icone: Icone, titre, compteur, action, children }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  compteur?: number;
  /** Lien aligné à droite du titre : « tout voir », par exemple. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2 min-w-0">
          <Icone className="w-4 h-4 text-brand-texte shrink-0" />
          <span className="truncate">{titre}</span>
          {compteur != null && compteur > 0 && (
            <span className="text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full shrink-0">
              {compteur}
            </span>
          )}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── État vide ───────────────────────────────────────────────────────

export function Vide({ icone: Icone, message, detail, action }: {
  icone: React.ComponentType<{ className?: string }>;
  message: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${CARTE} p-10 sm:p-12 text-center`}>
      <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
        <Icone className="w-5 h-5 text-stone-300" />
      </div>
      <p className="text-sm font-bold text-stone-800">{message}</p>
      {detail && <p className="text-xs text-stone-500 mt-1">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Squelette de chargement ─────────────────────────────────────────

export function Squelette({ nombre = 3, hauteur = 'h-24' }: {
  nombre?: number;
  hauteur?: string;
}) {
  return (
    <div className="space-y-3">
      {[...Array(nombre)].map((_, i) => (
        <div key={i} className={`${hauteur} rounded-2xl bg-stone-50 animate-pulse`} />
      ))}
    </div>
  );
}

// ── Jauge ───────────────────────────────────────────────────────────

export function Jauge({ valeur, tonalite = 'brand', hauteur = 'h-2', seuil }: {
  /** De 0 à 100. */
  valeur: number;
  tonalite?: string;
  hauteur?: string;
  /** Trait vertical sur la jauge : « 58 » seul ne dit pas si c'est loin. */
  seuil?: number;
}) {
  const t = ton(tonalite);
  const borne = Math.max(0, Math.min(100, valeur));

  return (
    <div className={`relative ${hauteur} bg-stone-100 rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${t.barre}`}
        style={{ width: `${borne}%` }}
      />
      {seuil != null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-stone-500"
          style={{ left: `${Math.max(0, Math.min(100, seuil))}%` }}
          title={`Seuil : ${seuil} %`}
        />
      )}
    </div>
  );
}

// ── Anneau de progression ───────────────────────────────────────────
//
// Un cercle là où une barre ferait une ligne de plus. Sert pour la
// complétude du profil, où le chiffre compte autant que la forme.

export function Anneau({
  valeur, taille = 72, epaisseur = 6, tonalite = 'brand',
  couleur, piste, children,
}: {
  valeur: number;
  taille?: number;
  epaisseur?: number;
  tonalite?: string;
  /** Couleur de l'arc. Sur un fond coloré, la tonalité ne contraste
   *  plus : le bandeau d'accueil passe du blanc. */
  couleur?: string;
  /** Couleur du cercle de fond, même raison. */
  piste?: string;
  children?: React.ReactNode;
}) {
  const t = ton(tonalite);
  const borne = Math.max(0, Math.min(100, valeur));
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} className="-rotate-90">
        <circle
          cx={taille / 2} cy={taille / 2} r={rayon}
          fill="none" strokeWidth={epaisseur}
          stroke={piste}
          className={piste ? undefined : 'stroke-stone-100'}
        />
        <circle
          cx={taille / 2} cy={taille / 2} r={rayon}
          fill="none" strokeWidth={epaisseur} strokeLinecap="round"
          stroke={couleur ?? t.pastille}
          strokeDasharray={circonference}
          strokeDashoffset={circonference * (1 - borne / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,0.61,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ?? (
          <span className={`text-sm font-bold ${t.text}`}>{Math.round(borne)}%</span>
        )}
      </div>
    </div>
  );
}