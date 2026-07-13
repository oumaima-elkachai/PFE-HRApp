import { useState, useEffect } from 'react';
import {
  Plus, MoreHorizontal, Eye, X, Pencil,
  CheckCircle, XCircle, Clock, AlertCircle,
  Briefcase, Trash2, Star, Send, Users, TrendingUp,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { candidatsService } from '../../services/candidats';
import api from '../../services/api';
import type { Candidat } from '../../types';

// ── Types ─────────────────────────────────────
type StatutOffre = 'active' | 'urgente' | 'fermee';
type EtapeKanban = 'SOUMIS' | 'PRESELECTION' | 'ENTRETIEN' | 'OFFRE';

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description?: string;
  statut: StatutOffre;
  creeLe: string;
}

// ── Config pipeline ───────────────────────────
const STAGES: {
  key: EtapeKanban;
  label: string;
  color: string;
  bg: string;
  dot: string;
}[] = [
  { key: 'SOUMIS',       label: 'Applied',     color: 'text-[#3b82f6]', bg: 'bg-[#eff6ff]', dot: 'bg-[#3b82f6]' },
  { key: 'PRESELECTION', label: 'Screened',    color: 'text-[#f59e0b]', bg: 'bg-[#fffbeb]', dot: 'bg-[#f59e0b]' },
  { key: 'ENTRETIEN',    label: 'Interviewed', color: 'text-[#8b5cf6]', bg: 'bg-[#f5f3ff]', dot: 'bg-[#8b5cf6]' },
  { key: 'OFFRE',        label: 'Offered',     color: 'text-[#2d6a4f]', bg: 'bg-[#f0fdf4]', dot: 'bg-[#2d6a4f]' },
];

