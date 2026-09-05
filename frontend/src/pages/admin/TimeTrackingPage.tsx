import { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle, AlertTriangle, Download,
  Search, Users, Timer, ChevronLeft, ChevronRight,
  RefreshCw, Briefcase,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { pointagesService } from '../../services/pointages';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';

// ── Types ─────────────────────────────────────
interface Pointage {
  employeId: string;
  employeNom?: string;
  employeEmail?: string;
  poste?: string;
  departement?: string;
  date?: string;
  heureArrivee: string;
  heureDepart?: string;
  dureeMinutes?: number;
  statut: 'EN_COURS' | 'TERMINE';
}

// ── Constantes ────────────────────────────────
const JOURS_FERIES = [
  '2026-01-01','2026-03-20','2026-04-09','2026-05-01',
  '2026-07-25','2026-08-13','2026-10-15',
];
const ITEMS_PAR_PAGE = 15;
const DEPTS = ['Tous','Informatique','RH','Finance','Marketing','R&D'];

// ── Helpers ───────────────────────────────────
function getDateStr(p: Pointage): string {
  return (p.date || p.heureArrivee || '').split('T')[0];
}

function formatHeure(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '--:--'; }
}

function formatDuree(min: number): string {
  if (!min || min <= 0) return '0h00';
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
}

