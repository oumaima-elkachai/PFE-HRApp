// src/pages/employee/EmplDash.tsx
//
// Tableau de bord du salarié. C'est la première page qu'il ouvre le
// matin, et c'est ce qui a guidé la refonte.
//
// L'ancienne version menait avec « assiduité », « retard cumulé » et
// « absences » : trois indicateurs sur quatre rappelaient au salarié
// ce qu'il avait mal fait. Les chiffres n'ont pas changé — ils sont
// retournés. Le retard devient une ponctualité, et le détail en
// minutes reste lisible dessous : on ne cache rien, on dit d'abord ce
// qui va bien.
//
// Le pointage a été sorti dans components/pointage/ModalPointage :
// il porte deux méthodes d'attestation — QR avec géolocalisation, et
// reconnaissance faciale.
//
// Les deux méthodes ne prouvent pas la même chose : le QR atteste le
// lieu, le visage atteste l'identité, et la géolocalisation est exigée
// dans les deux cas. La reconnaissance faciale remplace donc le QR,
// jamais la position.

import { useState, useEffect } from 'react';
import {
  Clock, FileText, Calendar, Download, ArrowRight, Receipt,
  Award, TrendingUp, Plus, X, CheckCircle2, XCircle, Hourglass,
  Video, Camera, ChevronRight, ScanFace,
  Palmtree, Sparkles, Target, CalendarDays,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { prechargerModeles } from '../../lib/visage';
import { useAuth } from '../../context/AuthContext';
import { pointagesService } from '../../services/pointages';
import { facturesService } from '../../services/factures';
import { congesService, type Conge, type SoldeConges } from '../../services/conges';
import { LIBELLES_TYPE_CONGE, LIBELLES_STATUT_CONGE, libelle } from '../../types/domaine';
import type { StatutConge, TypeConge } from '../../types/domaine';
import { employesService } from '../../services/employes';
import api from '../../services/api';
import ModalPointage from '@/components/pointages/ModalPointage';
import BandeAcces from '../employee/BandeAcces';

const FOND = 'transparent';

// Le dégradé du bandeau est écrit en CSS plutôt qu'en classes : il
// traverse ainsi les versions de Tailwind sans dépendre de la syntaxe
// des utilitaires de dégradé, qui a changé entre la v3 et la v4.
const DEGRADE_ACCUEIL = 'linear-gradient(135deg, #4F46E5 0%, #6366F1 55%, #818CF8 100%)';

// Style uniquement : le vocabulaire métier vient de types/domaine.ts
const STYLE_CONGE: Record<StatutConge, { bg: string; text: string; icon: any }> = {
  EN_ATTENTE: { bg: 'bg-amber-50',     text: 'text-amber-600', icon: Hourglass },
  APPROUVE:   { bg: 'bg-brand-500/10', text: 'text-brand-texte', icon: CheckCircle2 },
  REFUSE:     { bg: 'bg-red-50',       text: 'text-red-500',   icon: XCircle },
};

const STYLE_CONGE_DEFAUT = { bg: 'bg-stone-100', text: 'text-stone-500', icon: Hourglass };

const styleConge = (s: string) => STYLE_CONGE[s as StatutConge] ?? STYLE_CONGE_DEFAUT;

/**
 * Date du jour au format AAAA-MM-JJ, dans le fuseau du navigateur.
 * toISOString() convertirait en UTC et décalerait d'un jour entre
 * minuit et 1 h du matin en Tunisie.
 */
function dateAujourdhui(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const heureCourte = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const jourCourt = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const tnd = (v: number) => `${v.toFixed(3)} TND`;

/**
 * Ancienneté en mois révolus.
 *
 * Une soustraction d'années donnerait « 1 an » dès le 1er janvier à un
 * salarié embauché en décembre. Le mois et le jour doivent entrer dans
 * le calcul.
 */
function anciennetteEnMois(dateEmbauche?: string): number {
  if (!dateEmbauche) return 0;

  const debut = new Date(dateEmbauche);
  const maintenant = new Date();

  let mois = (maintenant.getFullYear() - debut.getFullYear()) * 12
    + (maintenant.getMonth() - debut.getMonth());

  // Le mois n'est révolu que si le jour du mois est atteint
  if (maintenant.getDate() < debut.getDate()) mois -= 1;

  return Math.max(0, mois);
}

function formaterAnciennete(mois: number): string {
  if (mois < 1) return 'Arrivé ce mois-ci';
  if (mois < 12) return `${mois} mois`;

  const annees = Math.floor(mois / 12);
  const reste = mois % 12;

  if (reste === 0) return `${annees} an${annees > 1 ? 's' : ''}`;
  return `${annees} an${annees > 1 ? 's' : ''} et ${reste} mois`;
}

/**
 * Anniversaire d'embauche tombant dans le mois en cours.
 *
 * Ne se déclenche qu'à partir d'un an révolu : souhaiter un
 * anniversaire à quelqu'un arrivé le mois dernier sonnerait faux.
 *
 * `passe` distingue les deux cas, parce que la date compte. Au 3
 * novembre, quelqu'un embauché le 15 novembre 2023 totalise deux ans
 * et onze mois — annoncer « 3 ans ce mois-ci » à côté de ce chiffre
 * ressemble à une incohérence alors que les deux sont exacts. On dit
 * donc le jour.
 */
function anniversaireDuMois(dateEmbauche?: string):
  { annees: number; jour: number; passe: boolean } | null {
  if (!dateEmbauche) return null;

  const debut = new Date(dateEmbauche);
  const maintenant = new Date();
  if (debut.getMonth() !== maintenant.getMonth()) return null;

  const annees = maintenant.getFullYear() - debut.getFullYear();
  if (annees < 1) return null;

  return {
    annees,
    jour: debut.getDate(),
    passe: maintenant.getDate() >= debut.getDate(),
  };
}

const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ── Composants partagés ────────────────────────────────────────────
function Vide({ icone: Icone, texte, action }: {
  icone: React.ComponentType<{ className?: string }>;
  texte: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-10">
      <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
        <Icone className="w-5 h-5 text-stone-300" />
      </div>
      <p className="text-sm text-stone-500">{texte}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Squelette({ nb = 3, h = 'h-14' }: { nb?: number; h?: string }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: nb }).map((_, i) => (
        <div key={i} className={`${h} rounded-xl bg-stone-50 animate-pulse`} />
      ))}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    // Sur téléphone le bandeau prend la largeur : une bulle de 280
    // pixels calée à droite déborderait d'un écran de 360.
    <div className="fixed top-4 start-4 end-4 sm:start-auto sm:top-6 sm:end-6 z-70">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 sm:min-w-70">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Animation ──────────────────────────────────────────────────────
//
// Tout est en CSS et en requestAnimationFrame : aucune bibliothèque
// d'animation n'est ajoutée. Une dépendance de plus la veille d'une
// soutenance est un risque que le mouvement ne justifie pas.
//
// Chaque effet respecte prefers-reduced-motion. Ce n'est pas une
// politesse : un tableau de bord qui s'anime sans condition est
// inutilisable pour une personne sujette au mal des transports, et
// c'est un critère d'accessibilité vérifiable.

const STYLES_ANIMATION = `
@keyframes hrup-monter {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.hrup-monter {
  animation: hrup-monter 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.hrup-carte {
  transition: transform 220ms ease, box-shadow 220ms ease;
}
.hrup-carte:hover {
  transform: translateY(-2px);
}
@keyframes hrup-trace {
  from { stroke-dashoffset: var(--depart); }
}
@media (prefers-reduced-motion: reduce) {
  .hrup-monter { animation: none; }
  .hrup-carte  { transition: none; }
  .hrup-carte:hover { transform: none; }
}
`;

/** Vrai quand le système demande à limiter les animations. */
function mouvementReduit(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Compteur animé de 0 à la cible.
 *
 * La courbe est un amorti cubique : le chiffre part vite puis ralentit,
 * ce qui le rend lisible avant la fin de l'animation. Une progression
 * linéaire donne l'impression d'un chargement, pas d'un compteur.
 */
function useCompteur(cible: number, duree = 900): number {
  const [valeur, setValeur] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(cible)) { setValeur(0); return; }
    if (mouvementReduit()) { setValeur(cible); return; }

    let image = 0;
    const depart = performance.now();

    const pas = (t: number) => {
      const avancement = Math.min(1, (t - depart) / duree);
      setValeur(cible * (1 - (1 - avancement) ** 3));
      if (avancement < 1) image = requestAnimationFrame(pas);
    };

    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [cible, duree]);

  return valeur;
}

/** Entrée décalée : chaque bloc arrive un peu après le précédent. */
function Apparition({ delai = 0, className = '', children }: {
  delai?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`hrup-monter ${className}`} style={{ animationDelay: `${delai}ms` }}>
      {children}
    </div>
  );
}

