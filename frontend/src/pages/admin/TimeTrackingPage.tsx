// src/pages/admin/TimeTrackingPage.tsx
//
// Suivi des pointages de l'ensemble du personnel. Cet écran porte sur
// des événements horodatés, pas sur les dossiers salariés : ceux-ci
// ont leur propre page.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clock, CheckCircle2, AlertTriangle, Download, Search, Users,
  Timer, RefreshCw, ChevronRight, X, SlidersHorizontal,
  ChevronLeft,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { pointagesService } from '../../services/pointages';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 10;
const PAR_PAGE_PRESENCE = 10;

// ── Règles horaires ────────────────────────────────────────────────
// Une seule source pour l'heure d'arrivée théorique et la tolérance :
// les avoir en trois endroits faisait compter « +16 min » de retard à
// quelqu'un arrivé une minute après la limite.
const HEURE_ARRIVEE_MIN = 8 * 60 + 30;   // 08h30
const TOLERANCE_MIN = 15;                // le retard court à partir de 08h45
const DUREE_JOURNEE_MIN = 8 * 60;        // au-delà, heures supplémentaires

const JOURS_FERIES = [
  '2026-01-01', '2026-03-20', '2026-04-09', '2026-05-01',
  '2026-07-25', '2026-08-13', '2026-10-15',
];