const STATUS_CONFIG: Record<StatutOffre, { bg: string; text: string; dot: string; label: string }> = {
  active:  { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', dot: 'bg-[#16a34a]', label: 'Active'  },
  urgente: { bg: 'bg-[#fef9c3]', text: 'text-[#ca8a04]', dot: 'bg-[#ca8a04]', label: 'Urgent'  },
  fermee:  { bg: 'bg-[#f3f4f6]', text: 'text-[#6b7280]', dot: 'bg-[#6b7280]', label: 'Closed'  },
};

// ── Helpers ───────────────────────────────────
function getInitials(prenom: string, nom: string) {
  return `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();
}

function timeAgo(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function scoreColor(score: number) {
  if (score >= 75) return { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', ring: 'ring-[#16a34a]' };
  if (score >= 50) return { bg: 'bg-[#fef9c3]', text: 'text-[#ca8a04]', ring: 'ring-[#ca8a04]' };
  return { bg: 'bg-[#fee2e2]', text: 'text-[#dc2626]', ring: 'ring-[#dc2626]' };
}

// ── StatCard ──────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, iconBg = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]',
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
      <div>
        <p className="text-sm text-[#6b7280]">{label}</p>
        <p className="text-2xl font-bold text-[#1a1a1a] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────
function Avatar({ prenom, nom, size = 'md' }: { prenom: string; nom: string; size?: 'sm' | 'md' | 'lg' }) {
  const palette = ['bg-[#2d6a4f]','bg-[#3b82f6]','bg-[#8b5cf6]','bg-[#f59e0b]','bg-[#ef4444]'];
  const color   = palette[prenom.charCodeAt(0) % palette.length];
  const sz      = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {getInitials(prenom, nom)}
    </div>
  );
}

// ── Score Badge ───────────────────────────────
function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  const c = scoreColor(score);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      <Star className="w-2.5 h-2.5" />{score}
    </span>
  );
}

// ── Modal Modifier Offre ──────────────────────
function ModalModifierOffre({
  offre, onClose, onSuccess,
}: {
  offre: Offre;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm]       = useState<{
    titre: string;
    departement: string;
    type: string;
    modeTravail: string;
    description: string;
    statut: StatutOffre;
  }>({
    titre:       offre.titre,
    departement: offre.departement,
    type:        offre.type,
    modeTravail: offre.modeTravail,
    description: offre.description || '',
    statut:      offre.statut,
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErreur('');
    try {
      await api.put(`/offres/${offre.id}`, form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || 'Erreur lors de la modification');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div>
            <h2 className="font-bold text-lg text-[#1a1a1a]">Modifier l'offre</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">{offre.titre}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">❌ {erreur}</div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Titre du poste *</label>
            <input required value={form.titre} onChange={e => setForm({...form, titre: e.target.value})}
              className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Département', key: 'departement', options: ['Informatique','RH','Finance','Marketing','R&D'] },
              { label: 'Type',        key: 'type',        options: ['CDI','CDD','Stage','Freelance']                },
              { label: 'Mode',        key: 'modeTravail', options: ['On-site','Hybrid','Remote']                    },
            ].map(({ label, key, options }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">{label}</label>
                <select value={form[key as keyof typeof form]}
                  onChange={e => setForm({...form, [key]: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]">
                  {options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={3} className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Statut</label>
            <div className="flex gap-2">
              {(['active','urgente','fermee'] as StatutOffre[]).map(s => (
                <button key={s} type="button" onClick={() => setForm({...form, statut: s})}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    form.statut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                      : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                  }`}>
                  {s === 'active' ? '✅ Active' : s === 'urgente' ? '🔥 Urgent' : '🔒 Fermée'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60">
              {loading ? 'Sauvegarde...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal Détail Candidat ─────────────────────
function ModalCandidatDetail({ candidat, onClose, onChangerStatut }: {
  candidat: Candidat;
  onClose: () => void;
  onChangerStatut: (id: string, statut: string, commentaire: string) => void;
}) {
  const [nouveauStatut, setNouveauStatut] = useState(candidat.statut);
  const [commentaire, setCommentaire]     = useState('');
  const [loading, setLoading]             = useState(false);
  const score          = (candidat as any).scoreCV;
  const recommendation = (candidat as any).recommendation;
  const statuts        = ['SOUMIS','PRESELECTION','ENTRETIEN','OFFRE','EMBAUCHE','REFUSE'];

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
              <h2 className="font-bold text-lg text-[#1a1a1a]">{candidat.prenom} {candidat.nom}</h2>
              <p className="text-sm text-[#6b7280]">{candidat.posteVise}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {score !== undefined && <ScoreBadge score={score} />}
            <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
              <X className="w-5 h-5 text-[#6b7280]" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Infos */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Email',      v: candidat.email              },
              { l: 'Téléphone',  v: candidat.telephone || '—'  },
              { l: 'Niveau',     v: candidat.niveauEtude || '—' },
              { l: 'Expérience', v: candidat.experience  || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df]">
                <div className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">{l}</div>
                <div className="text-sm font-medium text-[#1a1a1a] truncate">{v}</div>
              </div>
            ))}
          </div>

          {/* Score IA */}
          {score !== undefined && (
            <div className="bg-[#f8f6f2] rounded-xl p-4 border border-[#ede8df]">
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3">Analyse IA</div>
              <div className="flex items-center gap-4 mb-3">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ring-4 ${scoreColor(score).bg} ${scoreColor(score).text} ${scoreColor(score).ring}`}>
                  {score}
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-[#e5e0d8] rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full ${score >= 75 ? 'bg-[#2d6a4f]' : score >= 50 ? 'bg-[#f59e0b]' : 'bg-red-500'}`}
                      style={{ width: `${score}%` }} />
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    {recommendation === 'ACCEPTER' ? '✅ Recommandé' :
                     recommendation === 'HESITER'  ? '⚠️ À évaluer'  : '❌ Non retenu'}
                  </div>
                </div>
              </div>
              {(candidat as any).resumeAnalyse && (
                <p className="text-xs text-[#374151] italic border-l-2 border-[#2d6a4f] pl-3">
                  {(candidat as any).resumeAnalyse}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                {(candidat as any).competencesMatchees?.map((c: string) => (
                  <span key={c} className="text-[10px] bg-[#dcfce7] text-[#16a34a] px-2 py-0.5 rounded-full font-medium">✓ {c}</span>
                ))}
                {(candidat as any).competencesManquantes?.map((c: string) => (
                  <span key={c} className="text-[10px] bg-[#fee2e2] text-[#dc2626] px-2 py-0.5 rounded-full font-medium">✗ {c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Compétences */}
          {candidat.competences?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">Compétences</div>
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map((c, i) => (
                  <span key={i} className="text-xs bg-[#ede8df] text-[#374151] px-2.5 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          {candidat.lettreMotivation && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">Lettre de motivation</div>
              <p className="text-sm text-[#374151] bg-[#f8f6f2] rounded-xl p-3 leading-relaxed line-clamp-3 border border-[#ede8df]">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {/* Pipeline */}
          <div className="border-t border-[#f0ebe0] pt-4">
            <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3">Faire avancer</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {statuts.map(s => (
                <button key={s} onClick={() => setNouveauStatut(s as Candidat['statut'])}
                  className={`py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    nouveauStatut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm'
                      : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f] hover:text-[#2d6a4f]'
                  }`}>{s}
                </button>
              ))}
            </div>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
              placeholder="Commentaire..." rows={2}
              className="w-full px-3 py-2 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none" />
          </div>

          {candidat.historiqueStatuts?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-2">Historique</div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {[...candidat.historiqueStatuts].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2d6a4f] mt-1.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-[#1a1a1a]">{h.statut}</span>
                      {h.commentaire && <span className="text-[#6b7280] ml-1">— {h.commentaire}</span>}
                      <div className="text-[#9ca3af] text-[10px]">{new Date(h.date).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send className="w-4 h-4" />}
              {loading ? 'Sauvegarde...' : 'Mettre à jour'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Post New Job ────────────────────────
function ModalPostJob({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<{
    titre: string;
    departement: string;
    type: string;
    modeTravail: string;
    description: string;
    statut: StatutOffre;
  }>({ titre: '', departement: 'Informatique', type: 'CDI', modeTravail: 'Hybrid', description: '', statut: 'active' });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim()) { setErreur('Le titre est requis'); return; }
    setLoading(true);
    try {
      await api.post('/offres', form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur || 'Erreur lors de la publication');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div>
            <h2 className="font-bold text-lg text-[#1a1a1a]">Post New Job</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">L'offre sera visible pour les candidats</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">❌ {erreur}</div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Titre *</label>
            <input required value={form.titre} onChange={e => setForm({...form, titre: e.target.value})}
              placeholder="ex: Développeur Full Stack Senior"
              className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Département', key: 'departement', options: ['Informatique','RH','Finance','Marketing','R&D'] },
              { label: 'Type',        key: 'type',        options: ['CDI','CDD','Stage','Freelance']                },
              { label: 'Mode',        key: 'modeTravail', options: ['On-site','Hybrid','Remote']                    },
            ].map(({ label, key, options }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">{label}</label>
                <select value={form[key as keyof typeof form]}
                  onChange={e => setForm({...form, [key]: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]">
                  {options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={3} placeholder="Missions, profil recherché..."
              className="w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#374151] uppercase tracking-wider mb-1.5">Urgence</label>
            <div className="flex gap-2">
              {(['active','urgente','fermee'] as StatutOffre[]).map(s => (
                <button key={s} type="button" onClick={() => setForm({...form, statut: s})}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                    form.statut === s ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]' : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                  }`}>
                  {s === 'active' ? '✅ Active' : s === 'urgente' ? '🔥 Urgent' : '🔒 Fermée'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60">
              {loading ? 'Publication...' : 'Publier l\'offre →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card Candidat ─────────────────────────────
function CandidateCard({ candidat, onVoir }: { candidat: Candidat; onVoir: (c: Candidat) => void }) {
  const score          = (candidat as any).scoreCV;
  const recommendation = (candidat as any).recommendation;

  return (
    <div onClick={() => onVoir(candidat)}
      className="bg-white rounded-xl border border-[#e8e3db] p-4 mb-3 hover:shadow-md hover:border-[#c8c0b4] transition-all cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-bold text-[#6b7280] bg-[#f0ebe0] px-2 py-0.5 rounded-full uppercase tracking-wide truncate max-w-27.5">
          {candidat.posteVise}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {score !== undefined && <ScoreBadge score={score} />}
          <span className="text-[10px] text-[#9ca3af]">{timeAgo(candidat.soumisLe)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 mb-3">
        <Avatar prenom={candidat.prenom} nom={candidat.nom} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-[#1a1a1a] truncate">{candidat.prenom} {candidat.nom}</div>
          <div className="text-xs text-[#6b7280] truncate">{candidat.email}</div>
        </div>
      </div>
      {candidat.competences?.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {candidat.competences.slice(0, 3).map((c, i) => (
            <span key={i} className="text-[10px] bg-[#ede8df] text-[#4a5568] px-1.5 py-0.5 rounded font-medium">{c}</span>
          ))}
          {candidat.competences.length > 3 && (
            <span className="text-[10px] text-[#9ca3af]">+{candidat.competences.length - 3}</span>
          )}
        </div>
      )}
      {recommendation && (
        <div className={`flex items-center gap-1 text-[10px] font-bold mb-3 ${
          recommendation === 'ACCEPTER' ? 'text-[#16a34a]' :
          recommendation === 'HESITER'  ? 'text-[#ca8a04]' : 'text-[#dc2626]'
        }`}>
          {recommendation === 'ACCEPTER' ? <CheckCircle className="w-3 h-3" /> :
           recommendation === 'HESITER'  ? <AlertCircle className="w-3 h-3" /> :
           <XCircle className="w-3 h-3" />}
          {recommendation === 'ACCEPTER' ? 'Recommandé par IA' :
           recommendation === 'HESITER'  ? 'À évaluer' : 'Non retenu'}
        </div>
      )}
      <div className="flex items-center justify-between pt-2.5 border-t border-[#f0ebe0]">
        <span className="flex items-center gap-1 text-[10px] text-[#9ca3af]">
          <Clock className="w-3 h-3" />
          {candidat.historiqueStatuts?.length || 0} updates
        </span>
        <span className="text-[10px] font-bold text-[#2d6a4f] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Eye className="w-3 h-3" />Voir profil
        </span>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function RecruitmentPage() {
  const [candidats, setCandidats]         = useState<Candidat[]>([]);
  const [offres, setOffres]               = useState<Offre[]>([]);
  const [loadingC, setLoadingC]           = useState(true);
  const [loadingO, setLoadingO]           = useState(true);
  const [showModalJob, setShowModalJob]   = useState(false);
  const [offreAModifier, setOffreAModifier] = useState<Offre | null>(null);
  const [candidatSel, setCandidatSel]     = useState<Candidat | null>(null);
  const [flash, setFlash]                 = useState('');

  const chargerCandidats = async () => {
    try {
      setLoadingC(true);
      const res = await candidatsService.lister() as any;
      const all: Candidat[] = res?.data?.candidats ?? [];
      setCandidats(all.filter(c => !['EMBAUCHE','REFUSE'].includes(c.statut)));
    } catch (e) { console.error(e); }
    finally { setLoadingC(false); }
  };

  const chargerOffres = async () => {
    try {
      setLoadingO(true);
      const res = await api.get('/offres') as any;
      setOffres(res?.data?.offres ?? []);
    } catch { setOffres([]); }
    finally { setLoadingO(false); }
  };

  useEffect(() => { chargerCandidats(); chargerOffres(); }, []);

  const handleChangerStatut = async (id: string, statut: string, commentaire: string) => {
    try {
      await candidatsService.changerStatut(id, statut, commentaire);
      await chargerCandidats();
      setFlash('✅ Statut mis à jour');
      setTimeout(() => setFlash(''), 3000);
    } catch (e) { console.error(e); }
  };

  const handleSupprimerOffre = async (id: string) => {
    if (!confirm('Supprimer cette offre ?')) return;
    try { await api.delete(`/offres/${id}`); chargerOffres(); }
    catch { setOffres(p => p.filter(o => o.id !== id)); }
  };

  // Stats dynamiques
  const totalCandidats   = candidats.length;
  const totalOffres      = offres.filter(o => o.statut === 'active' || o.statut === 'urgente').length;
  const enEntretien      = candidats.filter(c => c.statut === 'ENTRETIEN').length;
  const scoresMoyens     = candidats.filter(c => (c as any).scoreCV !== undefined);
  const scoreMoyen       = scoresMoyens.length > 0
    ? Math.round(scoresMoyens.reduce((s, c) => s + (c as any).scoreCV, 0) / scoresMoyens.length)
    : 0;

  return (
    <Layout searchPlaceholder="Search candidates...">
      <div>

        {flash && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
            {flash}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#1a1a1a] tracking-tight">Recruitment</h1>
            <p className="text-[#6b7280] mt-1">
              <span className="font-semibold text-[#1a1a1a]">{totalCandidats}</span> candidates in pipeline
            </p>
          </div>
          <button onClick={() => setShowModalJob(true)}
            className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all">
            <Plus className="w-4 h-4" />Post New Job
          </button>
        </div>

        {/* ── Stats Cards dynamiques ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Briefcase}
            label="Active Jobs"
            value={loadingO ? '...' : totalOffres}
            sub="offres ouvertes"
            iconBg="bg-[#dbeafe]"
            iconColor="text-[#3b82f6]"
          />
          <StatCard
            icon={Users}
            label="Total Applicants"
            value={loadingC ? '...' : candidats.length + (offres.length * 3)}
            sub="candidats reçus"
            iconBg="bg-[#ede9fe]"
            iconColor="text-[#8b5cf6]"
          />
          <StatCard
            icon={Clock}
            label="En entretien"
            value={loadingC ? '...' : enEntretien}
            sub="cette semaine"
            iconBg="bg-[#fef9c3]"
            iconColor="text-[#ca8a04]"
          />
          <StatCard
            icon={TrendingUp}
            label="Score IA moyen"
            value={loadingC ? '...' : (scoreMoyen > 0 ? `${scoreMoyen}/100` : '—')}
            sub="des candidatures"
            iconBg="bg-[#d8f3dc]"
            iconColor="text-[#2d6a4f]"
          />
        </div>

       

        {/* ── Job Postings Table ── */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-[#2d6a4f]" />
              <h3 className="font-black text-lg text-[#1a1a1a]">Active Job Postings</h3>
              <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2 py-0.5 rounded-full">
                {loadingO ? '...' : offres.length}
              </span>
            </div>
            <button onClick={() => setShowModalJob(true)}
              className="flex items-center gap-1.5 text-sm font-bold text-[#2d6a4f] hover:underline">
              <Plus className="w-4 h-4" />New Job
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Position','Department','Type','Status','Posted','Actions'].map(h => (
                  <th key={h} className={`text-left ${h==='Position'?'px-6':'px-4'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingO ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[1,2,3,4,5,6].map(j => (
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
                    <p className="text-sm font-medium text-[#6b7280] mb-2">No job postings yet</p>
                    <button onClick={() => setShowModalJob(true)}
                      className="text-sm font-bold text-[#2d6a4f] hover:underline">
                      Post your first job →
                    </button>
                  </td>
                </tr>
              ) : (
                offres.map(offre => {
                  const st = STATUS_CONFIG[offre.statut];
                  return (
                    <tr key={offre.id} className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#faf9f7] transition-colors">
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
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#6b7280]">
                        {new Date(offre.creeLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {/* Voir */}
                          <button className="p-1.5 hover:bg-[#f0ebe0] rounded-lg transition-colors" title="Voir les candidats">
                            <Eye className="w-4 h-4 text-[#6b7280]" />
                          </button>
                          {/* ✅ Modifier */}
                          <button
                            onClick={() => setOffreAModifier(offre)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Modifier l'offre"
                          >
                            <Pencil className="w-4 h-4 text-blue-400 hover:text-blue-600" />
                          </button>
                          {/* Supprimer */}
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
                  );
                })
              )}
            </tbody>
          </table>

          {!loadingO && offres.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#faf9f7]">
              <span className="text-xs text-[#9ca3af] font-medium">
                {offres.length} offre{offres.length > 1 ? 's' : ''} publiée{offres.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showModalJob && (
        <ModalPostJob onClose={() => setShowModalJob(false)} onSuccess={chargerOffres} />
      )}
      {offreAModifier && (
        <ModalModifierOffre
          offre={offreAModifier}
          onClose={() => setOffreAModifier(null)}
          onSuccess={chargerOffres}
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