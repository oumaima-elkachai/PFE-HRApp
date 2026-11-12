// src/pages/admin/RecruitmentPage.tsx
//
// Page centrée sur les offres d'emploi. Les candidatures ont leur
// propre écran : ici, on publie, modifie et suit le remplissage des
// postes.
//
// Habillage commun aux écrans de recrutement : palette pierre, accent
// #4a7c59, cartes arrondies, fil d'Ariane.

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Eye, X, Pencil, Briefcase, Trash2, Star, Send, Users,
  MapPin, Calendar as CalendarIcon, Search, CheckCircle2,
  Archive, Flame, AlertTriangle, ChevronRight, MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { candidatsService } from '../../services/candidats';
import api from '../../services/api';
import type { Candidat } from '../../types';
import {
  LIBELLES_STATUT_OFFRE,
  LIBELLES_STATUT_CANDIDATURE,
  STATUTS_OFFRE,
  PIPELINE_RECRUTEMENT,
  libelle,
} from '../../types/domaine';
import type { StatutOffre, StatutCandidature } from '../../types/domaine';
import ResultatsQuiz from '@/components/recrutement/ResultatsQuiz';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 5;

// ── Types ──────────────────────────────────────────────────────────

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description?: string;
  competences?: string[];
  statut: StatutOffre;
  urgente?: boolean;
  nombrePostes?: number;
  // Calculés par le serveur à chaque lecture, jamais stockés
  postesPourvus?: number;
  postesRestants?: number;
  complet?: boolean;
  creeLe: string;
}