const DEPARTEMENTS = ['Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];

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

// ── Aides ──────────────────────────────────────────────────────────
const dateDe = (p: Pointage) => (p.date || p.heureArrivee || '').split('T')[0];

function formatHeure(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatDuree(min: number): string {
  if (!min || min <= 0) return '0 h 00';
  return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
}

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const estWeekend = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00`).getDay());
const estFerie = (d: string) => JOURS_FERIES.includes(d);

/** Minutes de retard au-delà de la tolérance ; zéro si dans les temps */
function minutesRetard(heureArrivee: string): number {
  const d = new Date(heureArrivee);
  const arrivee = d.getHours() * 60 + d.getMinutes();
  return Math.max(0, arrivee - HEURE_ARRIVEE_MIN - TOLERANCE_MIN);
}

const estRetard = (heureArrivee: string) => minutesRetard(heureArrivee) > 0;

const heuresSupp = (dureeMinutes: number) =>
  Math.max(0, (dureeMinutes - DUREE_JOURNEE_MIN) / 60);

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const TYPE_JOUR: Record<string, { label: string; bg: string; text: string }> = {
  ferie:    { label: 'Férié',    bg: 'bg-red-50',       text: 'text-red-500' },
  weekend:  { label: 'Weekend',  bg: 'bg-purple-50',    text: 'text-purple-600' },
  ouvrable: { label: 'Ouvrable', bg: 'bg-brand-500/10', text: 'text-brand-texte' },
};

function typeJour(d: string) {
  if (estFerie(d)) return TYPE_JOUR.ferie;
  if (estWeekend(d)) return TYPE_JOUR.weekend;
  return TYPE_JOUR.ouvrable;
}

// ── Composants partagés ────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, fond, texte }: {
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

// ── Page ───────────────────────────────────────────────────────────
type FiltreStatut = 'tous' | 'EN_COURS' | 'TERMINE';
type FiltreType = 'tous' | 'RETARD' | 'SUPP' | 'WEEKEND' | 'FERIE';
type FiltrePresence = 'tous' | 'present' | 'termine' | 'absent';

export default function TimeTrackingPage() {
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);
  const [derniereMaj, setDerniereMaj] = useState<Date>(new Date());

  const [recherche, setRecherche] = useState('');
  const [filtreDate, setFiltreDate] = useState('');
  const [filtreMois, setFiltreMois] = useState('');
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [filtreDept, setFiltreDept] = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous');
  const [filtreType, setFiltreType] = useState<FiltreType>('tous');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);

  const [filtrePresence, setFiltrePresence] = useState<FiltrePresence>('tous');
  const [pagePresence, setPagePresence] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);

  // Un clic hors du menu le referme : sans cela, il resterait ouvert
  // et masquerait le tableau qu'il sert à filtrer.
  useEffect(() => {
    if (!menuOuvert) return;
    const auClic = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOuvert(false);
      }
    };
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [menuOuvert]);

  const charger = useCallback(async (silencieux = false) => {
    try {
      if (silencieux) setActualisation(true);
      else setChargement(true);

      const [ptRes, empRes] = await Promise.all([
        pointagesService.historique() as any,
        employesService.lister() as any,
      ]);

      const emps: Employe[] = empRes?.data?.employes ?? [];
      setEmployes(emps);

      // Le pointage ne porte que l'identifiant : le nom et le poste
      // viennent de la fiche, jointe ici plutôt que dupliquée en base.
      const data: Pointage[] = ptRes?.data?.pointages ?? [];
      setPointages(data.map((p) => {
        const emp = emps.find((e) => e.id === p.employeId);
        return {
          ...p,
          employeNom: (p.employeNom && p.employeNom !== 'undefined undefined')
            ? p.employeNom
            : emp ? `${emp.prenom} ${emp.nom}` : `Salarié ${p.employeId?.slice(0, 6)}`,
          poste: p.poste || emp?.poste || '',
          departement: p.departement || emp?.departement || '',
          employeEmail: p.employeEmail || emp?.email || '',
        };
      }));

      setDerniereMaj(new Date());
    } catch (e) {
      console.error('Chargement des pointages :', e);
    } finally {
      setChargement(false);
      setActualisation(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Un pointage en cours change d'état sans action de la RH :
  // l'écran se rafraîchit de lui-même.
  useEffect(() => {
    const intervalle = setInterval(() => charger(true), 30_000);
    return () => clearInterval(intervalle);
  }, [charger]);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return pointages
      .filter((p) => {
        const d = dateDe(p);

        if (terme && !`${p.employeNom} ${p.poste ?? ''}`.toLowerCase().includes(terme)) return false;
        if (filtreDate && d !== filtreDate) return false;
        if (filtreMois && d.slice(0, 7) !== filtreMois) return false;
        if (filtreEmploye && p.employeId !== filtreEmploye) return false;
        if (filtreDept !== 'tous' && p.departement !== filtreDept) return false;
        if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;

        if (filtreType === 'RETARD' && !estRetard(p.heureArrivee)) return false;
        if (filtreType === 'SUPP' && heuresSupp(p.dureeMinutes ?? 0) <= 0) return false;
        if (filtreType === 'WEEKEND' && !estWeekend(d)) return false;
        if (filtreType === 'FERIE' && !estFerie(d)) return false;

        return true;
      })
      .sort((a, b) => new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime());
  }, [pointages, recherche, filtreDate, filtreMois, filtreEmploye, filtreDept, filtreStatut, filtreType]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  useEffect(() => { setPage(0); }, [
    recherche, filtreDate, filtreMois, filtreEmploye, filtreDept, filtreStatut, filtreType,
  ]);

  // ── Indicateurs ──
  const termines = filtres.filter((p) => p.statut === 'TERMINE');
  const totalMin = termines.reduce((s, p) => s + (p.dureeMinutes ?? 0), 0);
  const moyenneMin = termines.length ? Math.round(totalMin / termines.length) : 0;
  const nbRetards = filtres.filter((p) => estRetard(p.heureArrivee)).length;
  const totalSupp = termines.reduce((s, p) => s + heuresSupp(p.dureeMinutes ?? 0), 0);

  // Le compteur sur le bouton annonce combien de critères sont posés :
  // sans lui, un filtre oublié ferait croire à une liste vide.
  const nbFiltres = [
    filtreDate, filtreMois, filtreEmploye,
    filtreDept !== 'tous' ? filtreDept : '',
    filtreStatut !== 'tous' ? filtreStatut : '',
    filtreType !== 'tous' ? filtreType : '',
  ].filter(Boolean).length;

  const reinitialiser = () => {
    setFiltreDate(''); setFiltreMois(''); setFiltreEmploye('');
    setFiltreDept('tous'); setFiltreStatut('tous'); setFiltreType('tous');
  };

  const exporterCsv = () => {
    const lignes = [
      ['Salarié', 'Email', 'Poste', 'Département', 'Date', 'Jour', 'Arrivée',
       'Départ', 'Durée', 'Type de jour', 'Retard', 'Heures supp.', 'Statut'],
      ...filtres.map((p) => {
        const d = dateDe(p);
        return [
          p.employeNom ?? '',
          p.employeEmail ?? '',
          p.poste ?? '',
          p.departement ?? '',
          d,
          new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' }),
          formatHeure(p.heureArrivee),
          p.heureDepart ? formatHeure(p.heureDepart) : '—',
          p.dureeMinutes ? formatDuree(p.dureeMinutes) : '—',
          typeJour(d).label,
          estRetard(p.heureArrivee) ? `+${minutesRetard(p.heureArrivee)} min` : 'Non',
          `${heuresSupp(p.dureeMinutes ?? 0).toFixed(2)} h`,
          p.statut === 'TERMINE' ? 'Terminé' : 'En cours',
        ];
      }),
    ];

    // Le BOM force Excel à lire le fichier en UTF-8 : sans lui, les
    // accents sont illisibles sous Windows.
    const csv = lignes.map((l) => l.join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pointages-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const aujourdhui = new Date().toISOString().split('T')[0];

  // ── Présence du jour ──
  // Triée : les présents d'abord, puis ceux qui ont terminé, puis les
  // absents. La RH cherche d'abord qui est là.
  const presenceComplete = useMemo(() => {
    return employes
      .map((emp) => {
        const duJour = pointages.filter(
          (p) => p.employeId === emp.id && dateDe(p) === aujourdhui
        );
        const present = duJour.some((p) => p.statut === 'EN_COURS');
        const termine = !present && duJour.some((p) => p.statut === 'TERMINE');
        const arrivee = duJour[0]?.heureArrivee;

        return {
          emp,
          etat: present ? 'present' : termine ? 'termine' : 'absent',
          arrivee,
          retard: arrivee ? minutesRetard(arrivee) : 0,
          rang: present ? 0 : termine ? 1 : 2,
        };
      })
      .sort((a, b) => a.rang - b.rang
        || String(a.emp.nom).localeCompare(String(b.emp.nom), 'fr'));
  }, [employes, pointages, aujourdhui]);

  const compteEtat = (etat: string) =>
    presenceComplete.filter((p) => p.etat === etat).length;

  const presenceFiltree = useMemo(
    () => filtrePresence === 'tous'
      ? presenceComplete
      : presenceComplete.filter((p) => p.etat === filtrePresence),
    [presenceComplete, filtrePresence]
  );

  const presencePage = useMemo(
    () => presenceFiltree.slice(
      pagePresence * PAR_PAGE_PRESENCE,
      (pagePresence + 1) * PAR_PAGE_PRESENCE
    ),
    [presenceFiltree, pagePresence]
  );

  const nbPagesPresence = Math.max(1, Math.ceil(presenceFiltree.length / PAR_PAGE_PRESENCE));

  useEffect(() => { setPagePresence(0); }, [filtrePresence]);

  // Trois états, trois identités visuelles complètes : fond, bordure
  // latérale et pastille. Une seule pastille grise ne suffisait pas à
  // distinguer un absent d'un présent au premier regard.
  const STYLE_PRESENCE: Record<string, {
    carte: string; barre: string; pastille: string; texte: string; libelle: string;
  }> = {
    present: {
      carte: 'bg-brand-500/8 border-brand-500/25',
      barre: 'bg-brand-500',
      pastille: 'bg-brand-500',
      texte: 'text-brand-texte',
      libelle: 'En poste',
    },
    termine: {
      carte: 'bg-blue-50/60 border-blue-100',
      barre: 'bg-blue-400',
      pastille: 'bg-blue-400',
      texte: 'text-blue-600',
      libelle: 'Terminé',
    },
    absent: {
      carte: 'bg-surface border-stone-100',
      barre: 'bg-stone-200',
      pastille: 'bg-stone-300',
      texte: 'text-stone-400',
      libelle: 'Absent',
    },
  };

  const champ =
    'w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un salarié…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Personnel</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Temps de travail</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Temps de travail</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} pointage{filtres.length > 1 ? 's' : ''}
                  {' · '}{compteEtat('present')} salarié{compteEtat('present') > 1 ? 's' : ''} en poste
                  {nbRetards > 0 && ` · ${nbRetards} retard${nbRetards > 1 ? 's' : ''}`}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-stone-500 bg-surface border border-stone-200 px-3 py-2 rounded-xl shadow-sm">
              <span
                className={`w-2 h-2 rounded-full ${actualisation ? 'bg-amber-400 animate-pulse' : 'bg-brand-500'}`}
              />
              {actualisation
                ? 'Actualisation…'
                : `Mis à jour à ${derniereMaj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            </div>

            <button
              onClick={() => charger(true)}
              disabled={actualisation}
              className="p-2.5 border border-stone-200 bg-surface rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50 shadow-sm"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 text-stone-500 ${actualisation ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={exporterCsv}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Exporter
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatCard
              icon={Users}
              label="En poste"
              value={chargement ? '…' : compteEtat('present')}
              sub={`sur ${employes.length} salarié${employes.length > 1 ? 's' : ''}`}
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={CheckCircle2}
              label="Journées terminées"
              value={chargement ? '…' : termines.length}
              sub={`${formatDuree(totalMin)} au total`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={AlertTriangle}
              label="Retards"
              value={chargement ? '…' : nbRetards}
              sub={`durée moyenne ${moyenneMin > 0 ? formatDuree(moyenneMin) : '—'}`}
              fond="bg-amber-50"
              texte="text-amber-600"
            />
            <StatCard
              icon={Timer}
              label="Heures supplémentaires"
              value={chargement ? '…' : `${totalSupp.toFixed(1)} h`}
              sub={`sur ${filtres.length} pointage${filtres.length > 1 ? 's' : ''}`}
              fond="bg-purple-50"
              texte="text-purple-600"
            />
          </div>

          {/* ── Tableau et présence côte à côte ── */}
          {/* Même grille que les indicateurs : le tableau occupe la
              largeur de trois cartes, la présence celle d'une. */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">

            {/* Tableau */}
            <div className="xl:col-span-3 bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col">

              {/* En-tête du tableau : recherche à droite, filtres dans
                  un menu plutôt qu'étalés sur toute la largeur. */}
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100 bg-stone-50 shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                  <Clock className="w-4 h-4 text-brand-texte" />
                  <h3 className="font-bold text-stone-800">Historique</h3>
                  <span className="text-xs font-bold bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full">
                    {chargement ? '…' : filtres.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                      placeholder="Nom, poste…"
                      className="w-full ps-9 pe-8 py-2 border border-stone-200 rounded-xl text-sm bg-surface focus:outline-none focus:border-brand-500 transition-colors"
                    />
                    {recherche && (
                      <button
                        onClick={() => setRecherche('')}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                      >
                        <X className="w-3.5 h-3.5 text-stone-400" />
                      </button>
                    )}
                  </div>

                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOuvert(!menuOuvert)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                        menuOuvert || nbFiltres > 0
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      Filtrer
                      {nbFiltres > 0 && (
                        <span className="bg-surface text-brand-texte text-[10px] font-bold px-1.5 rounded-full">
                          {nbFiltres}
                        </span>
                      )}
                    </button>

                    {menuOuvert && (
                      <div className="absolute end-0 top-full mt-2 w-80 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
                            Filtres
                          </span>
                          {nbFiltres > 0 && (
                            <button
                              onClick={reinitialiser}
                              className="text-xs font-medium text-stone-500 hover:text-stone-700"
                            >
                              Tout effacer
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1.5">
                            Salarié
                          </label>
                          <select
                            value={filtreEmploye}
                            onChange={(e) => setFiltreEmploye(e.target.value)}
                            className={champ}
                          >
                            <option value="">Tous les salariés</option>
                            {employes.map((e) => (
                              <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1.5">
                            Département
                          </label>
                          <select
                            value={filtreDept}
                            onChange={(e) => setFiltreDept(e.target.value)}
                            className={champ}
                          >
                            <option value="tous">Tous les départements</option>
                            {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>

                        {/* Date et mois s'excluent : choisir l'un
                            efface l'autre. */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-stone-500 mb-1.5">
                              Jour
                            </label>
                            <input
                              type="date"
                              value={filtreDate}
                              onChange={(e) => { setFiltreDate(e.target.value); setFiltreMois(''); }}
                              className={champ}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-stone-500 mb-1.5">
                              Mois
                            </label>
                            <input
                              type="month"
                              value={filtreMois}
                              onChange={(e) => { setFiltreMois(e.target.value); setFiltreDate(''); }}
                              className={champ}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1.5">
                            Statut
                          </label>
                          <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
                            {([
                              ['tous', 'Tous'],
                              ['EN_COURS', 'En cours'],
                              ['TERMINE', 'Terminés'],
                            ] as [FiltreStatut, string][]).map(([cle, label]) => (
                              <button
                                key={cle}
                                onClick={() => setFiltreStatut(cle)}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  filtreStatut === cle
                                    ? 'bg-surface text-stone-800 shadow-sm'
                                    : 'text-stone-500'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1.5">
                            Particularité
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {([
                              ['tous', 'Tous'],
                              ['RETARD', 'Retards'],
                              ['SUPP', 'Heures supp.'],
                              ['WEEKEND', 'Weekend'],
                              ['FERIE', 'Fériés'],
                            ] as [FiltreType, string][]).map(([cle, label]) => (
                              <button
                                key={cle}
                                onClick={() => setFiltreType(cle)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                                style={{
                                  backgroundColor: filtreType === cle ? ACCENT : 'white',
                                  color: filtreType === cle ? 'white' : '#656C86',
                                  borderColor: filtreType === cle ? ACCENT : '#DFE3F0',
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {chargement ? (
                <div className="p-5 space-y-3 flex-1">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="h-3 bg-stone-100 rounded w-40" />
                      <div className="h-2.5 bg-stone-100 rounded w-56" />
                    </div>
                  ))}
                </div>
              ) : filtres.length === 0 ? (
                <div className="p-16 text-center flex-1 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mb-4">
                    <Clock className="w-6 h-6 text-stone-300" />
                  </div>
                  <p className="text-sm font-bold text-stone-800 mb-1">Aucun pointage</p>
                  <p className="text-xs text-stone-500">
                    {recherche || nbFiltres > 0
                      ? 'Aucun résultat ne correspond aux critères'
                      : 'Aucune donnée enregistrée'}
                  </p>
                  {(recherche || nbFiltres > 0) && (
                    <button
                      onClick={() => { setRecherche(''); reinitialiser(); }}
                      className="text-sm font-bold text-brand-texte hover:underline mt-3"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Sept colonnes au lieu de neuf : le retard est
                      rattaché à l'arrivée, les heures supplémentaires à
                      la durée. Un tableau qui défile latéralement
                      interdit de lire une ligne d'un coup. */}
                  <div className="flex-1">
                    <table className="w-full table-fixed">
                      <thead>
                        <tr className="border-b border-stone-200">
                                                    <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[24%]">
                            Salarié
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[15%]">
                            Date
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[11%]">
                            Type
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[13%]">
                            Arrivée
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[10%]">
                            Départ
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                            Durée
                          </th>
                          <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[15%]">
                            Statut
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageCourante.map((p) => {
                          const d = dateDe(p);
                          const type = typeJour(d);
                          const retard = minutesRetard(p.heureArrivee);
                          const supp = heuresSupp(p.dureeMinutes ?? 0);

                          return (
                            <tr
                              key={`${p.employeId}-${p.heureArrivee}`}
                              className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors"
                            >
                              {/* Barre colorée plutôt qu'un avatar : le
                                  même salarié revient sur vingt lignes,
                                  répéter ses initiales n'aide pas. */}
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className="w-1 h-8 rounded-full shrink-0"
                                    style={{ backgroundColor: couleurDe(p.employeNom ?? '') }}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-bold text-stone-800 truncate">
                                      {p.employeNom}
                                    </div>
                                    <div className="text-[10px] text-stone-400 truncate">
                                      {p.poste}
                                      {p.poste && p.departement && ' · '}
                                      {p.departement}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <div className="text-sm font-medium text-stone-800 truncate">
                                  {new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
                                    weekday: 'short', day: 'numeric', month: 'short',
                                  })}
                                </div>
                              </td>

                              <td className="px-3 py-3">
                                <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${type.bg} ${type.text}`}>
                                  {type.label}
                                </span>
                              </td>

                              {/* Le retard accompagne l'arrivée : c'est
                                  la même information lue autrement. */}
                              <td className="px-3 py-3">
                                <div className={`text-sm font-bold ${retard > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                                  {formatHeure(p.heureArrivee)}
                                </div>
                                {retard > 0 ? (
                                  <div className="text-[10px] font-bold text-amber-600">
                                    +{retard} min
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-brand-texte">à l'heure</div>
                                )}
                              </td>

                              <td className="px-3 py-3">
                                {p.heureDepart ? (
                                  <span className="text-sm text-stone-700">
                                    {formatHeure(p.heureDepart)}
                                  </span>
                                ) : (
                                  <span className="text-stone-300 text-sm">—</span>
                                )}
                              </td>

                              {/* Les heures supplémentaires accompagnent
                                  la durée, pour la même raison. */}
                              <td className="px-3 py-3">
                                {p.dureeMinutes ? (
                                  <>
                                    <div className={`text-sm font-bold ${
                                      p.dureeMinutes >= DUREE_JOURNEE_MIN ? 'text-brand-texte' : 'text-amber-600'
                                    }`}>
                                      {formatDuree(p.dureeMinutes)}
                                    </div>
                                    {supp > 0 && (
                                      <div className="text-[10px] font-bold text-purple-600">
                                        +{supp.toFixed(1)} h supp.
                                      </div>
                                    )}
                                  </>
                                ) : <span className="text-stone-300 text-sm">—</span>}
                              </td>

                                                            <td className="px-3 py-3">
                                {p.statut === 'TERMINE' ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-texte bg-brand-500/10 px-3 py-1.5 rounded-full whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                                    Terminé
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                                    En cours
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    page={page}
                    taillePage={PAR_PAGE}
                    total={filtres.length}
                    onPage={setPage}
                    libelle="pointage"
                    accent={ACCENT}
                  />
                </>
              )}
            </div>

            {/* ── Présence du jour ── */}
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col">

              <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 shrink-0">
                <h3 className="font-bold text-stone-800 text-sm">Présence du jour</h3>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {new Date().toLocaleDateString('fr-FR', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
              </div>

              {/* Trois compteurs cliquables : ils renseignent et
                  filtrent, là où une légende ne faisait qu'expliquer. */}
              <div className="grid grid-cols-3 gap-1.5 p-3 border-b border-stone-100 shrink-0">
                {([
                  ['present', compteEtat('present')],
                  ['termine', compteEtat('termine')],
                  ['absent', compteEtat('absent')],
                ] as [string, number][]).map(([etat, nb]) => {
                  const st = STYLE_PRESENCE[etat];
                  const choisi = filtrePresence === etat;
                  return (
                    <button
                      key={etat}
                      onClick={() => setFiltrePresence(choisi ? 'tous' : etat as FiltrePresence)}
                      className={`rounded-xl py-2 border transition-all ${
                        choisi ? `${st.carte} ring-1 ring-offset-1` : 'bg-stone-50 border-transparent hover:bg-stone-100'
                      }`}
                    >
                      <div className={`text-lg font-bold leading-none ${st.texte}`}>{nb}</div>
                      <div className="text-[9px] text-stone-400 mt-1">{st.libelle}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 p-2 space-y-1.5">
                {chargement ? (
                  [...Array(PAR_PAGE_PRESENCE)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2 animate-pulse">
                      <div className="w-8 h-8 bg-stone-100 rounded-xl" />
                      <div className="h-3 bg-stone-100 rounded w-24" />
                    </div>
                  ))
                ) : presencePage.length === 0 ? (
                  <p className="text-xs text-stone-400 text-center py-8">
                    {filtrePresence === 'tous' ? 'Aucun salarié' : 'Personne dans cet état'}
                  </p>
                ) : (
                  presencePage.map(({ emp, etat, arrivee, retard }) => {
                    const st = STYLE_PRESENCE[etat];
                    return (
                      <div
                        key={emp.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl border ${st.carte}`}
                      >
                        <span className={`w-1 h-8 rounded-full shrink-0 ${st.barre}`} />

                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            etat === 'absent' ? 'bg-stone-100 text-stone-400' : 'text-white'
                          }`}
                          style={etat === 'absent'
                            ? undefined
                            : { backgroundColor: couleurDe(`${emp.prenom} ${emp.nom}`) }}
                        >
                          {initiales(`${emp.prenom} ${emp.nom}`)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className={`text-xs font-bold truncate ${
                            etat === 'absent' ? 'text-stone-400' : 'text-stone-800'
                          }`}>
                            {emp.prenom} {emp.nom}
                          </div>
                          <div className={`text-[10px] truncate ${st.texte}`}>
                            {etat === 'present' && arrivee
                              ? `Arrivé à ${formatHeure(arrivee)}${retard > 0 ? ` · +${retard} min` : ''}`
                              : etat === 'termine' ? 'Journée terminée'
                              : 'Pas de pointage'}
                          </div>
                        </div>

                        <span className={`w-2 h-2 rounded-full shrink-0 ${st.pastille} ${
                          etat === 'present' ? 'animate-pulse' : ''
                        }`} />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination compacte : la colonne est trop étroite pour
                  les numéros de page du composant partagé. */}
              {!chargement && nbPagesPresence > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 bg-stone-50 shrink-0">
                  <span className="text-[10px] text-stone-500">
                    {pagePresence * PAR_PAGE_PRESENCE + 1}–
                    {Math.min(presenceFiltree.length, (pagePresence + 1) * PAR_PAGE_PRESENCE)}
                    {' sur '}{presenceFiltree.length}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPagePresence((p) => Math.max(0, p - 1))}
                      disabled={pagePresence === 0}
                      className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    </button>
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: ACCENT }}>
                      {pagePresence + 1} / {nbPagesPresence}
                    </span>
                    <button
                      onClick={() => setPagePresence((p) => Math.min(nbPagesPresence - 1, p + 1))}
                      disabled={pagePresence >= nbPagesPresence - 1}
                      className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Règles appliquées ── */}
          {/* Les majorations proviennent du moteur de paie : les
              rappeler ici évite que la RH les cherche ailleurs. */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
              Règles appliquées
            </div>
            <div className="flex items-center gap-5 flex-wrap text-xs text-stone-500">
              {([
                ['bg-brand-500', 'Jour ouvrable, taux normal'],
                ['bg-purple-400', 'Weekend, majoration de 75 %'],
                ['bg-red-400', 'Jour férié, majoration de 100 %'],
                ['bg-amber-400', `Retard au-delà de ${TOLERANCE_MIN} min après 8 h 30`],
                ['bg-purple-300', `Heures supplémentaires au-delà de ${DUREE_JOURNEE_MIN / 60} h, majorées de 50 %`],
              ] as [string, string][]).map(([couleur, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${couleur}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    </div>
  );
}