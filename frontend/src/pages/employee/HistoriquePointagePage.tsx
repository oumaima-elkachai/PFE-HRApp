import { useState, useEffect } from 'react';
import {
  Clock, CheckCircle, AlertTriangle, Download,
  Calendar, ChevronLeft, ChevronRight, Timer,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { pointagesService } from '../../services/pointages';

// ── Types ─────────────────────────────────────
interface Pointage {
  employeId: string;
  date: string;
  heureArrivee: string;
  heureDepart?: string;
  dureeMinutes?: number;
  statut: 'EN_COURS' | 'TERMINE';
  employeNom?: string;
}

interface Stats {
  total: number;
  termines: number;
  totalMinutes: number;
  retards: number;
  heuresSupp: number;
  absences: number;
}

// ── Constantes ────────────────────────────────
const JOURS_FERIES_2026 = [
  '2026-01-01','2026-03-20','2026-04-09','2026-05-01',
  '2026-07-25','2026-08-13','2026-10-15',
];

const MOIS_NOMS = [
  '','Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

const HEURE_DEBUT_CONTRAT = { h: 8, m: 30 };  // 08h30
const HEURES_CONTRAT_JOUR = 8;
const ITEMS_PAR_PAGE      = 10;

// ── Helpers ───────────────────────────────────
function getDateStr(p: Pointage): string {
  return (p.date || p.heureArrivee || '').split('T')[0];
}

function formatHeure(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '--:--'; }
}

function formatDuree(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h00';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function estWeekend(dateStr: string): boolean {
  const jour = new Date(dateStr + 'T12:00:00').getDay();
  return jour === 0 || jour === 6;
}

function estJourFerie(dateStr: string): boolean {
  return JOURS_FERIES_2026.includes(dateStr);
}

function estRetard(heureArrivee: string): boolean {
  const d     = new Date(heureArrivee);
  const total = d.getHours() * 60 + d.getMinutes();
  const limite = HEURE_DEBUT_CONTRAT.h * 60 + HEURE_DEBUT_CONTRAT.m + 15; // 15 min de tolérance
  return total > limite;
}

function minutesRetard(heureArrivee: string): number {
  const d     = new Date(heureArrivee);
  const total = d.getHours() * 60 + d.getMinutes();
  const limite = HEURE_DEBUT_CONTRAT.h * 60 + HEURE_DEBUT_CONTRAT.m;
  return Math.max(0, total - limite);
}

function heuresSupp(dureeMinutes: number): number {
  const heuresJour = dureeMinutes / 60;
  return Math.max(0, heuresJour - HEURES_CONTRAT_JOUR);
}

function getTypeJour(dateStr: string): {
  label: string;
  color: string;
  bg: string;
  dot: string;
} {
  if (estJourFerie(dateStr))
    return { label: 'Jour Férié', color: 'text-red-700',    bg: 'bg-red-50',    dot: 'bg-red-500'    };
  if (estWeekend(dateStr))
    return { label: 'Weekend',    color: 'text-purple-700',  bg: 'bg-purple-50', dot: 'bg-purple-500'  };
  return   { label: 'Ouvrable',   color: 'text-[#2d6a4f]',  bg: 'bg-[#d8f3dc]', dot: 'bg-[#2d6a4f]' };
}

function getNbJoursOuvrables(mois: number, annee: number): number {
  const dernier = new Date(annee, mois, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  let n = 0;
  for (let j = 1; j <= dernier; j++) {
    const d = new Date(annee, mois - 1, j);
    const ds = `${annee}-${pad(mois)}-${pad(j)}`;
    if (d.getDay() !== 0 && d.getDay() !== 6 && !JOURS_FERIES_2026.includes(ds)) n++;
  }
  return n;
}

// ── StatCard ──────────────────────────────────
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
        <p className="text-sm text-[#6b7280] truncate">{label}</p>
        <p className="text-2xl font-bold text-[#1a1a1a] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────
function Pagination({
  page, totalPages, total, onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const debut = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => debut + i);

  return (
    <div className="px-6 py-4 border-t border-[#f0ebe0] bg-[#faf9f7] flex items-center justify-between">
      <span className="text-xs text-[#6b7280]">
        Page <strong className="text-[#1a1a1a]">{page}</strong> sur{' '}
        <strong className="text-[#1a1a1a]">{totalPages}</strong>
        {' · '}
        <strong className="text-[#1a1a1a]">{total}</strong> entrée{total > 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(1)} disabled={page === 1}
          className="p-1.5 rounded-lg border border-[#e5e0d8] hover:bg-[#f0ebe0] disabled:opacity-30 transition-colors"
          title="Première page"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-[#6b7280]" />
        </button>

        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
              page === p
                ? 'bg-[#2d6a4f] text-white border-[#2d6a4f] shadow-sm'
                : 'border-[#e5e0d8] text-[#6b7280] hover:bg-[#f0ebe0] hover:text-[#1a1a1a]'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => onPage(totalPages)} disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-[#e5e0d8] hover:bg-[#f0ebe0] disabled:opacity-30 transition-colors"
          title="Dernière page"
        >
          <ChevronRight className="w-3.5 h-3.5 text-[#6b7280]" />
        </button>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function HistoriquePointagePage() {
  const [pointages, setPointages]     = useState<Pointage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erreur, setErreur]           = useState('');
  const [moisFiltre, setMoisFiltre]   = useState(new Date().getMonth() + 1);
  const [anneeFiltre, setAnneeFiltre] = useState(new Date().getFullYear());
  const [statutFiltre, setStatutFiltre] = useState<'TOUS' | 'TERMINE' | 'EN_COURS'>('TOUS');
  const [page, setPage]               = useState(1);

  useEffect(() => {
    const charger = async () => {
      try {
        setLoading(true);
        setErreur('');
        const res = await pointagesService.historique() as any;
        const data: Pointage[] = res?.data?.pointages ?? res?.pointages ?? [];
        setPointages(data);
      } catch (e: any) {
        console.error('Erreur pointages:', e);
        setErreur(e?.erreur || 'Impossible de charger les pointages');
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, []);

  // Filtrer par mois + année + statut
  const filtres = pointages.filter(p => {
    const d = new Date(p.heureArrivee || p.date || '');
    const matchDate   = d.getMonth() + 1 === moisFiltre && d.getFullYear() === anneeFiltre;
    const matchStatut = statutFiltre === 'TOUS' || p.statut === statutFiltre;
    return matchDate && matchStatut;
  }).sort((a, b) => new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime());

  // Stats calculées
  const stats: Stats = filtres.reduce((acc, p) => {
    acc.total++;
    if (p.statut === 'TERMINE') {
      acc.termines++;
      acc.totalMinutes += p.dureeMinutes || 0;
      if (estRetard(p.heureArrivee)) acc.retards++;
      if (p.dureeMinutes) acc.heuresSupp += heuresSupp(p.dureeMinutes);
    }
    return acc;
  }, { total: 0, termines: 0, totalMinutes: 0, retards: 0, heuresSupp: 0, absences: 0 });

  const nbOuvrables   = getNbJoursOuvrables(moisFiltre, anneeFiltre);
  stats.absences      = Math.max(0, nbOuvrables - stats.termines);
  const moyenneMins   = stats.termines > 0 ? Math.round(stats.totalMinutes / stats.termines) : 0;

  // Pagination
  const totalPages  = Math.max(1, Math.ceil(filtres.length / ITEMS_PAR_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const paginated   = filtres.slice((pageClamped - 1) * ITEMS_PAR_PAGE, pageClamped * ITEMS_PAR_PAGE);

  const handleFiltreMois = (m: number) => { setMoisFiltre(m); setPage(1); };
  const handleFiltreAnnee = (a: number) => { setAnneeFiltre(a); setPage(1); };
  const handleFiltreStatut = (s: 'TOUS' | 'TERMINE' | 'EN_COURS') => { setStatutFiltre(s); setPage(1); };

  // Export CSV
  const exportCSV = () => {
    const lignes = [
      ['Date','Jour','Arrivée','Départ','Durée','Type','Retard','Hres Supp','Statut'],
      ...filtres.map(p => {
        const ds    = getDateStr(p);
        const type  = getTypeJour(ds);
        const ret   = estRetard(p.heureArrivee);
        const hsupp = p.dureeMinutes ? heuresSupp(p.dureeMinutes).toFixed(2) : '0';
        return [
          ds,
          new Date(ds + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }),
          formatHeure(p.heureArrivee),
          p.heureDepart ? formatHeure(p.heureDepart) : '—',
          p.dureeMinutes ? formatDuree(p.dureeMinutes) : '—',
          type.label,
          ret ? `${minutesRetard(p.heureArrivee)} min` : 'Non',
          hsupp + 'h',
          p.statut,
        ];
      }),
    ];
    const csv  = lignes.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pointages-${anneeFiltre}-${String(moisFiltre).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="max-w-5xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#1a1a1a] tracking-tight">
              Historique de pointage
            </h1>
            <p className="text-[#6b7280] mt-1">
              Consultez vos présences, retards et heures supplémentaires
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Calendar}
            label="Jours pointés"
            value={loading ? '...' : stats.total}
            sub={`sur ${nbOuvrables} ouvrables`}
            iconBg="bg-[#dbeafe]"
            iconColor="text-[#3b82f6]"
          />
          <StatCard
            icon={CheckCircle}
            label="Journées complètes"
            value={loading ? '...' : stats.termines}
            sub={`${stats.absences} absence${stats.absences > 1 ? 's' : ''}`}
          />
          <StatCard
            icon={Clock}
            label="Total heures"
            value={loading ? '...' : formatDuree(stats.totalMinutes)}
            sub={`moy. ${formatDuree(moyenneMins)}/jour`}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatCard
            icon={AlertTriangle}
            label="Retards"
            value={loading ? '...' : stats.retards}
            sub={`${stats.heuresSupp.toFixed(1)}h supp.`}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* ── Barre de progression du mois ── */}
        {!loading && (
          <div className="bg-white rounded-xl border border-[#e5e0d8] p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-[#1a1a1a]">
                Taux de présence — {MOIS_NOMS[moisFiltre]} {anneeFiltre}
              </span>
              <span className="text-sm font-black text-[#2d6a4f]">
                {nbOuvrables > 0 ? Math.round((stats.termines / nbOuvrables) * 100) : 0}%
              </span>
            </div>
            <div className="h-3 bg-[#f0ebe0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2d6a4f] rounded-full transition-all duration-500"
                style={{ width: `${nbOuvrables > 0 ? (stats.termines / nbOuvrables) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-[#9ca3af]">
              <span>{stats.termines} présents</span>
              <span>{stats.absences} absences</span>
            </div>
          </div>
        )}

        {/* ── Filtres ── */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Mois */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#374151] uppercase tracking-wider">Mois :</span>
            <select
              value={moisFiltre}
              onChange={e => handleFiltreMois(Number(e.target.value))}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:border-[#2d6a4f] transition-colors"
            >
              {MOIS_NOMS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Année */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#374151] uppercase tracking-wider">Année :</span>
            <select
              value={anneeFiltre}
              onChange={e => handleFiltreAnnee(Number(e.target.value))}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:border-[#2d6a4f] transition-colors"
            >
              {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Statut */}
          <div className="flex gap-1 bg-[#f5f0e8] rounded-xl p-1 ml-auto">
            {(['TOUS', 'TERMINE', 'EN_COURS'] as const).map(s => (
              <button
                key={s}
                onClick={() => handleFiltreStatut(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statutFiltre === s
                    ? 'bg-white text-[#1a1a1a] shadow-sm'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {s === 'TOUS' ? 'Tous' : s === 'TERMINE' ? 'Terminés' : 'En cours'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Erreur ── */}
        {erreur && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Erreur de chargement</p>
              <p className="text-xs text-red-600">{erreur}</p>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <h3 className="font-black text-lg text-[#1a1a1a]">
              {MOIS_NOMS[moisFiltre]} {anneeFiltre}
            </h3>
            <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2.5 py-1 rounded-full">
              {filtres.length} entrée{filtres.length > 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Date','Type','Arrivée','Départ','Durée','Statut arrivée','Hres Supp','Statut'].map(h => (
                  <th
                    key={h}
                    className={`text-left ${h === 'Date' ? 'px-6' : 'px-3'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest whitespace-nowrap`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(ITEMS_PAR_PAGE)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3 bg-[#f0ebe0] rounded w-16 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="text-5xl mb-4">🕐</div>
                    <p className="text-base font-bold text-[#1a1a1a] mb-1">
                      Aucun pointage trouvé
                    </p>
                    <p className="text-sm text-[#6b7280]">
                      {statutFiltre !== 'TOUS'
                        ? 'Essayez de changer le filtre de statut'
                        : `Aucun pointage pour ${MOIS_NOMS[moisFiltre]} ${anneeFiltre}`}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((p, idx) => {
                  const dateStr = getDateStr(p);
                  const type    = getTypeJour(dateStr);
                  const retard  = estRetard(p.heureArrivee);
                  const minRet  = minutesRetard(p.heureArrivee);
                  const hsupp   = p.dureeMinutes ? heuresSupp(p.dureeMinutes) : 0;
                  const isEven  = idx % 2 === 0;

                  return (
                                        <tr
                      key={`${p.employeId}-${p.date}`}
                      className={`border-b border-[#f0ebe0] last:border-0 transition-colors hover:bg-[#faf5ee] ${
                        isEven ? '' : 'bg-[#fafaf8]'
                      }`}
                    >
                      {/* Date */}
                      <td className="px-6 py-3.5">
                        <div className="font-bold text-sm text-[#1a1a1a] whitespace-nowrap">
                          {new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'short', day: 'numeric', month: 'short',
                          })}
                        </div>
                        <div className="text-[10px] text-[#9ca3af]">{anneeFiltre}</div>
                      </td>

                      {/* Type */}
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${type.bg} ${type.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${type.dot}`} />
                          {type.label}
                        </span>
                      </td>

                      {/* Arrivée */}
                      <td className="px-3 py-3.5">
                        <span className={`text-sm font-bold ${retard ? 'text-amber-600' : 'text-[#1a1a1a]'}`}>
                          {formatHeure(p.heureArrivee)}
                        </span>
                      </td>

                      {/* Départ */}
                      <td className="px-3 py-3.5">
                        {p.heureDepart ? (
                          <span className="text-sm font-medium text-[#374151]">
                            {formatHeure(p.heureDepart)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            En cours
                          </span>
                        )}
                      </td>

                      {/* Durée */}
                      <td className="px-3 py-3.5">
                        {p.dureeMinutes ? (
                          <span className={`text-sm font-bold ${
                            p.dureeMinutes >= HEURES_CONTRAT_JOUR * 60
                              ? 'text-[#2d6a4f]'
                              : 'text-amber-600'
                          }`}>
                            {formatDuree(p.dureeMinutes)}
                          </span>
                        ) : (
                          <span className="text-[#9ca3af] text-sm">—</span>
                        )}
                      </td>

                      {/* Statut arrivée */}
                      <td className="px-3 py-3.5">
                        {retard ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Retard
                            </span>
                            <div className="text-[10px] text-amber-600 mt-0.5 ml-0.5">
                              +{minRet} min
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2d6a4f] bg-[#d8f3dc] px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-2.5 h-2.5" />
                            À l'heure
                          </span>
                        )}
                      </td>

                      {/* Heures supp */}
                      <td className="px-3 py-3.5">
                        {hsupp > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            <Timer className="w-2.5 h-2.5" />
                            +{hsupp.toFixed(1)}h
                          </span>
                        ) : (
                          <span className="text-[#9ca3af] text-xs">—</span>
                        )}
                      </td>

                      {/* Statut pointage */}
                      <td className="px-3 py-3.5">
                        {p.statut === 'TERMINE' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2d6a4f] bg-[#d8f3dc] px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-2.5 h-2.5" />
                            Terminé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5" />
                            En cours
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <Pagination
            page={pageClamped}
            totalPages={totalPages}
            total={filtres.length}
            onPage={setPage}
          />
        </div>

        {/* ── Légende ── */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <span className="text-xs text-[#9ca3af] font-medium">Légende :</span>
          {[
            { dot: 'bg-[#2d6a4f]', label: 'Jour ouvrable' },
            { dot: 'bg-purple-500', label: 'Weekend (×1.75)' },
            { dot: 'bg-red-500',    label: 'Jour férié (×2.0)' },
            { dot: 'bg-amber-500',  label: 'Retard (−15 min tolérance)' },
            { dot: 'bg-purple-400', label: 'Heures supplémentaires (×1.5)' },
          ].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              {label}
            </div>
          ))}
        </div>

        <div className="mt-6 text-center text-xs text-[#9ca3af]">
          <span className="text-[#2d6a4f] font-medium">Terra HR</span> · Espace Employé · {new Date().getFullYear()}
        </div>
      </div>
    </Layout>
  );
}