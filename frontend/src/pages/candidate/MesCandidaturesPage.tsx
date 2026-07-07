// src/pages/candidate/MesCandidaturesPage.tsx
import { useState, useEffect } from 'react';
import {
  Briefcase, Clock, CheckCircle,
  XCircle, ChevronRight, FileText,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { candidatsService } from '../../services/candidats';
import { useAuth } from '../../context/AuthContext';
import type { Candidat } from '../../types';

// ── Config statuts ────────────────────────────
const statutConfig: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ className?: string }>;
  step: number;
}> = {
  SOUMIS: {
    label: 'Soumise',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    icon: FileText,
    step: 1,
  },
  PRESELECTION: {
    label: 'Présélectionné',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    icon: CheckCircle,
    step: 2,
  },
  ENTRETIEN: {
    label: 'Entretien',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    icon: Clock,
    step: 3,
  },
  OFFRE: {
    label: 'Offre reçue',
    color: 'text-[#2d6a4f]',
    bg: 'bg-[#d8f3dc]',
    icon: CheckCircle,
    step: 4,
  },
  EMBAUCHE: {
    label: 'Embauché 🎉',
    color: 'text-[#2d6a4f]',
    bg: 'bg-[#d8f3dc]',
    icon: CheckCircle,
    step: 5,
  },
  REFUSE: {
    label: 'Non retenu',
    color: 'text-red-600',
    bg: 'bg-red-50',
    icon: XCircle,
    step: 0,
  },
};