function getInitials(nom: string): string {
  return (nom || 'XX').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function estWeekend(dateStr: string): boolean {
  const j = new Date(dateStr + 'T12:00:00').getDay();
  return j === 0 || j === 6;
}

function estFerie(dateStr: string): boolean {
  return JOURS_FERIES.includes(dateStr);
}

function estRetard(heureArrivee: string): boolean {
  const d = new Date(heureArrivee);
  return d.getHours() * 60 + d.getMinutes() > 8 * 60 + 45; // 08h45
}

function minutesRetard(heureArrivee: string): number {
  const d     = new Date(heureArrivee);
  const total = d.getHours() * 60 + d.getMinutes();
  return Math.max(0, total - (8 * 60 + 30));
}

function heuresSupp(dureeMinutes: number): number {
  return Math.max(0, dureeMinutes / 60 - 8);
}

function getTypeJour(dateStr: string): { label: string; color: string; bg: string } {
  if (estFerie(dateStr))   return { label: 'Férié',   color: 'text-red-700',    bg: 'bg-red-50'    };
  if (estWeekend(dateStr)) return { label: 'Weekend',  color: 'text-purple-700', bg: 'bg-purple-50' };
  return                          { label: 'Ouvrable', color: 'text-[#2d6a4f]',  bg: 'bg-[#d8f3dc]' };
}

const AVATAR_COLORS = [
  'bg-[#2d6a4f]','bg-blue-600','bg-purple-600',
  'bg-orange-500','bg-teal-600','bg-rose-500','bg-indigo-600',
];

function avatarColor(nom: string): string {
  return AVATAR_COLORS[(nom || 'A').charCodeAt(0) % AVATAR_COLORS.length];
}

// ── StatCard ──────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, iconBg = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string;
  iconBg?: string; iconColor?: string;
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

// ── Page principale ───────────────────────────
export default function TimeTrackingPage() {
  const [pointages, setPointages]         = useState<Pointage[]>([]);
  const [employes, setEmployes]           = useState<Employe[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [lastUpdate, setLastUpdate]       = useState<Date>(new Date());

  // Filtres
  const [search, setSearch]               = useState('');
  const [filterDate, setFilterDate]       = useState('');
  const [filterMois, setFilterMois]       = useState('');
  const [filterEmployeId, setFilterEmployeId] = useState('');
  const [filterDept, setFilterDept]       = useState('Tous');
  const [filterStatut, setFilterStatut]   = useState<'ALL' | 'EN_COURS' | 'TERMINE'>('ALL');
  const [filterType, setFilterType]       = useState<'ALL' | 'RETARD' | 'SUPP' | 'WEEKEND' | 'FERIE'>('ALL');
  const [page, setPage]                   = useState(1);

  // Chargement
  const charger = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const [ptRes, empRes] = await Promise.all([
        pointagesService.historique() as any,
        employesService.lister() as any,
      ]);

      const emps: Employe[] = empRes?.data?.employes ?? [];
      setEmployes(emps);

      const data: Pointage[] = ptRes?.data?.pointages ?? [];

      // Enrichir avec les noms si manquants
      const enrichis = data.map(p => {
        const emp = emps.find(e => e.id === p.employeId);
        return {
          ...p,
          employeNom: (p.employeNom && p.employeNom !== 'undefined undefined')
            ? p.employeNom
            : emp ? `${emp.prenom} ${emp.nom}` : `Employé ${p.employeId?.slice(0,6)}`,
          poste:       p.poste       || emp?.poste       || '',
          departement: p.departement || emp?.departement || '',
          employeEmail:p.employeEmail|| emp?.email       || '',
        };
      });

      setPointages(enrichis);
      setLastUpdate(new Date());
    } catch (e) { console.error('Erreur chargement:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => charger(true), 30000);
    return () => clearInterval(interval);
  }, [charger]);

  // ── Filtres appliqués ─────────────────────
  const filtres = pointages.filter(p => {
    const dateStr    = getDateStr(p);
    const nomLower   = (p.employeNom || '').toLowerCase();
    const retard     = estRetard(p.heureArrivee);
    const hSupp      = p.dureeMinutes ? heuresSupp(p.dureeMinutes) : 0;

    if (search         && !nomLower.includes(search.toLowerCase()) &&
                          !(p.poste || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDate     && dateStr !== filterDate) return false;
    if (filterMois     && dateStr.substring(0, 7) !== filterMois) return false;
    if (filterEmployeId&& p.employeId !== filterEmployeId) return false;
    if (filterDept !== 'Tous' && p.departement !== filterDept) return false;
    if (filterStatut !== 'ALL' && p.statut !== filterStatut) return false;
    if (filterType === 'RETARD'  && !retard)                 return false;
    if (filterType === 'SUPP'    && hSupp <= 0)              return false;
    if (filterType === 'WEEKEND' && !estWeekend(dateStr))    return false;
    if (filterType === 'FERIE'   && !estFerie(dateStr))      return false;
    return true;
  }).sort((a, b) => new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime());

  // ── Stats ─────────────────────────────────
  const termines     = filtres.filter(p => p.statut === 'TERMINE');
  const enCours      = filtres.filter(p => p.statut === 'EN_COURS');
  const totalMins    = termines.reduce((s, p) => s + (p.dureeMinutes || 0), 0);
  const avgMins      = termines.length > 0 ? Math.round(totalMins / termines.length) : 0;
  const nbRetards    = filtres.filter(p => estRetard(p.heureArrivee)).length;
  const totalHSupp   = termines.reduce((s, p) => s + (p.dureeMinutes ? heuresSupp(p.dureeMinutes) : 0), 0);
  const employesActifs = new Set(enCours.map(p => p.employeId)).size;

  // ── Pagination ────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(filtres.length / ITEMS_PAR_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const paginated   = filtres.slice((pageClamped - 1) * ITEMS_PAR_PAGE, pageClamped * ITEMS_PAR_PAGE);

  const resetFiltres = () => {
    setSearch(''); setFilterDate(''); setFilterMois('');
    setFilterEmployeId(''); setFilterDept('Tous');
    setFilterStatut('ALL'); setFilterType('ALL'); setPage(1);
  };

  // ── Export CSV ────────────────────────────
  const exportCSV = () => {
    const rows = [
      ['Employé','Email','Poste','Département','Date','Jour','Arrivée','Départ','Durée','Type','Retard','H.Supp','Statut'],
      ...filtres.map(p => {
        const ds   = getDateStr(p);
        const type = getTypeJour(ds);
        const ret  = estRetard(p.heureArrivee);
        const hs   = p.dureeMinutes ? heuresSupp(p.dureeMinutes).toFixed(2) : '0';
        return [
          p.employeNom || '',
          p.employeEmail || '',
          p.poste || '',
          p.departement || '',
          ds,
          new Date(ds + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }),
          formatHeure(p.heureArrivee),
          p.heureDepart ? formatHeure(p.heureDepart) : '—',
          p.dureeMinutes ? formatDuree(p.dureeMinutes) : '—',
          type.label,
          ret ? `+${minutesRetard(p.heureArrivee)}min` : 'Non',
          hs + 'h',
          p.statut,
        ];
      }),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pointages-tous-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout searchPlaceholder="Search employees...">
      <div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#1a1a1a] tracking-tight">Time Tracking</h1>
            <p className="text-[#6b7280] mt-1">
              Vue complète des présences de{' '}
              <span className="font-bold text-[#1a1a1a]">{employes.length}</span> employé{employes.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Dernier refresh */}
            <div className="flex items-center gap-2 text-xs text-[#9ca3af] bg-white border border-[#e5e0d8] px-3 py-2 rounded-xl">
              <span className={`w-2 h-2 rounded-full ${refreshing ? 'bg-amber-400 animate-pulse' : 'bg-[#2d6a4f]'}`} />
              {refreshing ? 'Actualisation...' : `Mis à jour ${lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            </div>
            <button onClick={() => charger(true)} disabled={refreshing}
              className="p-2.5 border border-[#e5e0d8] bg-white rounded-xl hover:bg-[#f5f0e8] transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 text-[#6b7280] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] shadow-sm transition-colors">
              <Download className="w-4 h-4" />Export CSV
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Users}
            label="Employés présents"
            value={loading ? '...' : employesActifs}
            sub={`${enCours.length} pointage${enCours.length > 1 ? 's' : ''} en cours`}
            iconBg="bg-[#dbeafe]" iconColor="text-[#3b82f6]"
          />
          <StatCard
            icon={CheckCircle}
            label="Journées terminées"
            value={loading ? '...' : termines.length}
            sub={`Total: ${formatDuree(totalMins)}`}
          />
          <StatCard
            icon={AlertTriangle}
            label="Retards"
            value={loading ? '...' : nbRetards}
            sub={`Durée moy: ${avgMins > 0 ? formatDuree(avgMins) : '—'}`}
            iconBg="bg-amber-50" iconColor="text-amber-600"
          />
          <StatCard
            icon={Timer}
            label="Heures supp. totales"
            value={loading ? '...' : `${totalHSupp.toFixed(1)}h`}
            sub={`sur ${filtres.length} pointage${filtres.length > 1 ? 's' : ''}`}
            iconBg="bg-purple-50" iconColor="text-purple-600"
          />
        </div>

        {/* ── Barre de progression temps réel ── */}
        {!loading && employes.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e5e0d8] p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-[#1a1a1a]">Présence aujourd'hui</span>
              <span className="text-xs text-[#9ca3af]">
                {employesActifs} / {employes.length} employés actifs
              </span>
            </div>
            <div className="flex gap-1">
              {employes.map(emp => {
                const ptAujourdhui = pointages.filter(p => {
                  const ds = getDateStr(p);
                  const today = new Date().toISOString().split('T')[0];
                  return p.employeId === emp.id && ds === today;
                });
                const present  = ptAujourdhui.some(p => p.statut === 'EN_COURS');
                const termine  = ptAujourdhui.some(p => p.statut === 'TERMINE');
                return (
                  <div
                    key={emp.id}
                    title={`${emp.prenom} ${emp.nom} — ${present ? 'Présent' : termine ? 'Terminé' : 'Absent'}`}
                    className={`flex-1 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold text-white transition-all cursor-default ${
                      present ? 'bg-[#2d6a4f]' : termine ? 'bg-blue-500' : 'bg-[#e5e0d8]'
                    }`}
                    style={{ minWidth: '32px' }}
                  >
                    {getInitials(`${emp.prenom} ${emp.nom}`)}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-[#9ca3af]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#2d6a4f]" />En cours</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500" />Terminé</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#e5e0d8]" />Absent</span>
            </div>
          </div>
        )}

        {/* ── Filtres ── */}
        <div className="bg-white rounded-xl border border-[#e5e0d8] p-4 mb-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[#374151] uppercase tracking-wider">Filtres</span>
            <button onClick={resetFiltres}
              className="text-xs font-bold text-[#2d6a4f] hover:underline">
              Réinitialiser
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
              <input type="text" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Nom, poste..."
                className="pl-9 pr-4 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-[#f8f6f2] focus:outline-none focus:border-[#2d6a4f] w-44 transition-colors" />
            </div>

            {/* Employé */}
            <select value={filterEmployeId}
              onChange={e => { setFilterEmployeId(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-[#f8f6f2] focus:outline-none focus:border-[#2d6a4f]">
              <option value="">Tous les employés</option>
              {employes.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}</option>
              ))}
            </select>

            {/* Département */}
            <select value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-[#f8f6f2] focus:outline-none focus:border-[#2d6a4f]">
              {DEPTS.map(d => <option key={d}>{d}</option>)}
            </select>

            {/* Date */}
            <input type="date" value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setFilterMois(''); setPage(1); }}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-[#f8f6f2] focus:outline-none focus:border-[#2d6a4f] text-[#374151]" />

            {/* Mois */}
            <input type="month" value={filterMois}
              onChange={e => { setFilterMois(e.target.value); setFilterDate(''); setPage(1); }}
              className="px-3 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-[#f8f6f2] focus:outline-none focus:border-[#2d6a4f] text-[#374151]" />

            {/* Boutons statut */}
            <div className="flex gap-1 bg-[#f5f0e8] rounded-xl p-1">
              {(['ALL','EN_COURS','TERMINE'] as const).map(s => (
                <button key={s} onClick={() => { setFilterStatut(s); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterStatut === s ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'
                  }`}>
                  {s === 'ALL' ? 'Tous' : s === 'EN_COURS' ? 'En cours' : 'Terminés'}
                </button>
              ))}
            </div>

            {/* Boutons type */}
            <div className="flex gap-1 bg-[#f5f0e8] rounded-xl p-1">
              {([
                { key: 'ALL',     label: 'Tous' },
                { key: 'RETARD',  label: '⚠️ Retards' },
                { key: 'SUPP',    label: '🕐 H.Supp' },
                { key: 'WEEKEND', label: '📅 Weekend' },
                { key: 'FERIE',   label: '🎉 Fériés' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => { setFilterType(key); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filterType === key ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#6b7280]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <h3 className="font-black text-lg text-[#1a1a1a]">
              Historique complet
            </h3>
            <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2.5 py-1 rounded-full">
              {filtres.length} entrée{filtres.length > 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Employé','Date','Type jour','Arrivée','Départ','Durée','Retard','H.Supp','Statut'].map(h => (
                  <th key={h}
                    className={`text-left ${h === 'Employé' ? 'px-6' : 'px-3'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest whitespace-nowrap`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(ITEMS_PAR_PAGE)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-3 py-4">
                        <div className="h-3 bg-[#f0ebe0] rounded w-16 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="text-5xl mb-4">🕐</div>
                    <p className="text-base font-bold text-[#1a1a1a] mb-1">Aucun pointage trouvé</p>
                    <p className="text-sm text-[#6b7280] mb-3">Essayez de modifier les filtres</p>
                    <button onClick={resetFiltres}
                      className="text-sm font-bold text-[#2d6a4f] hover:underline">
                      Réinitialiser les filtres →
                    </button>
                  </td>
                </tr>
              ) : (
                paginated.map((p, idx) => {
                  const dateStr = getDateStr(p);
                  const type    = getTypeJour(dateStr);
                  const retard  = estRetard(p.heureArrivee);
                  const minRet  = minutesRetard(p.heureArrivee);
                  const hSupp   = p.dureeMinutes ? heuresSupp(p.dureeMinutes) : 0;
                  const color   = avatarColor(p.employeNom || 'A');

                  return (
                      <tr key={`${p.employeId}-${p.date}`}
                      className={`border-b border-[#f0ebe0] last:border-0 transition-colors hover:bg-[#faf5ee] ${
                        idx % 2 === 1 ? 'bg-[#fafaf8]' : ''
                      }`}>

                      {/* Employé */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {getInitials(p.employeNom || 'XX')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[#1a1a1a] truncate max-w-32.5">
                              {p.employeNom}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-[#9ca3af]">
                              {p.poste && (
                                <span className="flex items-center gap-0.5">
                                  <Briefcase className="w-2.5 h-2.5" />
                                  {p.poste}
                                </span>
                              )}
                              {p.departement && (
                                <span>· {p.departement}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="text-sm font-bold text-[#1a1a1a]">
                          {new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'short', day: 'numeric', month: 'short',
                          })}
                        </div>
                        <div className="text-[10px] text-[#9ca3af]">{dateStr.substring(0, 4)}</div>
                      </td>

                      {/* Type jour */}
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${type.bg} ${type.color}`}>
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            En cours
                          </span>
                        )}
                      </td>

                      {/* Durée */}
                      <td className="px-3 py-3.5">
                        {p.dureeMinutes ? (
                          <span className={`text-sm font-bold ${
                            p.dureeMinutes >= 480 ? 'text-[#2d6a4f]' : 'text-amber-600'
                          }`}>
                            {formatDuree(p.dureeMinutes)}
                          </span>
                        ) : <span className="text-[#9ca3af] text-sm">—</span>}
                      </td>

                      {/* Retard */}
                      <td className="px-3 py-3.5">
                        {retard ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              +{minRet}min
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2d6a4f] bg-[#d8f3dc] px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-2.5 h-2.5" />
                            OK
                          </span>
                        )}
                      </td>

                      {/* Heures supp */}
                      <td className="px-3 py-3.5">
                        {hSupp > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            <Timer className="w-2.5 h-2.5" />
                            +{hSupp.toFixed(1)}h
                          </span>
                        ) : <span className="text-[#9ca3af] text-xs">—</span>}
                      </td>

                      {/* Statut */}
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

          {/* Footer + Pagination */}
          {!loading && filtres.length > 0 && (
            <div className="px-6 py-4 border-t border-[#f0ebe0] bg-[#faf9f7] flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-[#6b7280]">
                <strong className="text-[#1a1a1a]">{filtres.length}</strong> pointage{filtres.length > 1 ? 's' : ''} ·{' '}
                Total: <strong className="text-[#1a1a1a]">{formatDuree(totalMins)}</strong> ·{' '}
                <strong className="text-[#2d6a4f]">{termines.length}</strong> terminé{termines.length > 1 ? 's' : ''} ·{' '}
                <strong className="text-blue-600">{enCours.length}</strong> en cours ·{' '}
                <strong className="text-amber-600">{nbRetards}</strong> retard{nbRetards > 1 ? 's' : ''}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={pageClamped === 1}
                    className="px-2 py-1.5 text-xs font-bold border border-[#e5e0d8] rounded-lg hover:bg-[#f0ebe0] disabled:opacity-30">«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageClamped === 1}
                    className="p-1.5 rounded-lg border border-[#e5e0d8] hover:bg-[#f0ebe0] disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5 text-[#6b7280]" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = Math.max(1, Math.min(totalPages - 4, pageClamped - 2)) + i;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`w-8 h-8 text-xs font-bold rounded-lg border transition-colors ${
                          pageClamped === pg
                            ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                            : 'border-[#e5e0d8] text-[#6b7280] hover:bg-[#f0ebe0]'
                        }`}>{pg}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageClamped === totalPages}
                    className="p-1.5 rounded-lg border border-[#e5e0d8] hover:bg-[#f0ebe0] disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5 text-[#6b7280]" />
                  </button>
                  <button onClick={() => setPage(totalPages)} disabled={pageClamped === totalPages}
                    className="px-2 py-1.5 text-xs font-bold border border-[#e5e0d8] rounded-lg hover:bg-[#f0ebe0] disabled:opacity-30">»</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Légende */}
        <div className="mt-4 flex items-center gap-5 flex-wrap">
          <span className="text-xs text-[#9ca3af] font-medium">Légende :</span>
          {[
            { dot: 'bg-[#2d6a4f]',  label: 'Jour ouvrable'            },
            { dot: 'bg-purple-500', label: 'Weekend (×1.75)'          },
            { dot: 'bg-red-500',    label: 'Jour férié (×2.0)'        },
            { dot: 'bg-amber-500',  label: 'Retard (tolérance 15min)' },
            { dot: 'bg-purple-400', label: 'Heures supp (×1.5)'       },
          ].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              <span className={`w-2 h-2 rounded-full ${dot}`} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}