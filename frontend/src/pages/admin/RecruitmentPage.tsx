import { useState, useEffect } from 'react';
import {
  MessageSquare, Calendar, MoreHorizontal, Plus,
  SlidersHorizontal, Eye, Pencil, CheckCircle, X,
  Briefcase, Trash2,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { candidatsService } from '../../services/candidats';
import api from '../../services/api';
import type { Candidat } from '../../types';

// ── Types ─────────────────────────────────────
type EtapeKanban = 'SOUMIS' | 'PRESELECTION' | 'ENTRETIEN' | 'OFFRE';

interface Offre {
  id: string;
  titre: string;
  departement: string;
  type: string;
  modeTravail: string;
  description: string;
  statut: 'active' | 'urgente' | 'fermee';
  creeLe: string;
  nombreCandidatures?: number;
}

// ── Config Kanban ─────────────────────────────
const stageConfig: Record<EtapeKanban, { label: string; dotColor: string }> = {
  SOUMIS:       { label: 'Applied',     dotColor: 'bg-blue-500'   },
  PRESELECTION: { label: 'Screened',    dotColor: 'bg-amber-500'  },
  ENTRETIEN:    { label: 'Interviewed', dotColor: 'bg-purple-500' },
  OFFRE:        { label: 'Offered',     dotColor: 'bg-[#2d6a4f]' },
};

// ── Badge Statut Offre ────────────────────────
function OffreStatusBadge({ statut }: { statut: Offre['statut'] }) {
  const styles = {
    active:  'bg-[#d8f3dc] text-[#2d6a4f]',
    urgente: 'bg-[#fef3c7] text-[#92400e]',
    fermee:  'bg-gray-100 text-gray-600',
  };
  const labels = { active: 'Active', urgente: 'Urgent', fermee: 'Closed' };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${styles[statut]}`}>
      {labels[statut]}
    </span>
  );
}

// ── Modal Candidat ────────────────────────────
function ModalCandidatDetail({ candidat, onClose, onChangerStatut }: {
  candidat: Candidat;
  onClose: () => void;
  onChangerStatut: (id: string, statut: string, commentaire: string) => void;
}) {
  const [nouveauStatut, setNouveauStatut] = useState(candidat.statut);
  const [commentaire, setCommentaire]     = useState('');
  const [loading, setLoading]             = useState(false);
  const statuts = ['SOUMIS','PRESELECTION','ENTRETIEN','OFFRE','EMBAUCHE','REFUSE'];

  const handleSave = async () => {
    setLoading(true);
    await onChangerStatut(candidat.id, nouveauStatut, commentaire);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8] sticky top-0 bg-white z-10">
          <h2 className="font-serif text-lg font-semibold">{candidat.prenom} {candidat.nom}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#f5f0e8] rounded-lg">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Infos */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'Poste visé',   v: candidat.posteVise },
              { l: 'Statut',       v: candidat.statut },
              { l: 'Email',        v: candidat.email },
              { l: 'Téléphone',    v: candidat.telephone || '—' },
              { l: 'Niveau',       v: candidat.niveauEtude || '—' },
              { l: 'Expérience',   v: candidat.experience || '—' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-[#f5f0e8] rounded-xl p-3">
                <div className="text-xs text-[#6b7280] mb-1">{l}</div>
                <div className="text-sm font-medium text-[#1a1a1a] truncate">{v}</div>
              </div>
            ))}
          </div>

          {/* Compétences */}
          {candidat.competences?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#6b7280] mb-2">Compétences</div>
              <div className="flex flex-wrap gap-1.5">
                {candidat.competences.map(c => (
                  <span key={c} className="text-xs bg-[#d8f3dc] text-[#2d6a4f] px-2.5 py-1 rounded-full font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Lettre motivation */}
          {candidat.lettreMotivation && (
            <div>
              <div className="text-xs font-medium text-[#6b7280] mb-2">Lettre de motivation</div>
              <p className="text-sm text-[#374151] bg-[#f5f0e8] rounded-xl p-3 leading-relaxed line-clamp-4">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {/* Changer statut */}
          <div className="border-t border-[#f0ebe0] pt-4">
            <div className="text-xs font-medium text-[#6b7280] mb-3">Faire avancer dans le pipeline</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {statuts.map(s => (
                <button key={s}
                  onClick={() => setNouveauStatut(s as Candidat['statut'])}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    nouveauStatut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                      : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                  }`}
                >{s}</button>
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
                      <span className="font-medium text-[#1a1a1a]">{h.statut}</span>
                      {h.commentaire && <span className="text-[#6b7280] ml-1">— {h.commentaire}</span>}
                      <div className="text-[#9ca3af]">{new Date(h.date).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60">
              {loading ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Offre (Créer + Modifier) ────────────
function ModalOffre({ offre, onClose, onSuccess }: {
  offre: Offre | null; // null = création, Offre = modification
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = offre !== null;

  const [form, setForm] = useState({
    titre:       offre?.titre       ?? '',
    departement: offre?.departement ?? 'Informatique',
    type:        offre?.type        ?? 'CDI',
    modeTravail: offre?.modeTravail ?? 'Hybrid',
    description: offre?.description ?? '',
    statut:      offre?.statut      ?? 'active',
  });
  const [loading, setLoading] = useState(false);
  const [erreur,  setErreur]  = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim()) { setErreur('Le titre est requis'); return; }
    setLoading(true);
    setErreur('');
    try {
      if (isEdit) {
        // ✅ Modification
        await api.put(`/offres/${offre!.id}`, form);
      } else {
        // ✅ Création
        await api.post('/offres', form);
      }
      onSuccess();
      onClose();
    } catch {
      setErreur(isEdit ? 'Erreur lors de la modification' : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8] sticky top-0 bg-white">
          <h2 className="font-serif text-lg font-semibold">
            {isEdit ? `Modifier : ${offre!.titre}` : 'Publier une offre'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-[#f5f0e8] rounded-lg">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              ❌ {erreur}
            </div>
          )}

          {/* Titre */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Titre du poste *</label>
            <input
              required
              value={form.titre}
              onChange={e => setForm({ ...form, titre: e.target.value })}
              placeholder="ex: Développeur Full Stack"
              className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
            />
          </div>

          {/* Département / Type / Mode */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Département</label>
              <select
                value={form.departement}
                onChange={e => setForm({ ...form, departement: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
              >
                {['Informatique','RH','Finance','Marketing','R&D'].map(d => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
              >
                {['CDI','CDD','Stage','Freelance'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Mode</label>
              <select
                value={form.modeTravail}
                onChange={e => setForm({ ...form, modeTravail: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f]"
              >
                {['On-site','Hybrid','Remote'].map(m => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Description du poste, missions, profil recherché..."
              className="w-full px-3 py-2.5 text-sm bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] resize-none"
            />
          </div>

          {/* Statut */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Statut</label>
            <div className="flex gap-2">
              {(['active','urgente','fermee'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, statut: s })}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    form.statut === s
                      ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                      : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                  }`}
                >
                  {s === 'active' ? '✅ Active' : s === 'urgente' ? '🔥 Urgent' : '🔒 Fermée'}
                </button>
              ))}
            </div>
          </div>

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
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading
                ? (isEdit ? 'Modification...' : 'Publication...')
                : (isEdit ? 'Enregistrer les modifications' : "Publier l'offre")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Card Candidat Kanban ──────────────────────
function CandidateCard({ candidat, onVoir }: {
  candidat: Candidat;
  onVoir: (c: Candidat) => void;
}) {
  const dateRelative = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div
      onClick={() => onVoir(candidat)}
      className="bg-white rounded-xl border border-[#e5e0d8] p-4 mb-3 hover:shadow-sm transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full truncate max-w-30">
          {candidat.posteVise}
        </span>
        <span className="text-[11px] text-[#9ca3af] shrink-0 ml-1">
          {dateRelative(candidat.soumisLe)}
        </span>
      </div>

      <h4 className="font-semibold text-[#1a1a1a] text-sm mb-0.5">
        {candidat.prenom} {candidat.nom}
      </h4>
      <p className="text-xs text-[#6b7280] mb-2 line-clamp-2">
        {candidat.experience || candidat.niveauEtude || candidat.email}
      </p>

      {candidat.competences?.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {candidat.competences.slice(0, 2).map(c => (
            <span key={c} className="text-[10px] bg-[#f5f0e8] text-[#6b7280] px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}

      {candidat.statut === 'ENTRETIEN' && (
        <div className="flex items-center gap-1.5 text-xs text-[#6b7280] bg-[#f5f0e8] rounded-lg px-2 py-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5" /> Entretien planifié
        </div>
      )}

      {candidat.statut === 'OFFRE' && (
        <div className="flex items-center gap-1.5 text-xs text-[#2d6a4f] font-medium mb-2">
          <CheckCircle className="w-3.5 h-3.5" /> Offre envoyée
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[#f0ebe0]">
        <span className="flex items-center gap-1 text-xs text-[#9ca3af]">
          <MessageSquare className="w-3.5 h-3.5" />
          {candidat.historiqueStatuts?.length || 0}
        </span>
        <span className="flex items-center gap-1 text-xs text-[#2d6a4f] font-medium">
          <Eye className="w-3 h-3" /> Voir
        </span>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function RecruitmentPage() {
  const [candidats,            setCandidats]            = useState<Candidat[]>([]);
  const [offres,               setOffres]               = useState<Offre[]>([]);
  const [loadingCandidats,     setLoadingCandidats]     = useState(true);
  const [loadingOffres,        setLoadingOffres]        = useState(true);
  const [offreSelectionnee,    setOffreSelectionnee]    = useState<Offre | null>(null);
  const [showModalOffre,       setShowModalOffre]       = useState(false);
  const [candidatSelectionne,  setCandidatSelectionne]  = useState<Candidat | null>(null);

  const stages: EtapeKanban[] = ['SOUMIS','PRESELECTION','ENTRETIEN','OFFRE'];

  // ── Chargements ──
  const chargerCandidats = async () => {
    try {
      setLoadingCandidats(true);
      const res = await candidatsService.lister() as any;
      const data: Candidat[] = res?.data?.candidats ?? [];
      setCandidats(data.filter(c => !['EMBAUCHE','REFUSE'].includes(c.statut)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCandidats(false);
    }
  };

  const chargerOffres = async () => {
    try {
      setLoadingOffres(true);
      const res = await api.get('/offres') as any;
      setOffres(res?.data?.offres ?? []);
    } catch {
      setOffres([]);
    } finally {
      setLoadingOffres(false);
    }
  };

  useEffect(() => {
    chargerCandidats();
    chargerOffres();
  }, []);

  // ── Actions ──
  const handleChangerStatut = async (id: string, statut: string, commentaire: string) => {
    try {
      await candidatsService.changerStatut(id, statut, commentaire);
      await chargerCandidats();
    } catch (e) { console.error(e); }
  };

  const handleSupprimerOffre = async (id: string) => {
    if (!confirm('Supprimer cette offre ?')) return;
    try {
      await api.delete(`/offres/${id}`);
      chargerOffres();
    } catch {
      setOffres(prev => prev.filter(o => o.id !== id));
    }
  };

  // Ouvrir modal modification
  const handleModifierOffre = (offre: Offre) => {
    setOffreSelectionnee(offre);
    setShowModalOffre(true);
  };

  // Ouvrir modal création
  const handleNouvelleOffre = () => {
    setOffreSelectionnee(null);
    setShowModalOffre(true);
  };

  return (
    <Layout searchPlaceholder="Search candidates...">
      <div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Recruitment Pipeline</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Manage candidates and track active hiring cycles
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
              Filter
            </button>
            <button
              onClick={handleNouvelleOffre}
              className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post New Job
            </button>
          </div>
        </div>

        {/* ── Kanban ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stages.map(stage => {
            const config  = stageConfig[stage];
            const colonne = candidats.filter(c => c.statut === stage);
            return (
              <div key={stage}>
                {/* Header colonne */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
                    <span className="font-semibold text-[#1a1a1a] text-sm">{config.label}</span>
                    <span className="text-xs text-[#6b7280] bg-[#f0ebe0] px-2 py-0.5 rounded-full font-medium">
                      {loadingCandidats ? '...' : colonne.length}
                    </span>
                  </div>
                  <button className="text-[#9ca3af] hover:text-[#6b7280]">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {/* Cards */}
                {loadingCandidats ? (
                  [...Array(2)].map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-[#e5e0d8] p-4 mb-3 animate-pulse">
                      <div className="h-3 bg-gray-100 rounded w-20 mb-2" />
                      <div className="h-4 bg-gray-100 rounded w-32 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-full" />
                    </div>
                  ))
                ) : colonne.length === 0 ? (
                  <div className="border-2 border-dashed border-[#e5e0d8] rounded-xl p-6 text-center">
                    <p className="text-xs text-[#9ca3af]">Aucun candidat</p>
                  </div>
                ) : (
                  colonne.map(c => (
                    <CandidateCard
                      key={c.id}
                      candidat={c}
                      onVoir={setCandidatSelectionne}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>

        {/* ── Tableau des offres ── */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#e5e0d8]">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-[#1a1a1a] text-lg">Active Job Postings</h3>
              <span className="text-xs bg-[#f0ebe0] text-[#6b7280] px-2 py-0.5 rounded-full font-medium">
                {offres.length}
              </span>
            </div>
            <button
              onClick={handleNouvelleOffre}
              className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Post New Job
            </button>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0] bg-[#fafaf8]">
                {['Job Position','Department','Type','Status','Date Posted','Actions'].map(h => (
                  <th
                    key={h}
                    className={`text-left ${h === 'Job Position' ? 'px-6' : 'px-4'} py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingOffres ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className={`${j === 1 ? 'px-6' : 'px-4'} py-4`}>
                        <div className="h-3 bg-gray-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : offres.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="text-4xl mb-3">💼</div>
                    <p className="text-sm text-[#6b7280]">Aucune offre publiée.</p>
                    <button
                      onClick={handleNouvelleOffre}
                      className="mt-3 text-sm text-[#2d6a4f] font-medium hover:underline"
                    >
                      Publier une offre →
                    </button>
                  </td>
                </tr>
              ) : (
                offres.map(offre => (
                  <tr
                    key={offre.id}
                    className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#fafaf8] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-sm text-[#1a1a1a]">{offre.titre}</div>
                      <div className="text-xs text-[#9ca3af]">{offre.modeTravail}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-[#374151]">
                        <Briefcase className="w-3.5 h-3.5 text-[#9ca3af]" />
                        {offre.departement}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {offre.type}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <OffreStatusBadge statut={offre.statut} />
                    </td>
                    <td className="px-4 py-4 text-sm text-[#6b7280]">
                      {new Date(offre.creeLe).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {/* ✅ Bouton modifier fonctionnel */}
                        <button
                          onClick={() => handleModifierOffre(offre)}
                          className="text-[#9ca3af] hover:text-[#2d6a4f] transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* ✅ Bouton supprimer */}
                        <button
                          onClick={() => handleSupprimerOffre(offre.id)}
                          className="text-[#9ca3af] hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loadingOffres && offres.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#fafaf8]">
              <span className="text-xs text-[#6b7280]">
                <strong>{offres.length}</strong> offre{offres.length > 1 ? 's' : ''} publiée{offres.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showModalOffre && (
        <ModalOffre
          offre={offreSelectionnee}
          onClose={() => { setShowModalOffre(false); setOffreSelectionnee(null); }}
          onSuccess={chargerOffres}
        />
      )}

      {candidatSelectionne && (
        <ModalCandidatDetail
          candidat={candidatSelectionne}
          onClose={() => setCandidatSelectionne(null)}
          onChangerStatut={handleChangerStatut}
        />
      )}
    </Layout>
  );
}