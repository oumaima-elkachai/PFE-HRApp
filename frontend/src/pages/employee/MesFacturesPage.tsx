// src/pages/employee/MesFacturesPage.tsx
//
// Bulletins de salaire du salarié.
//
// Trois principes de conception :
//   1. Le net à payer du dernier bulletin se lit sans rien ouvrir : c'est
//      ce qu'on vient vérifier neuf fois sur dix.
//   2. Le passage du brut au net est présenté en cascade, ligne par ligne.
//      C'est la seule forme qu'un salarié peut recalculer lui-même.
//   3. Quand l'arithmétique du serveur ne se referme pas, la page le dit.
//      L'ancienne version affichait « 112,4 % du brut » sans broncher.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download, FileText, Calendar, AlertTriangle, Eye, ChevronRight, X,
  Wallet, Search, Clock, ShieldCheck, TrendingUp, Ticket, Minus, Plus, Equal,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { facturesService } from '../../services/factures';
import api from '../../services/api';

// ⚠️ SEULE LIGNE À ADAPTER si ton hook de traduction porte un autre nom.
import { useI18n, type Cle } from '../../i18n';

// ── Réglages ───────────────────────────────────────────────────────

const PAR_PAGE = 10;

// Le serveur soustrait déjà les retenues (absences, retards) du brut :
// `paie.js` calcule `brut = salaireBase + totalGains - totalRetenues`.
// Les redéduire ici compterait deux fois la même absence.
const RETENUES_DEJA_DANS_BRUT = true;

// Seuil d'alerte sur l'écart de recalcul, en dinars. Le millime est
// l'unité de la paie tunisienne : en dessous, c'est un arrondi.
const TOLERANCE_ECART = 0.001;

// ── Types ──────────────────────────────────────────────────────────

/**
 * Un souci est stocké sous forme de clé, pas de texte traduit.
 *
 * Traduire au moment de l'erreur obligerait `charger` à dépendre de `t` ;
 * si le fournisseur de traduction ne mémorise pas `t`, l'effet se
 * redéclencherait à chaque rendu — une boucle de requêtes sans fin.
 * Les messages venus du serveur passent par `texte`, faute de clé.
 */
type Souci = { cle: Cle } | { texte: string } | null;

interface Cotisations {
  cnss: number;
  irpp: number;
  css: number;
  total: number;
}

interface Facture {
  id: string;
  numero: string;
  mois: number;
  annee: number;
  periode?: string;
  moisLabel?: string;

  nbJoursOuvrables?: number;
  joursPresents?: number;
  joursAbsents?: number;
  heuresSupplementaires?: number;
  minutesRetard?: number;

  salaireBase: number;
  totalBrut?: number;
  gains?: Record<string, number>;
  retenues?: Record<string, number>;
  cotisations?: Cotisations;

  // Hors assiette de cotisations : remboursements de frais et bons.
  remboursements?: number;
  bons?: Record<string, number>;

  salaireNet: number;

  statut?: string;
  genereLe: string;
  pdfKey?: string;

  // Barème avec lequel CE bulletin a été produit, renvoyé par paie.js.
  // Sans lui, l'écran écrivait « CNSS 9,68 % » en dur et mentait le jour
  // où le taux changeait. Absent sur les bulletins émis avant son ajout,
  // d'où le repli sur les clés statiques.
  bareme?: Bareme;
}

interface Bareme {
  cnss?: { taux: number; plafondMensuel?: number };
  fraisProfessionnels?: { taux: number; plafondAnnuel: number };
  css?: { taux: number; seuilExoneration: number };
  famille?: {
    chefDeFamille: number; conjoint: number;
    parEnfant: number; nbEnfantsMax: number;
    enfantHandicape: number;
    enfantEtudiant: number; nbEtudiantsMax: number;
  };
  irpp?: { plafond: number | null; taux: number }[];
  source?: string;
  enVigueurDepuis?: string;
}

// ── Libellés des postes variables ──────────────────────────────────
// Le serveur envoie des dictionnaires ouverts : toute nouvelle prime
// apparaît dès qu'elle a une clé ici, sans toucher au reste du fichier.

const CLE_GAIN: Record<string, Cle> = {
  heuresSupplementaires: 'fa.gain.heuresSup',
  heuresWeekend: 'fa.gain.heuresWeekend',
  heuresFeries: 'fa.gain.heuresFeries',
  primes: 'fa.gain.primes',
  primeAnciennete: 'fa.gain.anciennete',
  primePonctualite: 'fa.gain.ponctualite',
  primeRendement: 'fa.gain.rendement',
  primeHandicap: 'fa.gain.handicap',
  primeChefFamille: 'fa.gain.chefFamille',
  primeEnfants: 'fa.gain.enfants',
};

