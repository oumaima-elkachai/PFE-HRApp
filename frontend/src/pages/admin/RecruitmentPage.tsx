// src/pages/admin/RecruitmentPage.tsx

import { useState, useEffect } from 'react';
import {
  Plus, Eye, X, Pencil,  Clock, 
  Briefcase, Trash2, Star, Send, Users, TrendingUp,
  MapPin, Calendar as CalendarIcon,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { candidatsService } from '../../services/candidats';
import api from '../../services/api';
import type { Candidat } from '../../types';
import {
  LIBELLES_STATUT_OFFRE,
  LIBELLES_STATUT_CANDIDATURE,
  STATUTS_OFFRE,
  libelle,
} from '../../types/domaine';
import type { StatutOffre } from '../../types/domaine';

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
  creeLe: string;
}

// ── Styles ─────────────────────────────────────────────────────────
// Le style vit ici ; les libellés viennent de types/domaine.ts.
const STYLE_OFFRE: Record<StatutOffre, { bg: string; text: string; dot: string }> = {
  ACTIVE:   { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', dot: 'bg-[#16a34a]' },
  POURVUE:  { bg: 'bg-[#f3f4f6]', text: 'text-[#6b7280]', dot: 'bg-[#6b7280]' },
  ARCHIVEE: { bg: 'bg-[#fef9c3]', text: 'text-[#ca8a04]', dot: 'bg-[#ca8a04]' },
};

// Un statut inattendu ne doit jamais faire tomber la page
const STYLE_OFFRE_DEFAUT = { bg: 'bg-[#f3f4f6]', text: 'text-[#6b7280]', dot: 'bg-[#9ca3af]' };

const styleOffre = (s: string) => STYLE_OFFRE[s as StatutOffre] ?? STYLE_OFFRE_DEFAUT;

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];
const TYPES_CONTRAT = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE'];
const MODES_TRAVAIL = ['PRESENTIEL', 'HYBRIDE', 'DISTANCIEL'];

const ETAPES_CANDIDATURE = [
  'SOUMIS', 'PRESELECTION', 'ENTRETIEN', 'OFFRE', 'EMBAUCHE', 'REFUSE',
];

// ── Aides ──────────────────────────────────────────────────────────
function initiales(prenom: string, nom: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();
}



function couleurScore(score: number) {
  if (score >= 75) return { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', ring: 'ring-[#16a34a]' };
  if (score >= 50) return { bg: 'bg-[#fef9c3]', text: 'text-[#ca8a04]', ring: 'ring-[#ca8a04]' };
  return { bg: 'bg-[#fee2e2]', text: 'text-[#dc2626]', ring: 'ring-[#dc2626]' };
}

// ── Petits composants ──────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub,
  iconBg = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e0d8] p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[#6b7280]">{label}</p>
        <p className="text-2xl font-bold text-[#1a1a1a] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Avatar({ prenom, nom, size = 'md' }: {
  prenom: string; nom: string; size?: 'sm' | 'md' | 'lg';
}) {
  const palette = ['bg-[#2d6a4f]', 'bg-[#3b82f6]', 'bg-[#8b5cf6]', 'bg-[#f59e0b]', 'bg-[#ef4444]'];
  const couleur = palette[(prenom?.charCodeAt(0) ?? 0) % palette.length];
  const taille = size === 'sm' ? 'w-7 h-7 text-[10px]'
               : size === 'lg' ? 'w-12 h-12 text-base'
               : 'w-9 h-9 text-xs';
  return (
    <div className={`${taille} ${couleur} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initiales(prenom, nom)}
    </div>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  const c = couleurScore(score);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      <Star className="w-2.5 h-2.5" />{score}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-lg text-[#1a1a1a]">{offre.titre}</h2>
              <BadgeStatutOffre statut={offre.statut} />
            </div>
            <p className="text-sm text-[#6b7280]">
              {offre.departement} · {offre.type} · {offre.modeTravail}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df]">
              <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Briefcase className="w-3 h-3" />Département
              </div>
              <div className="text-sm font-medium text-[#1a1a1a]">{offre.departement}</div>
            </div>
            <div className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df]">
              <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />Mode
              </div>
              <div className="text-sm font-medium text-[#1a1a1a]">{offre.modeTravail}</div>
            </div>
            <div className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df]">
              <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1 flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />Publiée le
              </div>
              <div className="text-sm font-medium text-[#1a1a1a]">
                {new Date(offre.creeLe).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {offre.description && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">Description</div>
              <p className="text-sm text-[#374151] bg-[#f8f6f2] rounded-xl p-3 leading-relaxed border border-[#ede8df] whitespace-pre-line">
                {offre.description}
              </p>
            </div>
          )}

          <div className="border-t border-[#f0ebe0] pt-4">
            <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Candidats ({candidats.length})
            </div>
            {candidats.length === 0 ? (
              <p className="text-sm text-[#9ca3af] text-center py-4">
                Aucun candidat sur cette offre pour le moment
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {candidats.map(c => (
                  <div
                    key={c.id}
                    onClick={() => onVoirCandidat(c)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f8f6f2] cursor-pointer transition-colors group"
                  >
                    <Avatar prenom={c.prenom} nom={c.nom} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#1a1a1a] truncate">
                        {c.prenom} {c.nom}
                      </div>
                      <div className="text-xs text-[#9ca3af] truncate">{c.email}</div>
                    </div>
                    <ScoreBadge score={(c as any).scoreCV} />
                    <span className="text-[10px] font-bold bg-[#ede8df] text-[#6b7280] px-2 py-0.5 rounded-full">
                      {libelle(LIBELLES_STATUT_CANDIDATURE, c.statut)}
                    </span>
                    <Eye className="w-3.5 h-3.5 text-[#9ca3af] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Fermer
            </button>
          </div>
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
}

function ChampsOffre({
  form, setForm,
}: {
  form: FormulaireOffre;
  setForm: (f: FormulaireOffre) => void;
}) {
  const champCls =
    'w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]';

  return (
    <>
      <div>
        <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
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
        <div>
          <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
            Département
          </label>
          <select
            value={form.departement}
            onChange={e => setForm({ ...form, departement: e.target.value })}
            className={champCls}
          >
            {DEPARTEMENTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
            Contrat
          </label>
          <select
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value })}
            className={champCls}
          >
            {TYPES_CONTRAT.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
            Mode
          </label>
          <select
            value={form.modeTravail}
            onChange={e => setForm({ ...form, modeTravail: e.target.value })}
            className={champCls}
          >
            {MODES_TRAVAIL.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
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
        <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">
          Statut
        </label>
        <div className="flex gap-2">
          {STATUTS_OFFRE.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setForm({ ...form, statut: s })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                form.statut === s
                  ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                  : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
              }`}
            >
              {LIBELLES_STATUT_OFFRE[s]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ModalOffre({
  offre, onClose, onSuccess,
}: {
  offre?: Offre;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const modification = !!offre;

  const [form, setForm] = useState<FormulaireOffre>({
    titre: offre?.titre ?? '',
    departement: offre?.departement ?? 'Informatique',
    type: offre?.type ?? 'CDI',
    modeTravail: offre?.modeTravail ?? 'HYBRIDE',
    description: offre?.description ?? '',
    statut: offre?.statut ?? 'ACTIVE',
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
      if (modification) await api.put(`/offres/${offre!.id}`, form);
      else await api.post('/offres', form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div>
            <h2 className="font-bold text-lg text-[#1a1a1a]">
              {modification ? "Modifier l'offre" : 'Publier une offre'}
            </h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {modification ? offre!.titre : 'Elle sera visible sur le site carrière'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          <ChampsOffre form={form} setForm={setForm} />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div className="flex items-center gap-3">
            <Avatar prenom={candidat.prenom} nom={candidat.nom} size="lg" />
            <div>
              <h2 className="font-bold text-lg text-[#1a1a1a]">
                {candidat.prenom} {candidat.nom}
              </h2>
              <p className="text-sm text-[#6b7280]">
                {(candidat as any).offreTitre ?? candidat.posteVise}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={score} />
            <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
              <X className="w-5 h-5 text-[#6b7280]" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Email', v: candidat.email },
              { l: 'Téléphone', v: candidat.telephone || '—' },
              { l: 'Niveau', v: candidat.niveauEtude || '—' },
              { l: 'Expérience', v: candidat.experience || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df]">
                <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">{l}</div>
                <div className="text-sm font-medium text-[#1a1a1a] truncate">{v}</div>
              </div>
            ))}
          </div>

          {score !== undefined && (
            <div className="bg-[#f8f6f2] rounded-xl p-4 border border-[#ede8df]">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
                  Analyse automatique
                </div>
                {/* Rend visible le repli sans IA : sans cela, un score
                    calculé par mots-clés passe pour une analyse réussie */}
                {(candidat as any).sourceAnalyse === 'fallback' && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    Analyse dégradée
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ring-4 ${couleurScore(score).bg} ${couleurScore(score).text} ${couleurScore(score).ring}`}>
                  {score}
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-[#e5e0d8] rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${score >= 75 ? 'bg-[#2d6a4f]' : score >= 50 ? 'bg-[#f59e0b]' : 'bg-red-500'}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    {recommandation === 'ACCEPTER' ? 'Profil recommandé'
                      : recommandation === 'HESITER' ? 'À évaluer'
                      : 'Non retenu'}
                  </div>
                </div>
              </div>

              {analyse.resumeAnalyse && (
                <p className="text-xs text-[#374151] italic border-l-2 border-[#2d6a4f] pl-3">
                  {analyse.resumeAnalyse}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1">
                {(analyse.competencesMatchees ?? []).map((c: string) => (
                  <span key={c} className="text-[10px] bg-[#dcfce7] text-[#16a34a] px-2 py-0.5 rounded-full font-medium">
                    {c}
                  </span>
                ))}
                {(analyse.competencesManquantes ?? []).map((c: string) => (
                  <span key={c} className="text-[10px] bg-[#fee2e2] text-[#dc2626] px-2 py-0.5 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.competences?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">
                Compétences déclarées
              </div>
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map((c, i) => (
                  <span key={i} className="text-xs bg-[#ede8df] text-[#374151] px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidat.lettreMotivation && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">
                Lettre de motivation
              </div>
              <p className="text-sm text-[#374151] bg-[#f8f6f2] rounded-xl p-3 leading-relaxed border border-[#ede8df] max-h-32 overflow-y-auto whitespace-pre-line">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          <div className="border-t border-[#f0ebe0] pt-4">
            <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3">
              Faire avancer la candidature
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {ETAPES_CANDIDATURE.map(s => (
                <button
                  key={s}
                  onClick={() => setNouveauStatut(s)}
                  className={`py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    nouveauStatut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm'
                      : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f] hover:text-[#2d6a4f]'
                  }`}
                >
                  {libelle(LIBELLES_STATUT_CANDIDATURE, s)}
                </button>
              ))}
            </div>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Commentaire…"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none"
            />
          </div>

          {candidat.historiqueStatuts?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">
                Historique
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {[...candidat.historiqueStatuts].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2d6a4f] mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-[#1a1a1a]">
                        {libelle(LIBELLES_STATUT_CANDIDATURE, h.statut)}
                      </span>
                      {h.commentaire && <span className="text-[#6b7280] ml-1">— {h.commentaire}</span>}
                      <div className="text-[#9ca3af] text-[10px]">
                        {new Date(h.date).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [offres, setOffres] = useState<Offre[]>([]);
  const [loadingC, setLoadingC] = useState(true);
  const [loadingO, setLoadingO] = useState(true);
  const [creationOffre, setCreationOffre] = useState(false);
  const [offreAModifier, setOffreAModifier] = useState<Offre | null>(null);
  const [offreDetail, setOffreDetail] = useState<Offre | null>(null);
  const [candidatSel, setCandidatSel] = useState<Candidat | null>(null);
  const [flash, setFlash] = useState('');

  const montrerFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const chargerCandidats = async () => {
    try {
      setLoadingC(true);
      const res = await candidatsService.lister() as any;
      // Le serveur renvoie data.candidatures depuis la fusion des tables
      const tous: Candidat[] = res?.data?.candidatures ?? [];
      setCandidats(tous.filter(c => !['EMBAUCHE', 'REFUSE'].includes(c.statut)));
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
      montrerFlash('Statut mis à jour');
    } catch (e) {
      console.error('Changement de statut :', e);
      montrerFlash('Impossible de mettre à jour le statut');
    }
  };

  const handleSupprimerOffre = async (id: string) => {
    if (!confirm('Supprimer cette offre ?')) return;
    try {
      await api.delete(`/offres/${id}`);
      chargerOffres();
    } catch (e) {
      console.error('Suppression :', e);
      montrerFlash("Impossible de supprimer l'offre");
    }
  };

  const candidatsDeLoffre = (offre: Offre) =>
    candidats.filter(c =>
      (c as any).offreId === offre.id || (c as any).offreTitre === offre.titre
    );

  // ── Indicateurs, tous calculés sur des données réelles ──────────
  const offresActives = offres.filter(o => o.statut === 'ACTIVE').length;
  const enEntretien = candidats.filter(c => c.statut === 'ENTRETIEN').length;
  const avecScore = candidats.filter(c => typeof (c as any).scoreCV === 'number');
  const scoreMoyen = avecScore.length
    ? Math.round(avecScore.reduce((s, c) => s + (c as any).scoreCV, 0) / avecScore.length)
    : 0;

  return (
    <Layout searchPlaceholder="Rechercher un candidat…">
      <div>
        {flash && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
            {flash}
          </div>
        )}

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#1a1a1a] tracking-tight">Recrutement</h1>
            <p className="text-[#6b7280] mt-1">
              <span className="font-semibold text-[#1a1a1a]">{candidats.length}</span> candidature
              {candidats.length > 1 ? 's' : ''} en cours
            </p>
          </div>
          <button
            onClick={() => setCreationOffre(true)}
            className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />Publier une offre
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Briefcase}
            label="Offres publiées"
            value={loadingO ? '…' : offresActives}
            sub={`sur ${offres.length} au total`}
            iconBg="bg-[#dbeafe]"
            iconColor="text-[#3b82f6]"
          />
          <StatCard
            icon={Users}
            label="Candidatures actives"
            value={loadingC ? '…' : candidats.length}
            sub="hors embauchés et refusés"
            iconBg="bg-[#ede9fe]"
            iconColor="text-[#8b5cf6]"
          />
          <StatCard
            icon={Clock}
            label="En entretien"
            value={loadingC ? '…' : enEntretien}
            sub="à ce stade du pipeline"
            iconBg="bg-[#fef9c3]"
            iconColor="text-[#ca8a04]"
          />
          <StatCard
            icon={TrendingUp}
            label="Score moyen"
            value={loadingC ? '…' : (scoreMoyen > 0 ? `${scoreMoyen}/100` : '—')}
            sub={`sur ${avecScore.length} analyse${avecScore.length > 1 ? 's' : ''}`}
            iconBg="bg-[#d8f3dc]"
            iconColor="text-[#2d6a4f]"
          />
        </div>

        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-[#2d6a4f]" />
              <h3 className="font-black text-lg text-[#1a1a1a]">Offres d'emploi</h3>
              <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2 py-0.5 rounded-full">
                {loadingO ? '…' : offres.length}
              </span>
            </div>
            <button
              onClick={() => setCreationOffre(true)}
              className="flex items-center gap-1.5 text-sm font-bold text-[#2d6a4f] hover:underline"
            >
              <Plus className="w-4 h-4" />Nouvelle offre
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Poste', 'Département', 'Contrat', 'Statut', 'Publiée', 'Actions'].map(h => (
                  <th
                    key={h}
                    className={`text-left ${h === 'Poste' ? 'px-6' : 'px-4'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingO ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[1, 2, 3, 4, 5, 6].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-[#f0ebe0] rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : offres.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="text-4xl mb-3">💼</div>
                    <p className="text-sm font-medium text-[#6b7280] mb-2">Aucune offre publiée</p>
                    <button
                      onClick={() => setCreationOffre(true)}
                      className="text-sm font-bold text-[#2d6a4f] hover:underline"
                    >
                      Publier la première offre
                    </button>
                  </td>
                </tr>
              ) : (
                offres.map(offre => (
                  <tr
                    key={offre.id}
                    className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#faf9f7] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm text-[#1a1a1a]">{offre.titre}</div>
                      <div className="text-xs text-[#9ca3af]">{offre.modeTravail}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-[#374151]">
                        <Briefcase className="w-3.5 h-3.5 text-[#9ca3af]" />
                        {offre.departement}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-bold bg-[#f0ebe0] text-[#6b7280] px-2.5 py-1 rounded-full">
                        {offre.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <BadgeStatutOffre statut={offre.statut} />
                    </td>
                    <td className="px-4 py-4 text-sm text-[#6b7280]">
                      {new Date(offre.creeLe).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setOffreDetail(offre)}
                          className="p-1.5 hover:bg-[#f0ebe0] rounded-lg transition-colors"
                          title="Voir l'offre et ses candidats"
                        >
                          <Eye className="w-4 h-4 text-[#6b7280]" />
                        </button>
                        <button
                          onClick={() => setOffreAModifier(offre)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4 text-blue-400 hover:text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleSupprimerOffre(offre.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-[#9ca3af] hover:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loadingO && offres.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#faf9f7]">
              <span className="text-xs text-[#9ca3af] font-medium">
                {offres.length} offre{offres.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {creationOffre && (
        <ModalOffre onClose={() => setCreationOffre(false)} onSuccess={chargerOffres} />
      )}
      {offreAModifier && (
        <ModalOffre
          offre={offreAModifier}
          onClose={() => setOffreAModifier(null)}
          onSuccess={chargerOffres}
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
    </Layout>
  );
}