// ── Progress Steps ────────────────────────────
function PipelineProgress({ statut }: { statut: string }) {
  const steps = ['SOUMIS', 'PRESELECTION', 'ENTRETIEN', 'OFFRE', 'EMBAUCHE'];
  const currentStep = statutConfig[statut]?.step ?? 0;
  const isRefused = statut === 'REFUSE';

  if (isRefused) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500">
        <XCircle className="w-4 h-4" />
        Candidature non retenue
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const done    = i + 1 <= currentStep;
        const current = i + 1 === currentStep;
        return (
          <div key={step} className="flex items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
              done
                ? 'bg-[#2d6a4f] text-white'
                : current
                  ? 'bg-[#2d6a4f] text-white ring-2 ring-[#2d6a4f]/30'
                  : 'bg-[#f0ebe0] text-[#9ca3af]'
            }`}>
              {done ? '✓' : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-0.5 rounded ${
                i + 1 < currentStep ? 'bg-[#2d6a4f]' : 'bg-[#f0ebe0]'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Card Candidature ──────────────────────────
function CandidatureCard({ candidat }: { candidat: Candidat }) {
  const [expanded, setExpanded] = useState(false);
  const config = statutConfig[candidat.statut] ?? statutConfig['SOUMIS'];
  const Icon   = config.icon;

  // ✅ Supporte les deux formats
  const titrePoste = (candidat as any).offreTitre || candidat.posteVise || 'Candidature';
  const dateStr    = candidat.soumisLe || (candidat as any).creeLe || new Date().toISOString();
  const scoreCV    = (candidat as any).scoreCV;

  return (
    <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden hover:shadow-sm transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#d8f3dc] rounded-xl flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-[#2d6a4f]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#1a1a1a]">{titrePoste}</h3>
              <p className="text-xs text-[#6b7280]">
                Soumis le {new Date(dateStr).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full ${config.bg} ${config.color}`}>
              <Icon className="w-3.5 h-3.5" />
              {config.label}
            </span>
            {/* ✅ Score CV si disponible */}
            {scoreCV !== null && scoreCV !== undefined && (
              <span className="text-[10px] text-[#6b7280] bg-[#f5f0e8] px-2 py-0.5 rounded-full">
                Score CV: {scoreCV}/100
              </span>
            )}
          </div>
        </div>

        <div className="mb-4">
          <PipelineProgress statut={candidat.statut} />
        </div>

        {candidat.competences?.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-3">
            {candidat.competences.slice(0, 4).map((c, i) => (
              <span key={`c-${i}`} className="text-[10px] bg-[#f5f0e8] text-[#6b7280] px-2 py-0.5 rounded-full">
                {c}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[#2d6a4f] font-medium hover:underline mt-1"
        >
          {expanded ? 'Masquer' : 'Voir le détail'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#f0ebe0] px-5 py-4 bg-[#fafaf8] space-y-3">
          {/* Historique */}
          {candidat.historiqueStatuts?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">Historique</p>
              <div className="space-y-2">
                {[...candidat.historiqueStatuts].reverse().map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2d6a4f] mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium text-[#1a1a1a]">
                        {statutConfig[h.statut]?.label ?? h.statut}
                      </span>
                      {h.commentaire && (
                        <span className="text-[#6b7280] ml-1">— {h.commentaire}</span>
                      )}
                      <p className="text-[#9ca3af] text-[10px]">
                        {new Date(h.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lettre motivation */}
          {candidat.lettreMotivation && (
            <div>
              <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">Lettre de motivation</p>
              <p className="text-xs text-[#374151] leading-relaxed line-clamp-4 bg-white rounded-xl p-3 border border-[#e5e0d8]">
                {candidat.lettreMotivation}
              </p>
            </div>
          )}

          {/* CV uploadé */}
          {(candidat as any).cvFileName && (
            <div>
              <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">CV</p>
              <div className="flex items-center gap-2 text-xs text-[#2d6a4f] bg-[#d8f3dc] px-3 py-2 rounded-xl w-fit">
                <FileText className="w-3.5 h-3.5" />
                {(candidat as any).cvFileName}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function MesCandidaturesPage() {
  const { user } = useAuth();
  const [candidatures, setCandidatures] = useState<Candidat[]>([]);
  const [loading,       setLoading]     = useState(true);
  const [filter,        setFilter]      = useState('Tous');

  const filters = ['Tous', 'En cours', 'Embauché', 'Non retenu'];

  
  const charger = async () => {
  try {
    setLoading(true);
    if (!user) return;

    // Route dédiée → filtre automatiquement par email du token
    const res = await candidatsService.mesCandidatures() as any;
    const data: Candidat[] = res?.data?.candidats ?? [];
    setCandidatures(data);

  } catch (e: any) {
    console.error('Erreur candidatures:', e);
    setCandidatures([]);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { charger(); }, []);

  const filtered = candidatures.filter(c => {
    if (filter === 'En cours')   return !['EMBAUCHE','REFUSE'].includes(c.statut);
    if (filter === 'Embauché')   return c.statut === 'EMBAUCHE';
    if (filter === 'Non retenu') return c.statut === 'REFUSE';
    return true;
  });

  // Stats
  const stats = {
    total:     candidatures.length,
    enCours:   candidatures.filter(c => !['EMBAUCHE','REFUSE'].includes(c.statut)).length,
    embauche:  candidatures.filter(c => c.statut === 'EMBAUCHE').length,
    refuse:    candidatures.filter(c => c.statut === 'REFUSE').length,
  };

  return (
    <Layout searchPlaceholder="Rechercher...">
      <div>
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Mes Candidatures</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Suivez l'avancement de vos candidatures en temps réel
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {[
            { label: 'Total',      value: stats.total,   color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
            { label: 'En cours',   value: stats.enCours, color: 'bg-blue-50 text-blue-600'     },
            { label: 'Embauché',   value: stats.embauche,color: 'bg-[#d8f3dc] text-[#2d6a4f]' },
            { label: 'Non retenu', value: stats.refuse,  color: 'bg-red-50 text-red-500'       },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${s.color}`}>
                <span className="text-lg font-bold">{s.value}</span>
              </div>
              <p className="text-sm text-[#6b7280] font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1 w-fit mb-6">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-[#2d6a4f] text-white shadow-sm'
                  : 'text-[#6b7280] hover:text-[#374151]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5e0d8] p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 bg-gray-100 rounded-xl" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-40" />
                    <div className="h-3 bg-gray-100 rounded w-24" />
                  </div>
                </div>
                <div className="h-6 bg-gray-100 rounded w-60" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="font-semibold text-[#1a1a1a] mb-2">
              Aucune candidature
            </h3>
            <p className="text-sm text-[#6b7280]">
              Vous n'avez pas encore postulé à des offres.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(c => (
              <CandidatureCard key={c.id} candidat={c} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}