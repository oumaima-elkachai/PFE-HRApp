// src/pages/admin/RecruitmentPipelinePage.tsx
import { useState, useEffect } from 'react';
import {
  MoreHorizontal, Plus, Star, Paperclip,
  Calendar, Video, MapPin, Award, Filter,
  ChevronRight, Eye, X, Clock, Send,
  CheckCircle,
} from 'lucide-react';
import { candidatsService } from '@/services/candidats';
import api from '@/services/api';
import type { Candidat, EntretienInfo } from '@/types';
import Layout from '@/components/layout/Layout';

// ── Types ──────────────────────────────────────
type EtapeKanban = 'SOUMIS' | 'PRESELECTION' | 'QUIZ_EN_ATTENTE' | 'QUIZ_COMPLETE' | 'ENTRETIEN' | 'OFFRE';

// ── Config Kanban ──────────────────────────────
const stageConfig: Record<EtapeKanban, {
  label: string;
  color: string;
  dotColor: string;
  emoji: string;
}> = {
  SOUMIS: {
    label: 'Applied',
    color: 'bg-blue-50',
    dotColor: 'bg-blue-400',
    emoji: '📥',
  },
  PRESELECTION: {
    label: 'Screening',
    color: 'bg-amber-50',
    dotColor: 'bg-amber-400',
    emoji: '📊',
  },
  QUIZ_EN_ATTENTE: {
    label: 'Quiz Sent',
    color: 'bg-indigo-50',
    dotColor: 'bg-indigo-400',
    emoji: '📝',
  },
  QUIZ_COMPLETE: {
    label: 'Quiz Done',
    color: 'bg-cyan-50',
    dotColor: 'bg-cyan-400',
    emoji: '✅',
  },
  ENTRETIEN: {
    label: 'Interview',
    color: 'bg-purple-50',
    dotColor: 'bg-purple-400',
    emoji: '🎙️',
  },
  OFFRE: {
    label: 'Offer',
    color: 'bg-[#4a7c59]/10',
    dotColor: 'bg-[#4a7c59]',
    emoji: '🎉',
  },
};

// Labels des statuts
const statutLabels: Record<string, string> = {
  SOUMIS: 'Soumis',
  PRESELECTION: 'Présélection',
  QUIZ_EN_ATTENTE: 'Quiz Envoyé',
  QUIZ_COMPLETE: 'Quiz Fait',
  ENTRETIEN: 'Entretien',
  OFFRE: 'Offre',
  EMBAUCHE: 'Embauché',
  REFUSE: 'Refusé',
};

// ── Toast Notification ─────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-60 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-[#2d6a4f] text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-75">
        <CheckCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">{message}</p>
        <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Score Badge ────────────────────────────────
function ScoreBadge({ score, label }: { score?: number; label: string }) {
  if (!score) return null;

  const color = score >= 80 ? 'text-yellow-500'
    : score >= 60 ? 'text-amber-500'
    : 'text-stone-400';

  return (
    <div className="flex items-center gap-1">
      <Star className={`w-3.5 h-3.5 ${color}`} fill="currentColor" />
      <span className="text-xs font-bold text-stone-600">{score}/100</span>
    </div>
  );
}