// ── Styles ─────────────────────────────────────────────────────────
// Le style vit ici ; les libellés viennent de types/domaine.ts.
const STYLE_OFFRE: Record<StatutOffre, { bg: string; text: string; dot: string }> = {
  ACTIVE:   { bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
  POURVUE:  { bg: 'bg-blue-50',      text: 'text-blue-600',   dot: 'bg-blue-400' },
  ARCHIVEE: { bg: 'bg-stone-100',    text: 'text-stone-500',  dot: 'bg-stone-400' },
};

// Un statut inattendu ne doit jamais faire tomber la page
const STYLE_OFFRE_DEFAUT = { bg: 'bg-stone-50', text: 'text-stone-500', dot: 'bg-stone-400' };

const styleOffre = (s: string) => STYLE_OFFRE[s as StatutOffre] ?? STYLE_OFFRE_DEFAUT;

const STYLE_CANDIDATURE: Record<string, { bg: string; text: string; dot: string }> = {
  SOUMIS:          { bg: 'bg-blue-50',      text: 'text-blue-600',   dot: 'bg-blue-400' },
  PRESELECTION:    { bg: 'bg-amber-50',     text: 'text-amber-600',  dot: 'bg-amber-400' },
  QUIZ_EN_ATTENTE: { bg: 'bg-orange-50',    text: 'text-orange-600', dot: 'bg-orange-400' },
  QUIZ_ENVOYE:     { bg: 'bg-indigo-50',    text: 'text-indigo-600', dot: 'bg-indigo-400' },
  QUIZ_TERMINE:    { bg: 'bg-cyan-50',      text: 'text-cyan-600',   dot: 'bg-cyan-400' },
  ENTRETIEN:       { bg: 'bg-purple-50',    text: 'text-purple-600', dot: 'bg-purple-400' },
  OFFRE:           { bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
  EMBAUCHE:        { bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
  REFUSE:          { bg: 'bg-red-50',       text: 'text-red-500',    dot: 'bg-red-400' },
};

const styleCandidature = (s: string) => STYLE_CANDIDATURE[s] ?? STYLE_OFFRE_DEFAUT;

// Ce que recouvre chaque statut, affiché dans le formulaire : la
// distinction entre pourvue et archivée n'est pas évidente.
const AIDE_STATUT: Record<StatutOffre, string> = {
  ACTIVE: 'Visible sur le site carrière, accepte les candidatures',
  POURVUE: 'Le poste a été pourvu, le recrutement a abouti',
  ARCHIVEE: 'Fermée sans embauche — budget annulé, poste reporté',
};

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];
const TYPES_CONTRAT = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE'];
const MODES_TRAVAIL = ['PRESENTIEL', 'HYBRIDE', 'DISTANCIEL'];

// ── Aides ──────────────────────────────────────────────────────────
function initiales(prenom: string, nom: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();
}

const couleurScore = (s?: number) =>
  s == null ? 'text-stone-400'
    : s >= 75 ? 'text-brand-texte'
    : s >= 50 ? 'text-amber-500'
    : 'text-red-400';

const barreScore = (s: number) =>
  s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-400';

// ── Petits composants ──────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, fond, texte,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  fond: string;
  texte: string;
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function Avatar({ prenom, nom, size = 'md' }: {
  prenom: string; nom: string; size?: 'sm' | 'md' | 'lg';
}) {
  const taille = size === 'sm' ? 'w-8 h-8 text-[10px]'
               : size === 'lg' ? 'w-11 h-11 text-sm'
               : 'w-9 h-9 text-xs';
  return (
    <div className={`${taille} rounded-xl flex items-center justify-center font-bold shrink-0 bg-brand-500/10 text-brand-texte`}>
      {initiales(prenom, nom)}
    </div>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${couleurScore(score)}`}>
      <Star className="w-2.5 h-2.5" fill="currentColor" />{score}
    </span>
  );
}

function BadgeStatutOffre({ statut }: { statut: string }) {
  const st = styleOffre(statut);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {libelle(LIBELLES_STATUT_OFFRE, statut)}
    </span>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-60">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-70">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Confirmation ───────────────────────────────────────────────────
// Le confirm() natif affiche la boîte du navigateur, étrangère au
// design et impossible à styler.
function ModalConfirmation({
  titre, message, libelleAction, onConfirmer, onAnnuler,
}: {
  titre: string;
  message: string;
  libelleAction: string;
  onConfirmer: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);

  const confirmer = async () => {
    setEnvoi(true);
    await onConfirmer();
    setEnvoi(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">{titre}</h2>
            <p className="text-sm text-stone-500 mt-1">{message}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onAnnuler}
            disabled={envoi}
            className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={confirmer}
            disabled={envoi}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {envoi
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            {envoi ? 'Suppression…' : libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modale : détail d'une offre ────────────────────────────────────
function ModalDetailOffre({
  offre, candidats, onClose, onVoirCandidat,
}: {
  offre: Offre;
  candidats: Candidat[];
  onClose: () => void;
  onVoirCandidat: (c: Candidat) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="font-bold text-lg text-stone-800">{offre.titre}</h2>
              <BadgeStatutOffre statut={offre.statut} />
              {offre.urgente && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-500">
                  <Flame className="w-3 h-3" />
                  Urgent
                </span>
              )}
            </div>
            <p className="text-sm text-stone-500">
              {offre.departement} · {offre.type} · {offre.modeTravail}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-3 gap-3">
            {([
              ['Département', offre.departement, Briefcase],
              ['Mode', offre.modeTravail, MapPin],
              ['Publiée le', new Date(offre.creeLe).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', year: 'numeric',
              }), CalendarIcon],
            ] as [string, string, any][]).map(([label, valeur, Icone]) => (
              <div key={label} className="bg-stone-50 rounded-xl p-3">
                <div className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                  <Icone className="w-3 h-3" />
                  {label}
                </div>
                <div className="text-sm font-medium text-stone-800 truncate">{valeur}</div>
              </div>
            ))}
          </div>

          {/* Remplissage, utile dès qu'il y a plus d'un poste */}
          {(offre.nombrePostes ?? 1) > 1 && (
            <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Remplissage
                </span>
                <span className="text-sm font-bold text-stone-800">
                  {offre.postesPourvus ?? 0} sur {offre.nombrePostes} postes
                </span>
              </div>
              <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${offre.complet ? 'bg-blue-500' : 'bg-brand-500'}`}
                  style={{
                    width: `${Math.min(100,
                      ((offre.postesPourvus ?? 0) / (offre.nombrePostes ?? 1)) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs mt-1.5 text-stone-500">
                {offre.complet
                  ? 'Tous les postes sont pourvus'
                  : `${offre.postesRestants} poste${(offre.postesRestants ?? 0) > 1 ? 's' : ''} encore à pourvoir`}
              </p>
            </div>
          )}

          {offre.description && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Description</div>
              <p className="text-sm text-stone-700 bg-stone-50 rounded-xl p-3 leading-relaxed whitespace-pre-line">
                {offre.description}
              </p>
            </div>
          )}

          <div className="border-t border-stone-100 pt-4">
            <div className="text-xs font-medium text-stone-500 mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Candidats ({candidats.length})
            </div>
            {candidats.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">
                Aucun candidat sur cette offre pour le moment
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {candidats.map(c => {
                  const style = styleCandidature(c.statut);
                  return (
                    <div
                      key={c.id}
                      onClick={() => onVoirCandidat(c)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 hover:bg-stone-100 cursor-pointer transition-colors"
                    >
                      <Avatar prenom={c.prenom} nom={c.nom} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-stone-800 truncate">
                          {c.prenom} {c.nom}
                        </div>
                        <div className="text-xs text-stone-400 truncate">{c.email}</div>
                      </div>
                      <ScoreBadge score={(c as any).scoreCV} />
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${style.bg} ${style.text}`}>
                        {libelle(LIBELLES_STATUT_CANDIDATURE, c.statut)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Formulaire d'offre, partagé création / modification ────────────
interface FormulaireOffre {
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description: string;
  statut: StatutOffre;
  urgente: boolean;
  nombrePostes: number;
}

function ModalOffre({
  offre, onClose, onSuccess,
}: {
  offre?: Offre;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const modification = !!offre;

  const [form, setForm] = useState<FormulaireOffre>({
    titre: offre?.titre ?? '',
    departement: offre?.departement ?? 'Informatique',
    type: offre?.type ?? 'CDI',
    modeTravail: offre?.modeTravail ?? 'HYBRIDE',
    description: offre?.description ?? '',
    statut: offre?.statut ?? 'ACTIVE',
    urgente: offre?.urgente ?? false,
    nombrePostes: offre?.nombrePostes ?? 1,
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim()) {
      setErreur('Le titre est requis');
      return;
    }
    setLoading(true);
    setErreur('');
    try {
      if (modification) {
        await api.put(`/offres/${offre!.id}`, form);
        onSuccess('Offre mise à jour');
      } else {
        await api.post('/offres', form);
        onSuccess('Offre publiée sur le site carrière');
      }
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const champCls =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800">
              {modification ? "Modifier l'offre" : 'Publier une offre'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {modification ? offre!.titre : 'Elle sera visible sur le site carrière'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Titre du poste *
            </label>
            <input
              required
              value={form.titre}
              onChange={e => setForm({ ...form, titre: e.target.value })}
              placeholder="ex : Développeur full stack senior"
              className={champCls}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {([
              ['Département', 'departement', DEPARTEMENTS],
              ['Contrat', 'type', TYPES_CONTRAT],
              ['Mode', 'modeTravail', MODES_TRAVAIL],
            ] as [string, keyof FormulaireOffre, string[]][]).map(([label, cle, options]) => (
              <div key={cle}>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  {label}
                </label>
                <select
                  value={form[cle] as string}
                  onChange={e => setForm({ ...form, [cle]: e.target.value })}
                  className={champCls}
                >
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Postes à pourvoir
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={form.nombrePostes}
              onChange={e => setForm({ ...form, nombrePostes: Math.max(1, Number(e.target.value)) })}
              className={champCls}
            />
            <p className="text-xs text-stone-400 mt-1">
              L'offre sera signalée comme complète quand ce nombre d'embauches sera atteint.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Missions, profil recherché, compétences attendues…"
              className={`${champCls} resize-none`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Statut
            </label>
            <div className="flex gap-2 mb-2">
              {STATUTS_OFFRE.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, statut: s })}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    form.statut === s
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500'
                  }`}
                >
                  {LIBELLES_STATUT_OFFRE[s]}
                </button>
              ))}
            </div>
            {/* La distinction entre pourvue et archivée n'est pas
                évidente : l'expliciter évite un mauvais classement. */}
            <p className="text-xs text-stone-400">{AIDE_STATUT[form.statut]}</p>
          </div>

          {/* L'urgence est indépendante du statut : une offre active
              peut être urgente, une offre pourvue ne l'est plus. */}
          <label className="flex items-start gap-3 cursor-pointer bg-stone-50 rounded-xl p-3">
            <input
              type="checkbox"
              checked={form.urgente}
              onChange={e => setForm({ ...form, urgente: e.target.checked })}
              className="mt-0.5 accent-brand-texte"
            />
            <span>
              <span className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-red-500" />
                Recrutement urgent
              </span>
              <span className="block text-xs text-stone-400 mt-0.5">
                L'offre apparaît en tête de liste et porte un badge
              </span>
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
            >
              {loading ? 'Enregistrement…' : modification ? 'Enregistrer' : "Publier l'offre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modale : détail d'un candidat ──────────────────────────────────
function ModalCandidatDetail({
  candidat, onClose, onChangerStatut,
}: {
  candidat: Candidat;
  onClose: () => void;
  onChangerStatut: (id: string, statut: string, commentaire: string) => void;
}) {
  const navigate = useNavigate();
  const [nouveauStatut, setNouveauStatut] = useState<string>(candidat.statut);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);

  const analyse = (candidat as any).analyseIA ?? {};
  const score = (candidat as any).scoreCV;
  const recommandation = (candidat as any).recommendation;

  const handleSave = async () => {
    setLoading(true);
    await onChangerStatut(candidat.id, nouveauStatut, commentaire);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar prenom={candidat.prenom} nom={candidat.nom} size="lg" />
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-stone-800 truncate">
                {candidat.prenom} {candidat.nom}
              </h2>
              <p className="text-sm text-stone-500 truncate">
                {(candidat as any).offreTitre ?? candidat.posteVise}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Email', v: candidat.email },
              { l: 'Téléphone', v: candidat.telephone || '—' },
              { l: 'Niveau', v: candidat.niveauEtude || '—' },
              { l: 'Expérience', v: candidat.experience || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-stone-50 rounded-xl p-3">
                <div className="text-xs text-stone-500 mb-1">{l}</div>
                <div className="text-sm font-medium text-stone-800 truncate">{v}</div>
              </div>
            ))}
          </div>

          {/* Scores consolidés : le global pondère CV et quiz */}
          <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-brand-texte" fill="currentColor" />
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Scores
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['Score CV', (candidat as any).scoreCV],
                ['Score quiz', (candidat as any).scoreQuiz],
                ['Score global', (candidat as any).scoreTotal],
              ] as [string, number | undefined][]).map(([label, valeur]) => (
                <div key={label} className="bg-surface rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-stone-800">
                    {valeur ?? '—'}
                    <span className="text-sm text-stone-500 font-normal">/100</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">{label}</div>
                  {valeur != null && (
                    <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${barreScore(valeur)}`}
                        style={{ width: `${valeur}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate(`/messages/${candidat.id}`)}
            className="flex items-center gap-1.5 bg-surface border border-stone-200 text-stone-600 px-4 py-2 rounded-xl text-xs font-medium hover:bg-stone-50 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Écrire au candidat
          </button>

          {score !== undefined && (
            <div className="bg-stone-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Analyse du CV
                </span>
                {/* Rend visible le repli sans IA : sans cela, un score
                    calculé par mots-clés passe pour une analyse réussie */}
                {(candidat as any).sourceAnalyse === 'fallback' && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    Analyse dégradée
                  </span>
                )}
              </div>

              <p className="text-xs text-stone-500 mb-3">
                {recommandation === 'ACCEPTER' ? 'Profil recommandé'
                  : recommandation === 'HESITER' ? 'À évaluer'
                  : 'Non retenu'}
              </p>

              {analyse.resumeAnalyse && (
                <p className="text-sm italic text-stone-600 ps-3 border-s-2 border-brand-500 mb-3">
                  {analyse.resumeAnalyse}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {(analyse.competencesMatchees ?? []).map((c: string) => (
                  <span key={c} className="text-xs bg-green-50 text-green-600 px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
                {(analyse.competencesManquantes ?? []).map((c: string) => (
                  <span key={c} className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.competences?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Compétences déclarées</div>
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map((c, i) => (
                  <span key={i} className="text-xs bg-brand-500/10 text-brand-texte px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.lettreMotivation && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Lettre de motivation</div>
              <p className="text-xs text-stone-700 bg-stone-50 rounded-xl p-3 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-line custom-scrollbar">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          <div className="border-t border-stone-100 pt-4">
            <div className="text-xs font-medium text-stone-500 mb-3">Évaluation technique</div>
            <ResultatsQuiz candidatureId={candidat.id} />
          </div>

          {(candidat.historiqueStatuts?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-medium text-stone-500 mb-2">Historique</div>
              <div className="space-y-2 max-h-28 overflow-y-auto custom-scrollbar">
                {[...(candidat.historiqueStatuts ?? [])].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-stone-800">
                        {libelle(LIBELLES_STATUT_CANDIDATURE, h.statut)}
                      </span>
                      {h.commentaire && <span className="text-stone-500 ms-1">— {h.commentaire}</span>}
                      <div className="text-stone-400">
                        {new Date(h.date).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-stone-100 pt-4">
            <div className="text-xs font-medium text-stone-500 mb-3">
              Faire avancer la candidature
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[...PIPELINE_RECRUTEMENT, 'REFUSE' as StatutCandidature].map(s => (
                <button
                  key={s}
                  onClick={() => setNouveauStatut(s)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                    nouveauStatut === s
                      ? 'bg-brand-500 text-white border-brand-500'
                      : s === 'REFUSE'
                        ? 'bg-surface text-red-500 border-red-200 hover:border-red-400'
                        : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500'
                  }`}
                >
                  {LIBELLES_STATUT_CANDIDATURE[s]}
                </button>
              ))}
            </div>

            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Commentaire (optionnel)…"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 resize-none mb-3"
            />

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={handleSave}
                disabled={loading || nouveauStatut === candidat.statut}
                className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4" />}
                {loading ? 'Enregistrement…' : 'Mettre à jour'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [offres, setOffres] = useState<Offre[]>([]);
  const [loadingC, setLoadingC] = useState(true);
  const [loadingO, setLoadingO] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<string>('tous');
  const [page, setPage] = useState(0);
  const [creationOffre, setCreationOffre] = useState(false);
  const [offreAModifier, setOffreAModifier] = useState<Offre | null>(null);
  const [offreDetail, setOffreDetail] = useState<Offre | null>(null);
  const [offreASupprimer, setOffreASupprimer] = useState<Offre | null>(null);
  const [candidatSel, setCandidatSel] = useState<Candidat | null>(null);
  const [toast, setToast] = useState('');

  const chargerCandidats = async () => {
    try {
      setLoadingC(true);
      const res = await candidatsService.lister() as any;
      // Le serveur renvoie data.candidatures depuis la fusion des tables
      setCandidats(res?.data?.candidatures ?? []);
    } catch (e) {
      console.error('Chargement des candidatures :', e);
      setCandidats([]);
    } finally {
      setLoadingC(false);
    }
  };

  const chargerOffres = async () => {
    try {
      setLoadingO(true);
      const res = await api.get('/offres') as any;
      setOffres(res?.data?.offres ?? []);
    } catch (e) {
      console.error('Chargement des offres :', e);
      setOffres([]);
    } finally {
      setLoadingO(false);
    }
  };

  useEffect(() => {
    chargerCandidats();
    chargerOffres();
  }, []);

  const handleChangerStatut = async (id: string, statut: string, commentaire: string) => {
    try {
      await candidatsService.changerStatut(id, statut, commentaire);
      await chargerCandidats();
      // Le remplissage des offres se recalcule côté serveur : une
      // embauche change la jauge, il faut donc recharger les deux.
      await chargerOffres();
      setToast('Statut du candidat mis à jour');
    } catch (e) {
      console.error('Changement de statut :', e);
      setToast('Impossible de mettre à jour le statut');
    }
  };

  const handleSupprimerOffre = async (offre: Offre) => {
    try {
      await api.delete(`/offres/${offre.id}`);
      setOffreASupprimer(null);
      chargerOffres();
      setToast(`Offre « ${offre.titre} » supprimée`);
    } catch (e) {
      console.error('Suppression :', e);
      setOffreASupprimer(null);
      setToast("Impossible de supprimer l'offre");
    }
  };

  const candidatsDeLoffre = (offre: Offre) =>
    candidats.filter(c =>
      (c as any).offreId === offre.id || (c as any).offreTitre === offre.titre
    );

  // ── Filtrage et tri ──
  // Les urgentes remontent en tête : c'est la raison d'être du
  // marquage.
  const offresAffichees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return offres
      .filter(o => {
        if (filtreStatut !== 'tous' && o.statut !== filtreStatut) return false;
        if (!terme) return true;
        return `${o.titre} ${o.departement} ${o.type}`.toLowerCase().includes(terme);
      })
      .sort((a, b) => {
        if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
        return String(b.creeLe).localeCompare(String(a.creeLe));
      });
  }, [offres, recherche, filtreStatut]);

  const pageCourante = useMemo(
    () => offresAffichees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [offresAffichees, page]
  );

  // Un filtre qui réduit la liste doit ramener à la première page :
  // rester sur la page 3 d'un résultat qui n'en compte plus qu'une
  // afficherait un tableau vide.
  useEffect(() => { setPage(0); }, [recherche, filtreStatut]);

  // ── Indicateurs, tous relatifs aux offres ──
  // La page porte sur les offres : des statistiques sur les candidats
  // décriraient un autre écran.
  const parStatut = (s: StatutOffre) => offres.filter(o => o.statut === s).length;

  const candidaturesRecues = candidats.filter(c => (c as any).offreId).length;
  const moyenneParOffre = offres.length
    ? Math.round((candidaturesRecues / offres.length) * 10) / 10
    : 0;

  const pourvues = parStatut('POURVUE');
  const cloturees = pourvues + parStatut('ARCHIVEE');
  const tauxReussite = cloturees > 0 ? Math.round((pourvues / cloturees) * 100) : 0;

  const completesEnLigne = offres.filter(o => o.complet && o.statut === 'ACTIVE');

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher une offre…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Recrutement</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Offres</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Offres d'emploi</h2>
            <p className="text-stone-500 mt-1">
              {loadingO ? 'Chargement…' : (
                <>
                  {parStatut('ACTIVE')} offre{parStatut('ACTIVE') > 1 ? 's' : ''} en ligne
                  {' '}sur {offres.length} publiée{offres.length > 1 ? 's' : ''}
                  {candidaturesRecues > 0 && ` · ${candidaturesRecues} candidature${candidaturesRecues > 1 ? 's' : ''}`}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Titre, département…"
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
              />
            </div>

            <select
              value={filtreStatut}
              onChange={e => setFiltreStatut(e.target.value)}
              className={`px-3 py-2 text-sm bg-surface border rounded-xl shadow-sm focus:outline-none transition-colors ${
                filtreStatut !== 'tous'
                  ? 'border-brand-500 text-brand-texte font-medium'
                  : 'border-stone-200 text-stone-600'
              }`}
            >
              <option value="tous">Tous les statuts</option>
              {STATUTS_OFFRE.map(s => (
                <option key={s} value={s}>{LIBELLES_STATUT_OFFRE[s]}</option>
              ))}
            </select>

            <button
              onClick={() => setCreationOffre(true)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Publier
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* Une offre complète qui reste en ligne continue de recevoir
              des candidatures pour un poste déjà pourvu. */}
          {completesEnLigne.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-6 text-sm bg-blue-50 text-blue-600">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {completesEnLigne.length === 1
                  ? `« ${completesEnLigne[0].titre} » a tous ses postes pourvus mais reste en ligne. Passez-la en « Pourvue » pour la retirer du site carrière.`
                  : `${completesEnLigne.length} offres ont tous leurs postes pourvus mais restent en ligne. Passez-les en « Pourvue » pour les retirer du site carrière.`}
              </span>
            </div>
          )}

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Send}
              label="Offres en ligne"
              value={loadingO ? '…' : parStatut('ACTIVE')}
              sub={`sur ${offres.length} publiée${offres.length > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={Users}
              label="Candidatures reçues"
              value={loadingC ? '…' : candidaturesRecues}
              sub={moyenneParOffre > 0 ? `${moyenneParOffre} par offre en moyenne` : undefined}
              fond="bg-purple-50"
              texte="text-purple-600"
            />
            <StatCard
              icon={CheckCircle2}
              label="Postes pourvus"
              value={loadingO ? '…' : pourvues}
              sub={cloturees > 0 ? `${tauxReussite} % des offres clôturées` : 'aucune clôture'}
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={Archive}
              label="Archivées"
              value={loadingO ? '…' : parStatut('ARCHIVEE')}
              sub="fermées sans embauche"
              fond="bg-stone-100"
              texte="text-stone-500"
            />
          </div>

          {/* ── Tableau ── */}
          {loadingO ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-48" />
                      <div className="h-3 bg-stone-100 rounded w-32" />
                    </div>
                    <div className="h-6 bg-stone-100 rounded-full w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : offresAffichees.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {recherche || filtreStatut !== 'tous'
                  ? 'Aucune offre ne correspond'
                  : 'Aucune offre publiée'}
              </p>
              {!recherche && filtreStatut === 'tous' && (
                <button
                  onClick={() => setCreationOffre(true)}
                  className="text-sm font-bold text-brand-texte hover:underline mt-2"
                >
                  Publier la première offre
                </button>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    {['Poste', 'Département', 'Contrat', 'Postes pourvus', 'Statut', 'Publiée', ''].map(h => (
                      <th
                        key={h}
                        className="text-start px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageCourante.map(offre => {
                    const nbCandidats = candidatsDeLoffre(offre).length;
                    return (
                      <tr
                        key={offre.id}
                        className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-stone-800">{offre.titre}</span>
                            {offre.urgente && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                                <Flame className="w-2.5 h-2.5" />
                                Urgent
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-400">{offre.modeTravail}</div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-sm text-stone-700">{offre.departement}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="text-xs font-bold bg-stone-100 text-stone-500 px-2.5 py-1 rounded-full">
                            {offre.type}
                          </span>
                        </td>

                        {/* Jauge de remplissage : elle porte à la fois le
                            nombre de postes pourvus et celui des
                            candidats, sans colonne supplémentaire. */}
                        <td className="px-4 py-3">
                          <div className="min-w-23">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-stone-800">
                                {offre.postesPourvus ?? 0} / {offre.nombrePostes ?? 1}
                              </span>
                              {nbCandidats > 0 && (
                                <button
                                  onClick={() => setOffreDetail(offre)}
                                  className="text-brand-texte hover:underline font-medium"
                                  title="Voir les candidats"
                                >
                                  {nbCandidats} cand.
                                </button>
                              )}
                            </div>
                            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  offre.complet ? 'bg-blue-500' : 'bg-brand-500'
                                }`}
                                style={{
                                  width: `${Math.min(100,
                                    ((offre.postesPourvus ?? 0) / (offre.nombrePostes ?? 1)) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <BadgeStatutOffre statut={offre.statut} />
                        </td>

                        <td className="px-4 py-3 text-sm text-stone-500">
                          {new Date(offre.creeLe).toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'short',
                          })}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setOffreDetail(offre)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Voir l'offre et ses candidats"
                            >
                              <Eye className="w-4 h-4 text-stone-400" />
                            </button>
                            <button
                              onClick={() => setOffreAModifier(offre)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-4 h-4 text-stone-400 hover:text-blue-500" />
                            </button>
                            <button
                              onClick={() => setOffreASupprimer(offre)}
                              className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-stone-400 hover:text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={offresAffichees.length}
                onPage={setPage}
                libelle="offre"
                accent={ACCENT}
              />
            </div>
          )}
        </div>

        {creationOffre && (
          <ModalOffre
            onClose={() => setCreationOffre(false)}
            onSuccess={(msg) => { setToast(msg); chargerOffres(); }}
          />
        )}
        {offreAModifier && (
          <ModalOffre
            offre={offreAModifier}
            onClose={() => setOffreAModifier(null)}
            onSuccess={(msg) => { setToast(msg); chargerOffres(); }}
          />
        )}
        {offreDetail && (
          <ModalDetailOffre
            offre={offreDetail}
            candidats={candidatsDeLoffre(offreDetail)}
            onClose={() => setOffreDetail(null)}
            onVoirCandidat={c => { setOffreDetail(null); setCandidatSel(c); }}
          />
        )}
        {candidatSel && (
          <ModalCandidatDetail
            candidat={candidatSel}
            onClose={() => setCandidatSel(null)}
            onChangerStatut={handleChangerStatut}
          />
        )}
        {offreASupprimer && (
          <ModalConfirmation
            titre="Supprimer cette offre ?"
            message={
              candidatsDeLoffre(offreASupprimer).length > 0
                ? `« ${offreASupprimer.titre} » compte ${candidatsDeLoffre(offreASupprimer).length} candidature(s). Archivez-la plutôt pour conserver l'historique.`
                : `« ${offreASupprimer.titre} » sera définitivement supprimée.`
            }
            libelleAction="Supprimer"
            onConfirmer={() => handleSupprimerOffre(offreASupprimer)}
            onAnnuler={() => setOffreASupprimer(null)}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #DFE3F0;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}