/**
 * Courbe d'évolution, sans axes ni graduations.
 *
 * Elle ne sert pas à lire une valeur — les montants sont écrits en
 * toutes lettres à côté — mais à voir une tendance d'un coup d'œil.
 */
function Courbe({ valeurs, couleur = '#4F46E5', largeur = 120, hauteur = 36 }: {
  valeurs: number[];
  couleur?: string;
  largeur?: number;
  hauteur?: number;
}) {
  if (valeurs.length < 2) return null;

  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Un salaire constant donnerait une division par zéro : la courbe
  // devient alors une ligne plate au milieu, ce qui est exact.
  const etendue = max - min || 1;

  const points = valeurs.map((v, i) => {
    const x = (i / (valeurs.length - 1)) * largeur;
    const y = hauteur - ((v - min) / etendue) * (hauteur - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={largeur} height={hauteur} className="shrink-0 overflow-visible">
      <polyline
        points={points.join(' ')}
        fill="none" stroke={couleur} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
        opacity={0.35}
      />
      <circle
        cx={largeur} cy={points[points.length - 1].split(',')[1]}
        r={3} fill={couleur}
      />
    </svg>
  );
}

/**
 * Barre empilée du solde de congés.
 *
 * Trois quantités qui s'additionnent jusqu'au total : une barre
 * empilée les montre d'un seul regard là où trois chiffres demandent
 * une soustraction mentale.
 */
function BarreConges({ pris, enAttente, total }: {
  pris: number;
  enAttente: number;
  total: number;
}) {
  const base = total || 1;
  const partPris = Math.min(100, (pris / base) * 100);
  const partAttente = Math.min(100 - partPris, (enAttente / base) * 100);

  return (
    <div>
      <div className="h-2.5 w-full rounded-full overflow-hidden bg-stone-100 flex">
        <div
          className="h-full bg-brand-500"
          style={{ width: `${partPris}%`, transition: 'width 900ms ease-out' }}
        />
        <div
          className="h-full bg-amber-400"
          style={{ width: `${partAttente}%`, transition: 'width 900ms ease-out' }}
        />
      </div>

      {/* « Disponibles » et non « restants » : le solde restant annoncé
          par le serveur inclut les jours en attente de validation. Si
          la légende disait « restants » ici, elle contredirait le grand
          chiffre juste au-dessus alors que les deux sont justes. */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
        {([
          ['bg-brand-500', `${pris} pris`],
          ...(enAttente > 0 ? [['bg-amber-400', `${enAttente} en attente`]] : []),
          ['bg-stone-200', `${Math.max(0, total - pris - enAttente)} disponibles`],
        ] as [string, string][]).map(([pastille, texte]) => (
          <span key={texte} className="flex items-center gap-1.5 text-[10px] text-stone-500">
            <span className={`w-2 h-2 rounded-full ${pastille}`} />
            {texte}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Anneau de progression.
 *
 * Une barre horizontale se lit de gauche à droite, donc en séquence ;
 * un anneau se saisit d'un coup d'œil, et trois anneaux côte à côte se
 * comparent sans les lire. Le chiffre reste au centre : une forme sans
 * valeur ne se défend pas devant un jury.
 *
 * Le tracé part de zéro au montage, sinon l'anneau apparaît déjà plein
 * et la transition CSS n'a rien à animer.
 */
function Anneau({ valeur, affichage, couleur, taille = 92, epaisseur = 8 }: {
  valeur: number;
  affichage: string;
  couleur: string;
  taille?: number;
  epaisseur?: number;
}) {
  const anime = useCompteur(valeur, 1000);

  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const borne = Math.max(0, Math.min(100, anime));
  const reste = circonference * (1 - borne / 100);

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} className="-rotate-90">
        <circle
          cx={taille / 2} cy={taille / 2} r={rayon}
          fill="none" stroke="#F5F5F4" strokeWidth={epaisseur}
        />
        <circle
          cx={taille / 2} cy={taille / 2} r={rayon}
          fill="none" stroke={couleur} strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={circonference}
          strokeDashoffset={reste}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-stone-800">{affichage}</span>
      </div>
    </div>
  );
}

/**
 * Carte d'indicateur en anneau.
 *
 * `detail` porte le chiffre brut — les minutes de retard, les jours
 * travaillés. Le pourcentage encourage, le détail reste vérifiable.
 */
function CarteAnneau({ icone: Icone, titre, valeur, affichage, detail, couleur, alerte, delai = 0 }: {
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  valeur: number;
  affichage: string;
  detail?: string;
  couleur: string;
  alerte?: boolean;
  delai?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delai}ms` }}
      className={`hrup-monter hrup-carte bg-surface rounded-2xl shadow-sm border p-5 flex items-center gap-4 ${
        alerte ? 'border-amber-200' : 'border-stone-100'
      }`}
    >
      <Anneau valeur={valeur} affichage={affichage} couleur={couleur} />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Icone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span className="text-xs font-bold text-stone-700">{titre}</span>
        </div>
        {detail && (
          <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">{detail}</p>
        )}
      </div>
    </div>
  );
}

/** Chiffre du bandeau d'accueil, sur fond coloré. */
function ChiffreAccueil({ icone: Icone, valeur, libelle: texte }: {
  icone: React.ComponentType<{ className?: string }>;
  valeur: string | number;
  libelle: string;
}) {
  return (
    <div className="rounded-xl px-4 py-3 bg-white/15 backdrop-blur-sm min-w-[7.5rem]">
      <Icone className="w-4 h-4 text-white/70 mb-1.5" />
      <div className="text-xl font-bold text-white leading-none">{valeur}</div>
      <div className="text-[10px] text-white/70 mt-1">{texte}</div>
    </div>
  );
}

// ── Demande de congé ───────────────────────────────────────────────
function ModalDemandeConge({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<{
    type: TypeConge;
    dateDebut: string;
    dateFin: string;
    motif: string;
  }>({ type: 'annuel', dateDebut: '', dateFin: '', motif: '' });

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.dateDebut || !form.dateFin) {
      setErreur('Sélectionnez les dates de début et de fin');
      return;
    }
    // Comparaison lexicographique : exacte sur le format AAAA-MM-JJ
    if (form.dateFin < form.dateDebut) {
      setErreur('La date de fin doit suivre la date de début');
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      await congesService.demander(form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || err?.message || 'Erreur lors de la demande');
      setEnvoi(false);
    }
  };

  const champ =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-200 sticky top-0 bg-surface rounded-t-2xl">
          <h2 className="font-bold text-lg text-stone-800">Demander un congé</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {erreur && (
            <div className="text-sm rounded-xl px-4 py-3 bg-red-50 text-red-600">
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Type de congé
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as TypeConge })}
              className={champ}
            >
              {(Object.keys(LIBELLES_TYPE_CONGE) as TypeConge[]).map((t) => (
                <option key={t} value={t}>{LIBELLES_TYPE_CONGE[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Du</label>
              <input
                type="date"
                value={form.dateDebut}
                onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Au</label>
              <input
                type="date"
                value={form.dateFin}
                min={form.dateDebut || undefined}
                onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                className={champ}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Motif (optionnel)
            </label>
            <textarea
              value={form.motif}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              rows={3}
              className={`${champ} resize-none`}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [pointageActif, setPointageActif] = useState(false);
  const [heureArrivee, setHeureArrivee] = useState<string | null>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [conges, setConges] = useState<Conge[]>([]);
  const [solde, setSolde] = useState<SoldeConges | null>(null);
  const [frais, setFrais] = useState<{ aRembourser: number; enAttente: number } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [toast, setToast] = useState('');
  const [modalConge, setModalConge] = useState(false);
  const [modalPointage, setModalPointage] = useState(false);
  const [ficheEmploye, setFicheEmploye] = useState<any>(null);

  // Enrôlement facial : conditionne le choix de méthode proposé au
  // pointage. Un salarié non enrôlé ne doit pas voir une option qui
  // échouerait.
  const [facialDisponible, setFacialDisponible] = useState(false);

  const chargerConges = async () => {
    try {
      const res = await congesService.lister();
      setConges(res?.data?.conges ?? []);
      setSolde(res?.data?.solde ?? null);
    } catch (e) {
      console.error('Chargement des congés :', e);
    }
  };

  const chargerPointage = async () => {
    try {
      const res = await pointagesService.historique({ date: dateAujourdhui() }) as any;
      const enCours = (res?.data?.pointages ?? []).find((p: any) => p.statut === 'EN_COURS');
      setPointageActif(Boolean(enCours));
      setHeureArrivee(enCours ? heureCourte(enCours.heureArrivee) : null);
    } catch (e) {
      console.error('Chargement du pointage :', e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // allSettled plutôt que all : une route en échec ne doit pas
        // vider tout le tableau de bord.
        const [
          facRes, evRes, ptRes, congesRes, fraisRes, ficheRes, bioRes,
        ] = await Promise.allSettled([
          facturesService.lister() as any,
          api.get('/evenements') as any,
          pointagesService.historique({ date: dateAujourdhui() }) as any,
          congesService.lister(),
          api.get('/frais/notes') as any,
          user?.employeId
            ? (employesService.detail(user.employeId) as any)
            : Promise.resolve(null),
          api.get('/biometrie/etat') as any,
        ]);

        const valeur = (r: PromiseSettledResult<any>) =>
          r.status === 'fulfilled' ? r.value : null;

        setFicheEmploye(valeur(ficheRes)?.data?.employe ?? null);

        // Un échec de lecture retombe sur false : le salarié pointera
        // par QR, ce qui est le repli correct.
        setFacialDisponible(Boolean(valeur(bioRes)?.data?.enrole));

        // Le tri est explicite : factures[0] doit être le bulletin le
        // plus récent, sans quoi tous les indicateurs porteraient sur
        // une période arbitraire.
        const liste = (valeur(facRes)?.data?.factures ?? [])
          .sort((a: any, b: any) => String(b.periode).localeCompare(String(a.periode)));
        setFactures(liste.slice(0, 5));

        setEvenements((valeur(evRes)?.data?.evenements ?? []).slice(0, 4));
        setConges(valeur(congesRes)?.data?.conges ?? []);
        setSolde(valeur(congesRes)?.data?.solde ?? null);
        setFrais(valeur(fraisRes)?.data?.resume ?? null);

        const enCours = (valeur(ptRes)?.data?.pointages ?? [])
          .find((p: any) => p.statut === 'EN_COURS');
        if (enCours) {
          setPointageActif(true);
          setHeureArrivee(heureCourte(enCours.heureArrivee));
        }
      } catch (e) {
        console.error('Chargement du tableau de bord :', e);
      } finally {
        setChargement(false);
      }
    })();
    // employeId conditionne le chargement de la fiche : sans lui dans
    // les dépendances, l'ancienneté resterait vide s'il arrive après.
  }, [user?.sub, user?.employeId]);

  // Le modèle de reconnaissance faciale se charge en avance de phase,
  // pendant que le salarié lit son tableau de bord. Sans cela, les
  // 6,8 Mo de poids et la compilation des noyaux de calcul se paient
  // après le clic sur « pointer », là où l'attente se remarque.
  //
  // Conditionné à l'enrôlement : un salarié qui pointe par QR n'a
  // aucune raison de télécharger un modèle qu'il n'utilisera pas.
  useEffect(() => {
    if (facialDisponible) prechargerModeles();
  }, [facialDisponible]);

  const heure = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';

  // ── Indicateurs ──
  const derniereFacture = factures[0];
  const nbOuvrables   = derniereFacture?.nbJoursOuvrables ?? 0;
  const joursPresents = derniereFacture?.joursPresents ?? 0;
  const joursAbsents  = derniereFacture?.joursAbsents ?? 0;
  const retardMin     = derniereFacture?.minutesRetard ?? 0;

  const tauxAssiduite = nbOuvrables > 0 ? (joursPresents / nbOuvrables) * 100 : 0;

  // La ponctualité se mesure en retard moyen par jour travaillé, et
  // non par une décote arbitraire du total. Un seuil de 15 minutes
  // correspond à la tolérance appliquée au pointage.
  const retardMoyen = joursPresents > 0 ? retardMin / joursPresents : 0;
  const tauxPonctualite = Math.max(0, 100 - (retardMoyen / 15) * 100);

  const moisAnciennete = anciennetteEnMois(ficheEmploye?.dateEmbauche);
  const anniversaire = anniversaireDuMois(ficheEmploye?.dateEmbauche);

  const partConges = solde && solde.total > 0
    ? (solde.restants / solde.total) * 100
    : 0;

  // ── Ce qui vient ──
  //
  // Congés et événements dans une seule file, triée par date. Deux
  // cartes séparées obligeaient à comparer soi-même « mon congé du 9 »
  // et « la formation du 12 » pour savoir ce qui arrive en premier.
  const maintenant = Date.now();

  type Echeance = {
    id: string;
    genre: 'conge' | 'evenement';
    titre: string;
    detail: string;
    debut: string;
    route: string;
    inscrit?: boolean;
    visio?: boolean;
  };

  const prochaines: Echeance[] = [
    ...conges
      .filter((c) => c.statut === 'APPROUVE'
        && new Date(c.dateDebut).getTime() >= maintenant)
      .map((c): Echeance => ({
        id: `conge-${c.id}`,
        genre: 'conge',
        titre: libelle(LIBELLES_TYPE_CONGE, c.type),
        detail: `${jourCourt(c.dateDebut)} → ${jourCourt(c.dateFin)}`
          + ` · ${c.nbJours} jour${c.nbJours > 1 ? 's' : ''}`,
        debut: c.dateDebut,
        route: '/employe/agenda',
      })),
    ...evenements
      .filter((e: any) => e.dateDebut && new Date(e.dateDebut).getTime() >= maintenant)
      .map((e: any): Echeance => ({
        id: `evenement-${e.id}`,
        genre: 'evenement',
        titre: e.titre,
        detail: new Date(e.dateDebut).toLocaleDateString('fr-FR', {
          day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        }) + (e.lieu ? ` · ${e.lieu}` : ''),
        debut: e.dateDebut,
        route: '/evenements',
        inscrit: Boolean(e.inscrit),
        visio: Boolean(e.lienVisio),
      })),
  ]
    .sort((a, b) => String(a.debut).localeCompare(String(b.debut)))
    .slice(0, 4);

  // Évolution du net sur les derniers bulletins. `factures` est trié du
  // plus récent au plus ancien : la courbe se lit dans l'autre sens.
  const courbeNet = [...factures]
    .reverse()
    .map((f: any) => Number(f.salaireNet))
    .filter((v) => Number.isFinite(v));

  const netAnime = useCompteur(Number(derniereFacture?.salaireNet) || 0, 1100);

  // ── Distinctions ──
  // Uniquement sur des faits vérifiables. Un encouragement inventé se
  // repère immédiatement et décrédibilise le reste de la page.
  const distinctions: { icone: any; texte: string }[] = [];

  if (anniversaire) {
    const duree = `${anniversaire.annees} an${anniversaire.annees > 1 ? 's' : ''}`;
    distinctions.push({
      icone: Sparkles,
      texte: anniversaire.passe
        ? `${duree} dans l'entreprise, depuis le ${anniversaire.jour} ${MOIS_LONGS[new Date().getMonth()]}`
        : `Bientôt ${duree} dans l'entreprise, le ${anniversaire.jour} ${MOIS_LONGS[new Date().getMonth()]}`,
    });
  }
  if (derniereFacture && joursAbsents === 0) {
    distinctions.push({
      icone: Award,
      texte: `${derniereFacture.moisLabel} sans aucune absence`,
    });
  }
  if (derniereFacture && retardMin === 0 && joursPresents > 0) {
    distinctions.push({
      icone: Target,
      texte: 'Aucun retard ce mois-ci',
    });
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout>

        <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-4">

          {/* ── Bandeau d'accueil ── */}
          {/* Le bouton d'ouverture du tiroir est posé en superposition
              en haut à gauche sous lg : le contenu décale d'autant. */}
          <div
            className="hrup-monter rounded-2xl shadow-sm overflow-hidden"
            style={{ background: DEGRADE_ACCUEIL }}
          >
            <div className="px-5 sm:px-7 py-6 sm:py-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

              <div className="min-w-0">
                {/* Seuls le fil d'Ariane et le titre se décalent : le
                    bouton d'ouverture du tiroir est posé en
                    superposition à cet endroit précis, sous lg. Décaler
                    tout le bloc désalignerait les boutons et les
                    chiffres, qui n'ont rien sous eux. */}
                <div className="ps-12 lg:ps-0">
                  <nav className="flex text-[11px] text-white/60 mb-2 gap-2 items-center">
                    <span>Mon espace</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-white/90 font-semibold">Tableau de bord</span>
                  </nav>

                  <h2 className="text-2xl sm:text-3xl font-bold text-white">
                    {salutation}{user?.prenom && `, ${user.prenom}`}
                  </h2>

                  <p className="text-white/70 mt-1 capitalize text-sm">
                    {new Date().toLocaleDateString('fr-FR', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </p>
                </div>

                {/* Le pointage passe par une modale : géolocalisation,
                    choix de méthode et caméra demandent une étape, pas
                    un clic sec. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-5">
                  <button
                    onClick={() => setModalPointage(true)}
                    className={`flex items-center justify-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm transition-colors ${
                      pointageActif
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-white hover:bg-white/90 text-brand-texte'
                    }`}
                  >
                    {facialDisponible ? <ScanFace className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                    {pointageActif ? 'Pointer le départ' : "Pointer l'arrivée"}
                  </button>

                  <div className="flex items-center gap-2 text-xs text-white/80 bg-white/15 px-3 py-2.5 rounded-xl">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      pointageActif ? 'bg-white animate-pulse' : 'bg-white/40'
                    }`} />
                    {pointageActif ? `En service depuis ${heureArrivee}` : 'Hors service'}
                  </div>
                </div>
              </div>

              {/* Les trois chiffres que le salarié vient chercher.
                  Le solde de congés vient en premier : c'est celui
                  qu'il ouvrait la page pour voir. */}
              <div className="flex gap-3 flex-wrap lg:justify-end shrink-0">
                <ChiffreAccueil
                  icone={Palmtree}
                  valeur={chargement ? '…' : solde ? `${solde.restants} j` : '—'}
                  libelle="Congés restants"
                />
                <ChiffreAccueil
                  icone={CheckCircle2}
                  valeur={chargement ? '…' : nbOuvrables > 0 ? `${joursPresents}/${nbOuvrables}` : '—'}
                  libelle="Jours travaillés"
                />
                <ChiffreAccueil
                  icone={TrendingUp}
                  valeur={chargement ? '…' : formaterAnciennete(moisAnciennete)}
                  libelle="Ancienneté"
                />
              </div>
            </div>

            {/* ── Distinctions ── */}
            {!chargement && distinctions.length > 0 && (
              <div className="px-5 sm:px-7 py-3 bg-black/10 flex items-center gap-4 flex-wrap">
                {distinctions.map((d, i) => {
                  const Icone = d.icone;
                  return (
                    <span key={i} className="flex items-center gap-1.5 text-[11px] font-bold text-white/90">
                      <Icone className="w-3.5 h-3.5" />
                      {d.texte}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Trois anneaux ── */}
          {/* Les mêmes chiffres qu'avant, retournés : « ponctualité »
              plutôt que « retard cumulé ». Le détail sous le libellé
              garde les minutes brutes, donc rien n'est masqué. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chargement ? (
              <>
                <Squelette nb={1} h="h-32" />
                <Squelette nb={1} h="h-32" />
                <Squelette nb={1} h="h-32" />
              </>
            ) : (
              <>
                <CarteAnneau
                  delai={120}
                  icone={CheckCircle2}
                  titre="Présence"
                  valeur={tauxAssiduite}
                  affichage={derniereFacture ? `${Math.round(tauxAssiduite)}%` : '—'}
                  detail={derniereFacture
                    ? `${joursPresents} jours travaillés sur ${nbOuvrables} ouvrables`
                    : 'Aucun bulletin pour le moment'}
                  couleur="#4F46E5"
                />

                <CarteAnneau
                  delai={180}
                  icone={Clock}
                  titre="Ponctualité"
                  valeur={tauxPonctualite}
                  affichage={derniereFacture ? `${Math.round(tauxPonctualite)}%` : '—'}
                  detail={derniereFacture
                    ? (retardMin === 0
                      ? 'Aucun retard enregistré'
                      : `${retardMin} min de retard, soit ${Math.round(retardMoyen)} min par jour`)
                    : 'Aucun bulletin pour le moment'}
                  couleur={tauxPonctualite >= 80 ? '#4F46E5' : '#F59E0B'}
                  alerte={Boolean(derniereFacture) && tauxPonctualite < 80}
                />

                <CarteAnneau
                  delai={240}
                  icone={Palmtree}
                  titre="Congés restants"
                  valeur={partConges}
                  affichage={solde ? `${solde.restants}` : '—'}
                  detail={solde
                    ? `sur ${solde.total} jours · ${solde.utilises} pris`
                      + (solde.enAttente > 0 ? ` · ${solde.enAttente} en attente` : '')
                    : 'Solde indisponible'}
                  couleur="#4F46E5"
                />
              </>
            )}
          </div>

          {/* ── Ce qui vient ── */}
          {/* Congés et événements dans une seule file : c'est l'ordre
              chronologique qui répond à « qu'est-ce qui m'attend ». */}
          {!chargement && prochaines.length > 0 && (
            <Apparition delai={240}>
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                    <CalendarDays className="w-4 h-4 text-brand-texte" />
                    Ce qui vient
                  </h3>
                  <button
                    onClick={() => navigate('/employe/agenda')}
                    className="flex items-center gap-1 text-xs font-bold text-brand-texte hover:underline"
                  >
                    Mon agenda <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Une file horizontale qui défile sur téléphone : quatre
                    échéances empilées verticalement occuperaient tout
                    l'écran avant les chiffres de paie. */}
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                  {prochaines.map((e, i) => {
                    const jours = Math.max(0, Math.ceil(
                      (new Date(e.debut).getTime() - maintenant) / 86400000
                    ));
                    const conge = e.genre === 'conge';

                    return (
                      <button
                        key={e.id}
                        onClick={() => navigate(e.route)}
                        style={{ animationDelay: `${280 + i * 70}ms` }}
                        className="hrup-monter hrup-carte snap-start shrink-0 w-64 text-start rounded-xl border border-stone-100 bg-stone-50 hover:bg-surface hover:shadow-md p-4"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            conge ? 'bg-brand-500/10' : 'bg-blue-50'
                          }`}>
                            {conge
                              ? <Palmtree className="w-4 h-4 text-brand-texte" />
                              : e.visio
                                ? <Video className="w-4 h-4 text-blue-600" />
                                : <CalendarDays className="w-4 h-4 text-blue-600" />}
                          </span>

                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-surface text-stone-500 border border-stone-100">
                            {jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `J-${jours}`}
                          </span>
                        </div>

                        <div className="text-sm font-bold text-stone-800 truncate">
                          {e.titre}
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                          {e.detail}
                        </p>

                        {e.inscrit && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold mt-2 px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-texte">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Inscrit
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Apparition>
          )}

          {/* ── Paie et congés ── */}
          {/* Deux tiers / un tiers : la paie porte une courbe et trois
              lignes, le solde de congés une barre. Leur donner la même
              largeur aurait laissé un vide à droite. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <Apparition delai={300} className="lg:col-span-2">
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6 h-full">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-brand-texte" />
                    Ma paie
                  </h3>
                  {factures.length > 0 && (
                    <button
                      onClick={() => navigate('/employe/factures')}
                      className="flex items-center gap-1 text-xs font-bold text-brand-texte hover:underline"
                    >
                      Voir tout <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {chargement ? <Squelette nb={3} /> : factures.length === 0 ? (
                  <Vide icone={FileText} texte="Aucune fiche de paie disponible" />
                ) : (
                  <>
                    {/* Le dernier net en grand, et la tendance à côté :
                        un chiffre seul ne dit pas s'il monte. */}
                    <div className="flex items-end justify-between gap-4 pb-5 mb-4 border-b border-stone-100">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                          Dernier net perçu
                        </div>
                        <div className="text-3xl font-bold text-stone-800 mt-1">
                          {netAnime.toFixed(3)}
                          <span className="text-sm font-normal text-stone-400 ms-1.5">TND</span>
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {derniereFacture?.moisLabel}
                        </div>
                      </div>

                      {courbeNet.length > 1 && (
                        <div className="text-end">
                          <Courbe valeurs={courbeNet} />
                          <div className="text-[10px] text-stone-400 mt-1">
                            {courbeNet.length} derniers bulletins
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {factures.slice(0, 3).map((f: any, i: number) => (
                        <div
                          key={f.id}
                          style={{ animationDelay: `${380 + i * 70}ms` }}
                          className="hrup-monter flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-stone-800">
                              {f.moisLabel}
                            </div>
                            <div className="text-[10px] font-mono text-stone-400 truncate">
                              {f.numero}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm text-brand-texte">
                              {f.salaireNet?.toFixed(3)}
                            </span>
                            {/* Le PDF vit sur S3 (ou sur disque en local) :
                                on passe par l'API plutôt que par un base64
                                embarqué. */}
                            {f.pdfKey && (
                              <button
                                onClick={async () => {
                                  try {
                                    const blob = await api.get(
                                      `/factures/pdf/${encodeURIComponent(f.id)}`,
                                      { responseType: 'blob' }
                                    ) as unknown as Blob;
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${f.numero}.pdf`;
                                    a.click();
                                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                                  } catch {
                                    setToast('Bulletin indisponible');
                                  }
                                }}
                                className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                                title="Télécharger le bulletin"
                              >
                                <Download className="w-3.5 h-3.5 text-brand-texte" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Apparition>

            <Apparition delai={360}>
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6 h-full flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                    <Palmtree className="w-4 h-4 text-brand-texte" />
                    Mes congés
                  </h3>
                  <button
                    onClick={() => setModalConge(true)}
                    className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Demander
                  </button>
                </div>

                {chargement ? <Squelette nb={2} /> : (
                  <>
                    {solde && (
                      <div className="mb-5">
                        <div className="flex items-baseline gap-1.5 mb-3">
                          <span className="text-3xl font-bold text-stone-800">
                            {solde.restants}
                          </span>
                          <span className="text-sm text-stone-400">
                            jour{solde.restants > 1 ? 's' : ''} restants sur {solde.total}
                          </span>
                        </div>

                        <BarreConges
                          pris={solde.utilises}
                          enAttente={solde.enAttente}
                          total={solde.total}
                        />
                      </div>
                    )}

                    <div className="space-y-2 flex-1">
                      {conges.length === 0 ? (
                        <Vide
                          icone={Calendar}
                          texte="Aucune demande"
                          action={
                            <button
                              onClick={() => setModalConge(true)}
                              className="text-sm font-bold text-brand-texte hover:underline"
                            >
                              Poser des dates
                            </button>
                          }
                        />
                      ) : conges.slice(0, 3).map((c, i) => {
                        const style = styleConge(c.statut);
                        const StatutIcone = style.icon;
                        return (
                          <div
                            key={c.id}
                            style={{ animationDelay: `${440 + i * 70}ms` }}
                            className="hrup-monter flex items-center justify-between gap-2 p-3 rounded-xl bg-stone-50"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-stone-800 truncate">
                                {libelle(LIBELLES_TYPE_CONGE, c.type)}
                              </div>
                              <div className="text-[10px] text-stone-400">
                                {jourCourt(c.dateDebut)} → {jourCourt(c.dateFin)}
                              </div>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${style.bg} ${style.text}`}
                              title={libelle(LIBELLES_STATUT_CONGE, c.statut)}
                            >
                              <StatutIcone className="w-3 h-3" />
                              {libelle(LIBELLES_STATUT_CONGE, c.statut)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </Apparition>
          </div>

          {/* ── Le mois en chiffres, les accès, les frais ── */}
          {/* Les accès rapides remontent sous les chiffres du mois et
              absorbent la hauteur restante : les trois cartes finissent
              exactement sur la même ligne, au lieu de laisser un vide
              sous les quatre chiffres quand les frais sont vides. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            <div className="lg:col-span-2 flex flex-col gap-4">
            <Apparition delai={420}>
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-brand-texte" />
                    Mon mois en chiffres
                  </h3>
                  {derniereFacture && (
                    <span className="text-xs text-stone-400">{derniereFacture.moisLabel}</span>
                  )}
                </div>

                {chargement ? <Squelette nb={1} h="h-20" /> : !derniereFacture ? (
                  <Vide icone={TrendingUp} texte="Aucun bulletin disponible pour le moment" />
                ) : (
                  // Les anneaux plus haut donnent déjà les pourcentages :
                  // ici les chiffres bruts, ceux qu'on vérifie contre un
                  // bulletin de paie.
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      [String(joursPresents), 'jours travaillés'],
                      [String(nbOuvrables), 'jours ouvrables'],
                      [String(joursAbsents), joursAbsents === 1 ? 'absence' : 'absences'],
                      [`${retardMin} min`, 'de retard cumulé'],
                    ] as [string, string][]).map(([valeur, texte], i) => (
                      <div
                        key={texte}
                        style={{ animationDelay: `${480 + i * 70}ms` }}
                        className="hrup-monter p-4 rounded-xl bg-stone-50"
                      >
                        <div className="text-xl font-bold text-stone-800">{valeur}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">{texte}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Apparition>

            <Apparition delai={540} className="flex-1">
              <BandeAcces />
            </Apparition>
            </div>

            <Apparition delai={480}>
              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 sm:p-6 h-full">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h3 className="font-bold text-stone-800 flex items-center gap-2 text-sm">
                    <Receipt className="w-4 h-4 text-brand-texte" />
                    Notes de frais
                  </h3>
                  <button
                    onClick={() => navigate('/notes-frais')}
                    className="flex items-center gap-1 text-xs font-bold text-brand-texte hover:underline"
                  >
                    Gérer <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {chargement ? <Squelette nb={2} h="h-12" />
                  : !frais || (frais.aRembourser === 0 && frais.enAttente === 0) ? (
                  <Vide
                    icone={Receipt}
                    texte="Aucune dépense en cours"
                    action={
                      <button
                        onClick={() => navigate('/notes-frais')}
                        className="text-sm font-bold text-brand-texte hover:underline"
                      >
                        Déclarer une dépense
                      </button>
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="p-4 rounded-xl bg-stone-50">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                        À rembourser
                      </span>
                      <div className="text-2xl font-bold mt-1 text-brand-texte">
                        {tnd(frais.aRembourser)}
                      </div>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        sur le prochain bulletin
                      </p>
                    </div>

                    {frais.enAttente > 0 && (
                      <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 bg-amber-50 text-amber-700">
                        <Hourglass className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {tnd(frais.enAttente)} en attente de validation
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Apparition>
          </div>
        </div>

        {modalPointage && (
          <ModalPointage
            depart={pointageActif}
            facialDisponible={facialDisponible}
            onClose={() => setModalPointage(false)}
            onSuccess={(msg) => { setToast(msg); chargerPointage(); }}
          />
        )}

        {modalConge && (
          <ModalDemandeConge
            onClose={() => setModalConge(false)}
            onSuccess={() => {
              setToast('Demande de congé envoyée');
              chargerConges();
            }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}