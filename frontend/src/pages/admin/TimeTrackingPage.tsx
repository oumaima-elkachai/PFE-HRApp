import { useState, useEffect } from 'react';
import { Clock, Search, Download, CheckCircle, AlertCircle, Timer } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { pointagesService } from '../../services/pointages';

// ── Types ─────────────────────────────────────
interface Pointage {
  id: string;
  employeId: string;
  employeNom: string;
  date: string;
  heureArrivee: string;
  heureDepart?: string;
  dureeMinutes?: number;
  statut: 'EN_COURS' | 'TERMINE';
}

// ── Helpers ───────────────────────────────────
function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ── Badge statut ──────────────────────────────
function StatusBadge({ statut }: { statut: 'EN_COURS' | 'TERMINE' }) {
  if (statut === 'EN_COURS') return (
    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      En cours
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#d8f3dc] text-[#2d6a4f] text-xs px-2.5 py-1 rounded-full font-medium">
      <CheckCircle className="w-3 h-3" />
      Terminé
    </span>
  );
}

// ── Stat Card ─────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e0d8] p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#1a1a1a] mb-0.5">{value}</div>
      <div className="text-xs text-[#6b7280]">{label}</div>
      {sub && <div className="text-[11px] text-[#9ca3af] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function TimeTrackingPage() {
  const [pointages, setPointages]       = useState<Pointage[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterStatut, setFilterStatut] = useState<'ALL' | 'EN_COURS' | 'TERMINE'>('ALL');
  const [filterDate, setFilterDate]     = useState(new Date().toISOString().split('T')[0]);

  const charger = async () => {
    try {
      setLoading(true);
      const res = await pointagesService.historique({ date: filterDate }) as any;
      const data: Pointage[] = res?.data?.pointages ?? res?.pointages ?? [];
      setPointages(data);
    } catch (e) {
      console.error('Erreur chargement pointages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, [filterDate]);

  // Stats calculées
  const termines   = pointages.filter(p => p.statut === 'TERMINE');
  const enCours    = pointages.filter(p => p.statut === 'EN_COURS');
  const totalMins  = termines.reduce((s, p) => s + (p.dureeMinutes || 0), 0);
  const moyenneMins = termines.length > 0 ? Math.round(totalMins / termines.length) : 0;

  // Filtrage
  const filtered = pointages.filter(p => {
    const matchSearch  = p.employeNom.toLowerCase().includes(search.toLowerCase());
    const matchStatut  = filterStatut === 'ALL' || p.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ['Employé', 'Date', 'Heure Arrivée', 'Heure Départ', 'Durée', 'Statut'],
      ...filtered.map(p => [
        p.employeNom,
        p.date,
        formatHeure(p.heureArrivee),
        p.heureDepart ? formatHeure(p.heureDepart) : '-',
        p.dureeMinutes ? formatDuree(p.dureeMinutes) : '-',
        p.statut,
      ])
    ];
    const csv     = rows.map(r => r.join(',')).join('\n');
    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `pointages-${filterDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout searchPlaceholder="Search employees...">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a]">Time Tracking</h1>
            <p className="text-sm text-[#6b7280] mt-0.5">
              Suivi des présences et heures de travail des employés
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={Clock}
            label="Total pointages"
            value={loading ? '...' : pointages.length}
            sub={`pour le ${new Date(filterDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
          />
          <StatCard
            icon={CheckCircle}
            label="Terminés"
            value={loading ? '...' : termines.length}
            sub="journées complètes"
            color="bg-[#d8f3dc]"
            iconColor="text-[#2d6a4f]"
          />
          <StatCard
            icon={Timer}
            label="En cours"
            value={loading ? '...' : enCours.length}
            sub="employés présents"
            color="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            icon={AlertCircle}
            label="Durée moyenne"
            value={loading ? '...' : (moyenneMins > 0 ? formatDuree(moyenneMins) : '—')}
            sub="par employé aujourd'hui"
            color="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {/* Recherche */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Rechercher un employé..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30"
            />
          </div>

          {/* Filtre date */}
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:border-[#2d6a4f] text-[#374151]"
          />

          {/* Filtre statut */}
          <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1">
            {(['ALL', 'EN_COURS', 'TERMINE'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatut(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterStatut === s ? 'bg-[#2d6a4f] text-white' : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {s === 'ALL' ? 'Tous' : s === 'EN_COURS' ? 'En cours' : 'Terminés'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0] bg-[#fafaf8]">
                {['Employé', 'Date', 'Arrivée', 'Départ', 'Durée', 'Statut'].map(h => (
                  <th key={h} className={`text-left ${h === 'Employé' ? 'px-6' : 'px-4'} py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
                        <div className="h-3 bg-gray-100 rounded w-28 animate-pulse" />
                      </div>
                    </td>
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-gray-100 rounded w-16 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="text-4xl mb-3">🕐</div>
                    <p className="text-sm text-[#6b7280]">
                      {search
                        ? `Aucun résultat pour "${search}"`
                        : `Aucun pointage pour le ${new Date(filterDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      }
                    </p>
                    <p className="text-xs text-[#9ca3af] mt-1">
                      Les employés peuvent pointer via leur dashboard
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => {
                  const colors = ['bg-[#2d6a4f]','bg-blue-600','bg-purple-600','bg-orange-500','bg-teal-600'];
                  const color  = colors[p.employeNom.charCodeAt(0) % colors.length];
                  return (
                    <tr key={p.id} className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#fafaf8] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0`}>
                            {getInitials(p.employeNom)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-[#1a1a1a]">{p.employeNom}</div>
                            <div className="text-xs text-[#9ca3af]">ID: {p.employeId.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#374151]">
                        {new Date(p.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-[#1a1a1a]">
                          {formatHeure(p.heureArrivee)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {p.heureDepart ? (
                          <span className="text-sm font-medium text-[#1a1a1a]">
                            {formatHeure(p.heureDepart)}
                          </span>
                        ) : (
                          <span className="text-sm text-[#9ca3af]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {p.dureeMinutes ? (
                          <span className="text-sm font-semibold text-[#2d6a4f]">
                            {formatDuree(p.dureeMinutes)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            En cours...
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge statut={p.statut} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {!loading && filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#fafaf8] flex items-center justify-between">
              <span className="text-xs text-[#6b7280]">
                <strong>{filtered.length}</strong> pointage{filtered.length > 1 ? 's' : ''} •{' '}
                Total : <strong>{totalMins > 0 ? formatDuree(totalMins) : '0h00'}</strong> heures travaillées
              </span>
              <span className="text-xs text-[#9ca3af]">
                {termines.length} terminé{termines.length > 1 ? 's' : ''} • {enCours.length} en cours
              </span>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}