// ── Modal Planifier Entretien ─────────────────
function ModalEntretien({ candidat, onClose, onSave }: {
  candidat: Candidat;
  onClose: () => void;
  onSave: (id: string, entretien: EntretienInfo) => void;
}) {
  const [form, setForm] = useState<EntretienInfo>({
    date:    candidat.entretien?.date    || '',
    heure:   candidat.entretien?.heure   || '10:00',
    type:    candidat.entretien?.type    || 'en_ligne',
    lien:    candidat.entretien?.lien    || '',
    adresse: candidat.entretien?.adresse || '',
    notes:   candidat.entretien?.notes   || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!form.date) return;
    setLoading(true);
    await onSave(candidat.id, form);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        {/* Header - Même style que RecruitmentPage */}
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8]">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">Planifier un entretien</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {candidat.prenom} {candidat.nom} — {candidat.posteVise}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#f5f0e8] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Type d'entretien</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setForm({ ...form, type: 'en_ligne', adresse: '' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-all ${
                  form.type === 'en_ligne'
                    ? 'bg-purple-50 text-purple-700 border-purple-300'
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-purple-300'
                }`}
              >
                <Video className="w-4 h-4" /> En ligne
              </button>
              <button type="button"
                onClick={() => setForm({ ...form, type: 'sur_site', lien: '' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-all ${
                  form.type === 'sur_site'
                    ? 'bg-purple-50 text-purple-700 border-purple-300'
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-purple-300'
                }`}
              >
                <MapPin className="w-4 h-4" /> Sur site
              </button>
            </div>
          </div>

          {/* Date + Heure */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Date *</label>
              <input type="date" required
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Heure *</label>
              <input type="time" required
                value={form.heure}
                onChange={e => setForm({ ...form, heure: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* Lien visio OU Adresse */}
          {form.type === 'en_ligne' ? (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Lien visioconférence
              </label>
              <input type="url"
                value={form.lien}
                onChange={e => setForm({ ...form, lien: e.target.value })}
                placeholder="https://meet.google.com/... ou https://zoom.us/..."
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-purple-400"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Adresse
              </label>
              <input type="text"
                value={form.adresse}
                onChange={e => setForm({ ...form, adresse: e.target.value })}
                placeholder="123 Rue Example, Casablanca..."
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-purple-400"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Notes (optionnel)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Instructions pour le candidat..."
              className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-purple-400 resize-none"
            />
          </div>

          {/* Boutons */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={loading || !form.date}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" />
              {loading ? 'Planification...' : 'Planifier & Notifier'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card Candidat Kanban ───────────────────────
function CandidateCard({ candidat, onVoir }: {
  candidat: Candidat;
  onVoir: (c: Candidat) => void;
}) {
  const dateRelative = (iso: string) => {
    const heures = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (heures < 24) return `${heures}h ago`;
    const jours = Math.floor(heures / 24);
    if (jours < 7) return `${jours}d ago`;
    return `${Math.floor(jours / 7)}w ago`;
  };

  const initiales = `${candidat.prenom?.[0] || ''}${candidat.nom?.[0] || ''}`.toUpperCase();
  const isOffer = candidat.statut === 'OFFRE';

  return (
    <div
      onClick={() => onVoir(candidat)}
      className={`p-4 rounded-2xl shadow-sm border hover:shadow-md transition-shadow cursor-pointer ${
        isOffer
          ? 'bg-[#4a7c59]/5 border-[#4a7c59]/20'
          : 'bg-white border-stone-100'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
          isOffer
            ? 'bg-[#4a7c59] text-white'
            : 'bg-[#4a7c59]/10 text-[#4a7c59]'
        }`}>
          {initiales}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${
          isOffer
            ? 'bg-[#4a7c59]/20 text-[#4a7c59]'
            : 'bg-stone-50 text-stone-500'
        }`}>
          {isOffer ? 'Sent' : dateRelative(candidat.soumisLe)}
        </span>
      </div>

      <h4 className="font-bold text-stone-800 leading-tight">
        {candidat.prenom} {candidat.nom}
      </h4>
      <p className="text-xs text-[#4a7c59] font-semibold mt-1">
        {candidat.offreTitre || candidat.posteVise}
      </p>

      {candidat.scoreCV !== undefined && (
        <div className="mt-3">
          <ScoreBadge score={candidat.scoreCV} label="CV Score" />
        </div>
      )}

      {candidat.statut === 'ENTRETIEN' && candidat.entretien && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 rounded-lg px-2 py-1.5">
          {candidat.entretien.type === 'en_ligne' ? (
            <Video className="w-3.5 h-3.5" />
          ) : (
            <MapPin className="w-3.5 h-3.5" />
          )}
          <span className="font-medium">
            {new Date(candidat.entretien.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' '}{candidat.entretien.heure}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between pt-3 border-t border-stone-100">
        {candidat.quizResult?.scoreQuiz ? (
          <div className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-xs font-bold text-stone-600">
              Quiz: {candidat.quizResult.scoreQuiz}/100
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-stone-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">Pending</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-[#4a7c59] font-medium">
          <Eye className="w-3 h-3" />
          View
        </div>
      </div>
    </div>
  );
}

// ── Modal Détail Candidat ──────────────────────
function ModalCandidatDetail({ candidat, onClose, onChangerStatut, onPlanifierEntretien }: {
  candidat: Candidat;
  onClose: () => void;
  onChangerStatut?: (id: string, statut: string, commentaire: string) => void;
  onPlanifierEntretien?: (candidat: Candidat) => void;
}) {
  const [nouveauStatut, setNouveauStatut] = useState(candidat.statut);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);

  const statuts = [
    'SOUMIS', 'PRESELECTION', 'QUIZ_EN_ATTENTE',
    'QUIZ_COMPLETE', 'ENTRETIEN', 'OFFRE', 'EMBAUCHE', 'REFUSE',
  ];

  const handleSave = async () => {
    if (!onChangerStatut) return;
    setLoading(true);
    await onChangerStatut(candidat.id, nouveauStatut, commentaire);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8] sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-800">
              {candidat.prenom} {candidat.nom}
            </h2>
            <p className="text-sm text-[#6b7280] mt-0.5">
              {candidat.offreTitre || candidat.posteVise}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#f5f0e8] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Infos de base */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Email',      v: candidat.email },
              { l: 'Téléphone',  v: candidat.telephone || '—' },
              { l: 'Niveau',     v: candidat.niveauEtude || '—' },
              { l: 'Expérience', v: candidat.experience || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-[#f5f0e8] rounded-xl p-3">
                <div className="text-xs text-[#6b7280] mb-1">{l}</div>
                <div className="text-sm font-medium text-[#1a1a1a] truncate">{v}</div>
              </div>
            ))}
          </div>

          {/* Scores */}
          <div className="bg-linear-to-r from-[#f5f0e8] to-[#d8f3dc] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-[#2d6a4f]" />
              <span className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider">Scores</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {candidat.scoreCV ?? '—'}
                  <span className="text-sm text-[#6b7280] font-normal">/100</span>
                </div>
                <div className="text-xs text-[#6b7280] mt-1">Score CV</div>
                {candidat.scoreCV !== undefined && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                    <div
                      className={`h-1.5 rounded-full ${
                        candidat.scoreCV >= 80 ? 'bg-green-500' :
                        candidat.scoreCV >= 60 ? 'bg-amber-500' : 'bg-red-400'
                      }`}
                      style={{ width: `${candidat.scoreCV}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {candidat.quizResult?.scoreQuiz ?? '—'}
                  <span className="text-sm text-[#6b7280] font-normal">/100</span>
                </div>
                <div className="text-xs text-[#6b7280] mt-1">Score Quiz</div>
                {candidat.quizResult && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${
                          candidat.quizResult.scoreQuiz >= 80 ? 'bg-green-500' :
                          candidat.quizResult.scoreQuiz >= 60 ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${candidat.quizResult.scoreQuiz}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[#9ca3af] mt-1">
                      {candidat.quizResult.bonnesReponses}/{candidat.quizResult.totalQuestions} bonnes réponses
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Compétences */}
          {candidat.competences?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#6b7280] mb-2">Compétences</div>
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map((c, i) => (
                  <span key={i} className="text-xs bg-[#d8f3dc] text-[#2d6a4f] px-2.5 py-1 rounded-full font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Entretien planifié */}
          {candidat.entretien && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm text-purple-700 font-medium">
                <Calendar className="w-4 h-4" />
                Entretien {candidat.entretien.type === 'en_ligne' ? 'en ligne' : 'sur site'}
                — {new Date(candidat.entretien.date).toLocaleDateString('fr-FR')} à {candidat.entretien.heure}
              </div>
            </div>
          )}

          {/* Actions rapides */}
          <div className="flex gap-2">
            <button
              onClick={() => onPlanifierEntretien?.(candidat)}
              className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-2 rounded-xl text-xs font-medium hover:bg-purple-100 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" /> Planifier entretien
            </button>
            <button
              onClick={() => {
                onChangerStatut?.(candidat.id, 'QUIZ_EN_ATTENTE', 'Quiz envoyé au candidat');
                onClose();
              }}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-medium hover:bg-indigo-100 transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> Envoyer Quiz
            </button>
          </div>

          {/* Changer statut */}
          <div className="border-t border-[#f0ebe0] pt-4">
            <div className="text-xs font-medium text-[#6b7280] mb-3">
              Faire avancer dans le pipeline
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {statuts.map(s => (
                <button key={s}
                  onClick={() => setNouveauStatut(s as any)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                    nouveauStatut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                      : s === 'REFUSE'
                        ? 'bg-white text-red-500 border-red-200 hover:border-red-400'
                        : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                  }`}
                >
                  {statutLabels[s]}
                </button>
              ))}
            </div>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Commentaire (optionnel)..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none"
            />
          </div>

          {/* Historique */}
          {candidat.historiqueStatuts?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#6b7280] mb-2">Historique</div>
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {[...candidat.historiqueStatuts].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2d6a4f] mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-[#1a1a1a]">
                        {statutLabels[h.statut] || h.statut}
                      </span>
                      {h.commentaire && <span className="text-[#6b7280] ml-1">— {h.commentaire}</span>}
                      <div className="text-[#9ca3af]">
                        {new Date(h.date).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lettre motivation */}
          {candidat.lettreMotivation && (
            <div>
              <div className="text-xs font-medium text-[#6b7280] mb-2">Lettre de motivation</div>
              <p className="text-xs text-[#374151] bg-[#f5f0e8] rounded-xl p-3 leading-relaxed line-clamp-4">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {/* CV */}
          {candidat.cvFileName && (
            <div className="flex items-center gap-2 text-xs text-[#2d6a4f] bg-[#d8f3dc] px-3 py-2 rounded-xl w-fit">
              <Paperclip className="w-3.5 h-3.5" />
              {candidat.cvFileName}
            </div>
          )}

          {/* Boutons */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 transition-colors">
              {loading ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PAGE PRINCIPALE ────────────────────────────
export default function RecruitmentPipelinePage() {
  const [candidats,           setCandidats]           = useState<Candidat[]>([]);
  const [loading,             setLoading]             = useState(true);
  const [candidatSelectionne, setCandidatSelectionne] = useState<Candidat | null>(null);
  const [candidatEntretien,   setCandidatEntretien]   = useState<Candidat | null>(null);
  const [showToast,           setShowToast]           = useState(false);
  const [toastMessage,        setToastMessage]        = useState('');

  const stages: EtapeKanban[] = [
    'SOUMIS', 'PRESELECTION', 'QUIZ_EN_ATTENTE',
    'QUIZ_COMPLETE', 'ENTRETIEN', 'OFFRE',
  ];

  // Chargement
  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        const res = await candidatsService.lister() as any;
        const data: Candidat[] = res?.data?.candidats ?? [];
        setCandidats(data.filter(c => !['EMBAUCHE', 'REFUSE'].includes(c.statut)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  // ✅ Actions
  const handleChangerStatut = async (id: string, statut: string, commentaire: string) => {
    try {
      await candidatsService.changerStatut(id, statut, commentaire);
      
      // ✅ Afficher notification si c'est un envoi de quiz
      if (statut === 'QUIZ_EN_ATTENTE') {
        setToastMessage('✅ Quiz envoyé au candidat avec succès');
        setShowToast(true);
      }
      
      // Recharger les candidats
      const res = await candidatsService.lister() as any;
      const data: Candidat[] = res?.data?.candidats ?? [];
      setCandidats(data.filter(c => !['EMBAUCHE', 'REFUSE'].includes(c.statut)));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlanifierEntretien = async (id: string, entretien: EntretienInfo) => {
    try {
      await api.put(`/candidats/${id}/entretien`, {
        entretien,
        statut: 'ENTRETIEN',
        notifier: true,
      });
      
      setToastMessage('✅ Entretien planifié et candidat notifié');
      setShowToast(true);
      
      const res = await candidatsService.lister() as any;
      const data: Candidat[] = res?.data?.candidats ?? [];
      setCandidats(data.filter(c => !['EMBAUCHE', 'REFUSE'].includes(c.statut)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-[#faf6f0] min-h-screen">
      <Layout>
        {/* Header */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Recruitment</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[#4a7c59] font-semibold">Pipeline</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Recruitment Pipeline</h2>
            <p className="text-stone-500 mt-1">
              Managing {candidats.length} active candidates across {stages.length} stages.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-600 font-semibold hover:bg-stone-50 transition-colors shadow-sm">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="flex items-center gap-2 px-5 py-2 bg-[#4a7c59] text-white rounded-xl font-bold hover:bg-[#3d664a] transition-colors shadow-md shadow-[#4a7c59]/20">
              <Plus className="w-5 h-5" />
              Add Candidate
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto px-8 py-8 custom-scrollbar">
          <div className="flex gap-6 h-full min-w-max">
            {stages.map(stage => {
              const config  = stageConfig[stage];
              const colonne = candidats.filter(c => c.statut === stage);

              return (
                <div key={stage} className="flex flex-col w-72 h-full">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                      <h3 className="font-bold text-stone-700 uppercase text-xs tracking-widest">
                        {config.label}
                      </h3>
                      <span className="bg-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {loading ? '...' : colonne.length}
                      </span>
                    </div>
                    <button className="text-stone-400 hover:text-stone-600">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
                    {loading ? (
                      [...Array(2)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse">
                          <div className="flex justify-between items-start mb-3">
                            <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                            <div className="h-4 bg-stone-100 rounded w-16" />
                          </div>
                          <div className="h-4 bg-stone-100 rounded w-28 mb-2" />
                          <div className="h-3 bg-stone-100 rounded w-20" />
                        </div>
                      ))
                    ) : colonne.length === 0 ? (
                      <div className="border-2 border-dashed border-stone-200 rounded-xl p-6 text-center">
                        <p className="text-xs text-stone-400">No candidates</p>
                      </div>
                    ) : (
                      colonne.map(c => (
                        <CandidateCard key={c.id} candidat={c} onVoir={setCandidatSelectionne} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modals */}
        {candidatSelectionne && (
          <ModalCandidatDetail
            candidat={candidatSelectionne}
            onClose={() => setCandidatSelectionne(null)}
            onChangerStatut={handleChangerStatut}
            onPlanifierEntretien={(c) => {
              setCandidatSelectionne(null);
              setCandidatEntretien(c);
            }}
          />
        )}

        {candidatEntretien && (
          <ModalEntretien
            candidat={candidatEntretien}
            onClose={() => setCandidatEntretien(null)}
            onSave={handlePlanifierEntretien}
          />
        )}

        {/* ✅ Toast Notification */}
        {showToast && (
          <Toast message={toastMessage} onClose={() => setShowToast(false)} />
        )}

        {/* Custom Scrollbar Styles */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e7e5e4;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}