const CLE_RETENUE: Record<string, Cle> = {
  absences: 'fa.retenue.absences',
  retards: 'fa.retenue.retards',
  avances: 'fa.retenue.avances',
};

const CLE_BON: Record<string, Cle> = {
  carburant: 'fa.bon.carburant',
  alimentaire: 'fa.bon.alimentaire',
  transport: 'fa.bon.transport',
};

/**
 * Libellé d'un poste de gain.
 *
 * Un bon soumis à cotisations arrive dans `gains` sous son propre nom
 * (« carburant »), pas sous un nom de prime : il faut donc chercher
 * dans les deux tables avant de se replier sur la clé brute.
 */
function libelleGain(k: string, t: (c: Cle) => string): string {
  const cle = CLE_GAIN[k] ?? CLE_BON[k];
  return cle ? t(cle) : k;
}

// ── Utilitaires ────────────────────────────────────────────────────

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const localeDe = (langue: string) => LOCALES[langue] ?? 'fr-FR';

// Le dinar se compte en millimes : trois décimales, toujours.
const tnd = (v?: number) => `${(v ?? 0).toFixed(3)} TND`;

const somme = (o?: Record<string, number>) =>
  Object.values(o ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

const nonVide = (o?: Record<string, number>) =>
  Object.entries(o ?? {}).filter(([, v]) => Number(v) > 0);

function moisNom(mois: number, annee: number, langue: string, court = false) {
  return new Intl.DateTimeFormat(localeDe(langue), {
    month: court ? 'short' : 'long',
    ...(court ? {} : { year: 'numeric' }),
  }).format(new Date(annee, Math.max(0, mois - 1), 1));
}

function dateCourte(iso: string, langue: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(localeDe(langue));
}

/**
 * Décompose un bulletin et vérifie que l'arithmétique se referme.
 *
 * `ecartNet` est le cœur du contrôle : s'il n'est pas nul, le net envoyé
 * par le serveur ne correspond pas à la somme de ses propres postes. On
 * l'affiche plutôt que de le masquer — un bulletin qui ne se recalcule
 * pas est un bulletin qu'on ne peut pas défendre.
 */
function decomposer(f: Facture) {
  const base = f.salaireBase ?? 0;
  const gains = somme(f.gains);
  const retenues = somme(f.retenues);
  const cotisations = f.cotisations?.total ?? 0;
  const horsAssiette = (f.remboursements ?? 0) + somme(f.bons);

  const brutCalcule = base + gains;
  const brut = f.totalBrut ?? brutCalcule;

  // Si le serveur a déjà retiré les retenues du brut, les soustraire une
  // seconde fois comptabiliserait deux fois la même absence.
  const retenuesADeduire = RETENUES_DEJA_DANS_BRUT ? 0 : retenues;
  const netSalarial = brut - retenuesADeduire - cotisations;
  const netAttendu = netSalarial + horsAssiette;

  const arrondi = (v: number) => Math.round(v * 1000) / 1000;

  return {
    base, gains, retenues, retenuesADeduire, cotisations, horsAssiette,
    brut, brutCalcule, netSalarial, netAttendu,
    ecartBrut: arrondi(brutCalcule - brut),
    ecartNet: arrondi(netAttendu - (f.salaireNet ?? 0)),
    // Part salariale du brut, remboursements et bons exclus : eux ne
    // viennent pas du brut, les inclure faisait dépasser les 100 %.
    partNet: brut > 0 ? Math.max(0, Math.min(100, (netSalarial / brut) * 100)) : 100,
  };
}

// ── Prélèvements et déductions ─────────────────────────────────────

/**
 * Les taux viennent du bulletin, pas du code.
 *
 * C'est le seul moyen d'éviter la constante dupliquée : tant que
 * l'écran écrit « 9,68 % » dans son propre fichier, il finit par
 * contredire le calcul. Quand le bulletin porte son barème, l'écran
 * l'affiche ; sinon il retombe sur les libellés statiques, pour les
 * bulletins émis avant que `paie.js` ne le renvoie.
 */
function PanneauPrelevements({ bareme, langue, t }: {
  bareme?: Bareme;
  langue: string;
  t: (c: Cle) => string;
}) {
  const nf = new Intl.NumberFormat(localeDe(langue));
  const pc = (v: number) =>
    new Intl.NumberFormat(localeDe(langue), {
      style: 'percent', maximumFractionDigits: 2,
    }).format(v);
  const dt = (v: number) => `${nf.format(v)} TND`;

  const f = bareme?.famille;

  const lignes: [Cle, string][] = bareme
    ? [
      ...(bareme.cnss ? [['fa.prel.cnss', pc(bareme.cnss.taux)] as [Cle, string]] : []),
      ...(bareme.css ? [[
        'fa.prel.css',
        `${pc(bareme.css.taux)} · ${t('fa.prel.exonereSous')} ${dt(bareme.css.seuilExoneration)}`,
      ] as [Cle, string]] : []),
      ...(bareme.irpp ? [[
        'fa.prel.irpp',
        `${nf.format(bareme.irpp.length)} ${t('fa.prel.tranches')}`,
      ] as [Cle, string]] : []),
      ...(bareme.fraisProfessionnels ? [[
        'fa.prel.frais',
        `${pc(bareme.fraisProfessionnels.taux)} · ${t('fa.prel.plafonne')} ${dt(bareme.fraisProfessionnels.plafondAnnuel)}`,
      ] as [Cle, string]] : []),
      ...(f ? ([
        ['fa.prel.chefFamille', dt(f.chefDeFamille)],
        ['fa.prel.conjoint', dt(f.conjoint)],
        ['fa.prel.enfant', `${dt(f.parEnfant)} · ${t('fa.prel.jusqua')} ${nf.format(f.nbEnfantsMax)}`],
        ['fa.prel.handicap', dt(f.enfantHandicape)],
        ['fa.prel.etudiant', `${dt(f.enfantEtudiant)} · ${t('fa.prel.jusqua')} ${nf.format(f.nbEtudiantsMax)}`],
      ] as [Cle, string][]) : []),
      ['fa.prel.horsAssiette', t('fa.prel.horsAssietteV')],
    ]
    : ([
      ['fa.prel.cnss', 'fa.prel.cnssV'],
      ['fa.prel.perteEmploi', 'fa.prel.perteEmploiV'],
      ['fa.prel.css', 'fa.prel.cssV'],
      ['fa.prel.irpp', 'fa.prel.irppV'],
      ['fa.prel.frais', 'fa.prel.fraisV'],
      ['fa.prel.chefFamille', 'fa.prel.chefFamilleV'],
      ['fa.prel.enfant', 'fa.prel.enfantV'],
      ['fa.prel.handicap', 'fa.prel.handicapV'],
      ['fa.prel.etudiant', 'fa.prel.etudiantV'],
      ['fa.prel.conjoint', 'fa.prel.conjointV'],
      ['fa.prel.horsAssiette', 'fa.prel.horsAssietteV'],
    ] as [Cle, Cle][]).map(([l, v]) => [l, t(v)] as [Cle, string]);

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-brand-texte" />
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {t('fa.prelevements')}
        </h4>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
        {lignes.map(([label, valeur]) => (
          <div
            key={label}
            className="grid grid-cols-[1fr_auto] gap-3 items-baseline border-b border-stone-100 pb-1.5"
          >
            <span className="text-xs text-stone-500">{t(label)}</span>
            <span className="text-xs font-bold text-stone-700 tabular-nums text-end">
              {valeur}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-stone-400 mt-4">
        {bareme?.source
          ? `${bareme.source}${bareme.enVigueurDepuis ? ` · ${t('fa.enVigueurDepuis')} ${dateCourte(bareme.enVigueurDepuis, langue)}` : ''}`
          : t('fa.sourceLegale')}
      </p>
      <p className="text-xs text-stone-400 mt-1">{t('fa.noteRh')}</p>
    </div>
  );
}

// ── Carte du dernier bulletin ──────────────────────────────────────

function CarteDernier({ facture, onVoir, onTelecharger, enCours, langue, t }: {
  facture: Facture;
  onVoir: () => void;
  onTelecharger: () => void;
  enCours: boolean;
  langue: string;
  t: (c: Cle) => string;
}) {
  const d = decomposer(facture);

  return (
    <div className="bg-brand-500 rounded-3xl p-6 sm:p-8 text-white overflow-hidden relative">
      {/* Halo décoratif, purement visuel */}
      <div
        className="absolute -top-16 w-56 h-56 rounded-full bg-white/10 pointer-events-none"
        style={{ insetInlineEnd: '-3rem' }}
        aria-hidden="true"
      />

      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">
          {t('fa.dernier')}
        </p>

        <div className="flex flex-wrap items-end justify-between gap-6 mt-2">
          <div>
            <p className="text-sm text-white/80">
              {facture.moisLabel || moisNom(facture.mois, facture.annee, langue)}
            </p>
            <p className="text-4xl sm:text-5xl font-bold tabular-nums mt-1 leading-none">
              {tnd(facture.salaireNet)}
            </p>
            <p className="text-xs text-white/70 mt-2 font-mono">{facture.numero}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onVoir}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <Eye className="w-4 h-4" />
              {t('fa.voirDetail')}
            </button>
            <button
              onClick={onTelecharger}
              disabled={enCours}
              className="px-4 py-2.5 rounded-xl bg-white text-brand-texte hover:bg-white/90 text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              {enCours ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {t('fa.pdf')}
            </button>
          </div>
        </div>

        {/* Part du brut effectivement perçue */}
        <div className="mt-6">
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-[width] duration-500"
              style={{ width: `${d.partNet}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/70 mt-1.5">
            <span>{d.partNet.toFixed(1)} % {t('fa.duBrut')}</span>
            <span>{t('fa.brut')} {tnd(d.brut)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bandeau de cumul annuel ────────────────────────────────────────

function BandeauCumul({ totaux, annee, t }: {
  totaux: { net: number; brut: number; cotisations: number; moyenne: number };
  annee: number;
  t: (c: Cle) => string;
}) {
  const v = (n: number) => tnd(n);

  const lignes: [Cle, string, React.ComponentType<{ className?: string }>, string][] = [
    ['fa.cumulNet', v(totaux.net), TrendingUp, 'text-brand-texte'],
    ['fa.cumulBrut', v(totaux.brut), Wallet, 'text-stone-700'],
    ['fa.cumulCotisations', v(totaux.cotisations), ShieldCheck, 'text-amber-600'],
    ['fa.moyenne', v(totaux.moyenne), Calendar, 'text-cyan-600'],
  ];

  return (
    <div className="bg-surface rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {t('fa.cumulTitre')} {annee}
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {lignes.map(([cle, valeur, Icone, couleur]) => (
          <div key={cle} className="px-5 py-4 border-t border-stone-100">
            <div className="flex items-center gap-1.5 mb-1">
              <Icone className={`w-3.5 h-3.5 ${couleur}`} />
              <span className="text-[11px] text-stone-500">{t(cle)}</span>
            </div>
            <p className={`text-lg font-bold tabular-nums ${couleur}`}>{valeur}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Évolution du net sur l'année ───────────────────────────────────

function CourbeAnnee({ factures, annee, langue, onChoisir, t }: {
  factures: Facture[];
  annee: number;
  langue: string;
  onChoisir: (f: Facture) => void;
  t: (c: Cle) => string;
}) {
  const parMois = useMemo(() => {
    const m = new Map<number, Facture>();
    factures.forEach((f) => m.set(f.mois, f));
    return m;
  }, [factures]);

  const max = useMemo(
    () => Math.max(1, ...factures.map((f) => f.salaireNet ?? 0)),
    [factures]
  );

  if (factures.length < 2) return null;

  return (
    <div className="bg-surface rounded-2xl border border-stone-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-brand-texte" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {t('fa.evolution')}
        </p>
      </div>

      <div className="flex items-end gap-1 sm:gap-2 h-32">
        {Array.from({ length: 12 }, (_, i) => {
          const f = parMois.get(i + 1);
          const hauteur = f ? Math.max(4, ((f.salaireNet ?? 0) / max) * 100) : 0;

          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
              {f ? (
                <button
                  onClick={() => onChoisir(f)}
                  className="w-full rounded-t-md bg-brand-500/80 hover:bg-brand-500 transition-colors relative group"
                  style={{ height: `${hauteur}%` }}
                  title={`${moisNom(i + 1, annee, langue)} · ${tnd(f.salaireNet)}`}
                >
                  <span className="absolute -top-6 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 text-[9px] font-bold text-stone-600 opacity-0 group-hover:opacity-100 whitespace-nowrap tabular-nums transition-opacity">
                    {(f.salaireNet ?? 0).toFixed(0)}
                  </span>
                </button>
              ) : (
                <div
                  className="w-full rounded-t-md border border-dashed border-stone-200"
                  style={{ height: '4px' }}
                />
              )}
              <span className="text-[9px] text-stone-400 truncate w-full text-center">
                {moisNom(i + 1, annee, langue, true)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Détail : la cascade du brut au net ─────────────────────────────

function LigneCascade({ signe, label, valeur, fort, sourd }: {
  signe: 'plus' | 'moins' | 'egal' | null;
  label: string;
  valeur: number;
  fort?: boolean;
  sourd?: boolean;
}) {
  const Icone = signe === 'plus' ? Plus : signe === 'moins' ? Minus : signe === 'egal' ? Equal : null;
  const couleur = signe === 'moins' ? 'text-red-500'
    : signe === 'plus' ? 'text-emerald-600'
      : fort ? 'text-brand-texte' : 'text-stone-800';

  return (
    <div className={[
      'flex items-center justify-between gap-3 py-1.5',
      signe === 'egal' ? 'border-t border-stone-200 mt-1 pt-2.5' : '',
      fort ? 'font-bold' : '',
    ].join(' ')}>
      <span className={`flex items-center gap-2 ${fort ? 'text-sm text-stone-800' : 'text-xs text-stone-500'}`}>
        {Icone ? <Icone className={`w-3 h-3 shrink-0 ${couleur}`} /> : <span className="w-3" />}
        <span className={sourd ? 'ps-3' : ''}>{label}</span>
      </span>
      <span className={`tabular-nums shrink-0 ${fort ? 'text-base' : 'text-xs'} ${couleur}`}>
        {signe === 'moins' ? '−' : signe === 'plus' ? '+' : ''}{tnd(Math.abs(valeur))}
      </span>
    </div>
  );
}

function ModalDetail({ facture, onTelecharger, onClose, enCours, langue, t }: {
  facture: Facture;
  onTelecharger: () => void;
  onClose: () => void;
  enCours: boolean;
  langue: string;
  t: (c: Cle) => string;
}) {
  const d = decomposer(facture);

  const temps: [Cle, string][] = [
    ['fa.joursOuvrables', `${facture.nbJoursOuvrables ?? '—'}`],
    ['fa.joursTravailles', `${facture.joursPresents ?? '—'}`],
    ['fa.absences', `${facture.joursAbsents ?? 0}`],
    ['fa.heuresSup', `${facture.heuresSupplementaires ?? 0} h`],
    ['fa.retardCumule', `${facture.minutesRetard ?? 0} min`],
  ];

  const bons = nonVide(facture.bons);
  const gains = nonVide(facture.gains);
  const retenues = nonVide(facture.retenues);

  useEffect(() => {
    const sortie = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', sortie);
    return () => window.removeEventListener('keydown', sortie);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-3xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800">
              {facture.moisLabel || moisNom(facture.mois, facture.annee, langue)}
            </h2>
            <p className="text-xs text-stone-500 font-mono mt-0.5">{facture.numero}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors"
            aria-label={t('fa.fermer')}
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto ascenseur-discret">

          {/* Le net à payer en premier : c'est ce qu'on vient voir */}
          <div className="bg-brand-500 rounded-2xl p-5 text-white">
            <p className="text-[10px] text-white/70 uppercase tracking-[0.18em]">
              {t('fa.netAPayer')}
            </p>
            <p className="text-3xl font-bold tabular-nums mt-1">{tnd(facture.salaireNet)}</p>
            {d.horsAssiette > 0 && (
              <p className="text-[11px] text-white/70 mt-1.5">
                {t('fa.dontHorsAssiette')} {tnd(d.horsAssiette)}
              </p>
            )}
          </div>

          {/* L'écart n'apparaît que s'il existe : sinon il n'a rien à dire */}
          {Math.abs(d.ecartNet) > TOLERANCE_ECART && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {t('fa.ecartNet')} <strong className="tabular-nums">{tnd(d.ecartNet)}</strong>.{' '}
                {t('fa.ecartAide')}
              </span>
            </div>
          )}

          {/* La cascade : chaque ligne du brut au net */}
          <div className="bg-stone-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-brand-texte" />
              <span className="text-[10px] font-bold text-stone-800 uppercase tracking-widest">
                {t('fa.cascade')}
              </span>
            </div>

            <LigneCascade signe={null} label={t('fa.salaireBase')} valeur={d.base} />

            {gains.map(([k, v]) => (
              <LigneCascade
                key={k}
                signe="plus"
                label={libelleGain(k, t)}
                valeur={v}
                sourd
              />
            ))}

            <LigneCascade signe="egal" label={t('fa.brut')} valeur={d.brut} fort />

            {retenues.map(([k, v]) => (
              <LigneCascade
                key={k}
                signe="moins"
                label={CLE_RETENUE[k] ? t(CLE_RETENUE[k]) : k}
                valeur={v}
                sourd
              />
            ))}

            {facture.cotisations && (
              <>
                <LigneCascade signe="moins" label={t('fa.cnss')} valeur={facture.cotisations.cnss} sourd />
                {facture.cotisations.css > 0 && (
                  <LigneCascade signe="moins" label={t('fa.css')} valeur={facture.cotisations.css} sourd />
                )}
                <LigneCascade signe="moins" label={t('fa.irpp')} valeur={facture.cotisations.irpp} sourd />
              </>
            )}

            <LigneCascade signe="egal" label={t('fa.netSalarial')} valeur={d.netSalarial} fort />

            {/* Hors assiette : ni cotisé, ni imposé. Visuellement à part,
                pour qu'on ne le confonde pas avec du salaire. */}
            {(facture.remboursements ?? 0) > 0 && (
              <LigneCascade signe="plus" label={t('fa.remboursements')} valeur={facture.remboursements!} sourd />
            )}
            {bons.map(([k, v]) => (
              <LigneCascade
                key={k}
                signe="plus"
                label={CLE_BON[k] ? t(CLE_BON[k]) : k}
                valeur={v}
                sourd
              />
            ))}

            {d.horsAssiette > 0 && (
              <>
                <LigneCascade signe="egal" label={t('fa.netAPayer')} valeur={d.netAttendu} fort />
                <p className="flex items-center gap-1.5 text-[10px] text-stone-400 mt-2">
                  <Ticket className="w-3 h-3 shrink-0" />
                  {t('fa.horsAssiette')}
                </p>
              </>
            )}
          </div>

          {/* Temps de travail : la base du calcul */}
          <div className="bg-stone-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-texte" />
              <span className="text-[10px] font-bold text-stone-800 uppercase tracking-widest">
                {t('fa.tempsTravail')}
              </span>
            </div>
            <div className="space-y-1.5">
              {temps.map(([cle, valeur]) => (
                <div key={cle} className="flex justify-between text-sm">
                  <span className="text-stone-500">{t(cle)}</span>
                  <span className="font-bold text-stone-800 tabular-nums">{valeur}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-stone-400 text-center">
            {t('fa.emisLe')} {dateCourte(facture.genereLe, langue)}
          </p>
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-stone-200 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            {t('fa.fermer')}
          </button>
          <button
            onClick={onTelecharger}
            disabled={enCours}
            className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {enCours ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {enCours ? t('fa.telechargement') : t('fa.pdf')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function MesFacturesPage() {
  const { t, tn, langue } = useI18n();

  const [factures, setFactures] = useState<Facture[]>([]);
  const [chargement, setChargement] = useState(true);
  const [souci, setSouci] = useState<Souci>(null);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const [detail, setDetail] = useState<Facture | null>(null);

  // Aucune dépendance : voir le commentaire du type Souci.
  const charger = useCallback(async () => {
    try {
      setChargement(true);
      setSouci(null);

      const res = await facturesService.lister() as any;
      const data = res?.data?.factures ?? res?.factures ?? [];

      if (!Array.isArray(data)) {
        setSouci({ cle: 'fa.erreurReponse' });
        setFactures([]);
        return;
      }

      // Le plus récent d'abord : c'est le bulletin qu'on consulte.
      setFactures(
        [...data].sort((a, b) =>
          String(b.periode ?? `${b.annee}-${String(b.mois).padStart(2, '0')}`)
            .localeCompare(String(a.periode ?? `${a.annee}-${String(a.mois).padStart(2, '0')}`))
        )
      );
    } catch (e: any) {
      console.error('Chargement des bulletins :', e);
      const duServeur = e?.erreur ?? e?.response?.data?.erreur ?? e?.message;
      setSouci(duServeur ? { texte: duServeur } : { cle: 'fa.erreurChargement' });
      setFactures([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { setPage(0); }, [annee, recherche]);

  const telecharger = async (facture: Facture) => {
    setTelechargement(facture.id);
    setSouci(null);
    try {
      const blob = await api.get(
        `/factures/pdf/${encodeURIComponent(facture.id)}`,
        { responseType: 'blob' }
      ) as unknown as Blob;

      // Une réponse d'erreur arrive elle aussi sous forme de Blob : sans ce
      // contrôle, un message JSON serait enregistré avec l'extension .pdf.
      if (blob.type !== 'application/pdf') {
        const texte = await blob.text();
        let message = '';
        try {
          message = JSON.parse(texte)?.erreur ?? '';
        } catch {
          // Réponse HTML : la requête n'a pas atteint l'API.
        }
        throw new Error(message);
      }

      // L'ancre doit être dans le document : sans cela, Firefox ignore
      // le clic programmatique.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${facture.numero}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      // Le message du serveur s'il en a donné un, sinon le nôtre.
      setSouci(e?.message ? { texte: e.message } : { cle: 'fa.erreurPdf' });
    } finally {
      setTelechargement(null);
    }
  };

  const annees = useMemo(() => {
    const liste = [...new Set(factures.map((f) => f.annee))].sort((a, b) => b - a);
    return liste.length > 0 ? liste : [new Date().getFullYear()];
  }, [factures]);

  // L'année sélectionnée doit exister, sinon la liste reste vide sans
  // raison apparente au premier chargement.
  useEffect(() => {
    if (factures.length > 0 && !annees.includes(annee)) setAnnee(annees[0]);
  }, [annees, annee, factures.length]);

  const deLAnnee = useMemo(
    () => factures.filter((f) => f.annee === annee),
    [factures, annee]
  );

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return deLAnnee;
    return deLAnnee.filter((f) =>
      `${f.moisLabel ?? moisNom(f.mois, f.annee, langue)} ${f.numero}`
        .toLowerCase().includes(terme)
    );
  }, [deLAnnee, recherche, langue]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  // Les totaux portent sur l'année sélectionnée : cumuler toutes les
  // années donnerait un chiffre sans signification fiscale.
  const totaux = useMemo(() => {
    const net = deLAnnee.reduce((s, f) => s + (f.salaireNet ?? 0), 0);
    return {
      net,
      brut: deLAnnee.reduce((s, f) => s + decomposer(f).brut, 0),
      cotisations: deLAnnee.reduce((s, f) => s + (f.cotisations?.total ?? 0), 0),
      moyenne: deLAnnee.length ? net / deLAnnee.length : 0,
    };
  }, [deLAnnee]);

  const dernier = factures[0];

  return (
    <Layout>
      {/* ── En-tête ── */}
      <div className="px-6 sm:px-8 py-6 flex flex-wrap gap-4 justify-between items-end border-b border-stone-200">
        <div>
          <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
            <span>{t('fa.filRemuneration')}</span>
            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            <span className="text-brand-texte font-semibold">{t('fa.titre')}</span>
          </nav>
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">{t('fa.titre')}</h2>
          <p className="text-stone-500 mt-1 text-sm">
            {chargement ? t('fa.chargement') : (
              <>
                {tn('fa.bulletins', filtrees.length)} · {annee}
                {filtrees.length > 0 && ` · ${tnd(totaux.moyenne)} ${t('fa.enMoyenne')}`}
              </>
            )}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" style={{ insetInlineStart: '0.75rem' }} />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t('fa.recherche')}
            className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500 text-start"
          />
          {recherche && (
            <button
              onClick={() => setRecherche('')}
              className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
              style={{ insetInlineEnd: '0.6rem' }}
              aria-label={t('fa.effacer')}
            >
              <X className="w-3.5 h-3.5 text-stone-400" />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 sm:px-8 py-8 space-y-5">

        {souci && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">
              {'cle' in souci ? t(souci.cle) : souci.texte}
            </span>
            <button onClick={charger} className="font-bold underline shrink-0">
              {t('fa.reessayer')}
            </button>
          </div>
        )}

        {chargement ? (
          <div className="space-y-5">
            <div className="h-48 rounded-3xl bg-stone-100 animate-pulse" />
            <div className="h-24 rounded-2xl bg-stone-100 animate-pulse" />
            <div className="h-64 rounded-2xl bg-stone-100 animate-pulse" />
          </div>
        ) : factures.length === 0 ? (
          <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-sm font-bold text-stone-800 mb-1">{t('fa.aucun')}</p>
            <p className="text-xs text-stone-500">{t('fa.videAide')}</p>
          </div>
        ) : (
          <>
            {dernier && (
              <CarteDernier
                facture={dernier}
                onVoir={() => setDetail(dernier)}
                onTelecharger={() => telecharger(dernier)}
                enCours={telechargement === dernier.id}
                langue={langue}
                t={t}
              />
            )}

            <BandeauCumul totaux={totaux} annee={annee} t={t} />

            {annees.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                {annees.map((a) => {
                  const actif = annee === a;
                  return (
                    <button
                      key={a}
                      onClick={() => setAnnee(a)}
                      className={[
                        'px-4 py-2 rounded-xl text-sm font-bold border transition-colors tabular-nums',
                        actif
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500',
                      ].join(' ')}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            )}

            <CourbeAnnee
              factures={deLAnnee}
              annee={annee}
              langue={langue}
              onChoisir={setDetail}
              t={t}
            />

            {filtrees.length === 0 ? (
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
                <p className="text-sm font-bold text-stone-800 mb-1">{t('fa.aucunAnnee')}</p>
                <p className="text-xs text-stone-500">
                  {recherche ? t('fa.aucunResultat') : t('fa.videAutreAnnee')}
                </p>
              </div>
            ) : (
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem]">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50">
                        {([
                          ['fa.colPeriode', 'text-start'],
                          ['fa.colReference', 'text-start'],
                          ['fa.colBrut', 'text-end'],
                          ['fa.colCotisations', 'text-end'],
                          ['fa.colNet', 'text-end'],
                          ['fa.colActions', 'text-end'],
                        ] as [Cle, string][]).map(([cle, align]) => (
                          <th
                            key={cle}
                            className={`${align} px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400`}
                          >
                            {t(cle)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageCourante.map((f) => {
                        const d = decomposer(f);
                        return (
                          <tr
                            key={f.id}
                            onClick={() => setDetail(f)}
                            className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3 text-start">
                              <div className="text-sm font-bold text-stone-800">
                                {f.moisLabel || moisNom(f.mois, f.annee, langue)}
                              </div>
                              <div className="text-[10px] text-stone-400">
                                {t('fa.emisLe')} {dateCourte(f.genereLe, langue)}
                              </div>
                            </td>

                            <td className="px-4 py-3 text-start">
                              <span className="text-[11px] font-mono font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded-lg">
                                {f.numero}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-end text-sm text-stone-700 tabular-nums">
                              {tnd(d.brut)}
                            </td>

                            {/* Cotisations seules : les retenues ont leur
                                propre ligne dans le détail. L'ancien
                                libellé « Retenues » les mélangeait. */}
                            <td className="px-4 py-3 text-end text-sm text-red-500 tabular-nums">
                              −{tnd(d.cotisations)}
                            </td>

                            <td className="px-4 py-3 text-end text-sm font-bold text-brand-texte tabular-nums">
                              {tnd(f.salaireNet)}
                            </td>

                            <td
                              className="px-4 py-3 text-end whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {Math.abs(d.ecartNet) > TOLERANCE_ECART && (
                                  <span
                                    title={t('fa.ecartNet')}
                                    className="flex items-center"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  </span>
                                )}
                                <button
                                  onClick={() => setDetail(f)}
                                  className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors"
                                  aria-label={t('fa.voirDetail')}
                                >
                                  <Eye className="w-4 h-4 text-stone-400" />
                                </button>
                                <button
                                  onClick={() => telecharger(f)}
                                  disabled={telechargement === f.id}
                                  className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-40"
                                  aria-label={t('fa.pdf')}
                                >
                                  {telechargement === f.id ? (
                                    <span className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin block" />
                                  ) : (
                                    <Download className="w-4 h-4 text-stone-400" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  taillePage={PAR_PAGE}
                  total={filtrees.length}
                  onPage={setPage}
                  libelle={t('fa.libellePagination')}
                />
              </div>
            )}
          </>
        )}

        {/* Les taux viennent du barème porté par le bulletin le plus
            récent, et non de ce fichier. */}
        <PanneauPrelevements bareme={dernier?.bareme} langue={langue} t={t} />
      </div>

      {detail && (
        <ModalDetail
          facture={detail}
          onTelecharger={() => telecharger(detail)}
          onClose={() => setDetail(null)}
          enCours={telechargement === detail.id}
          langue={langue}
          t={t}
        />
      )}

      {/* L'ascenseur suit le thème : l'ancienne couleur était figée en clair. */}
      <style>{`
        .ascenseur-discret::-webkit-scrollbar { width: 6px; height: 6px; }
        .ascenseur-discret::-webkit-scrollbar-track { background: transparent; }
        .ascenseur-discret::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, currentColor 18%, transparent);
          border-radius: 10px;
        }
        .ascenseur-discret { scrollbar-width: thin; }
      `}</style>
    </Layout>
  );
}