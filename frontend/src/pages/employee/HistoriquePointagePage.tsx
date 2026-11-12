// src/pages/employee/HistoriquePointagePage.tsx
//
// Historique des pointages du salarié. L'écran répond à une question :
// mon mois est-il conforme, et si non, où est l'écart ?

import { useState, useEffect, useMemo } from 'react';
import {
  Clock, CheckCircle2, AlertTriangle, Download, Calendar, Timer,
  ChevronRight, X, Navigation, MapPin, QrCode,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { pointagesService } from '../../services/pointages';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 10;

// ── Règles horaires ────────────────────────────────────────────────
// Une seule source pour l'heure d'arrivée et la tolérance : les avoir
// séparées faisait afficher « +16 min » à quelqu'un arrivé une minute
// après la limite.
const HEURE_ARRIVEE_MIN = 8 * 60 + 30;   // 08h30
const TOLERANCE_MIN = 15;                // le retard court à partir de 08h45
const DUREE_JOURNEE_MIN = 8 * 60;        // au-delà, heures supplémentaires

const JOURS_FERIES = [
  '2026-01-01', '2026-03-20', '2026-04-09', '2026-05-01',
  '2026-07-25', '2026-08-13', '2026-10-15',
];

const MOIS_NOMS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

interface Pointage {
  employeId: string;
  date: string;
  heureArrivee: string;
  heureDepart?: string;
  dureeMinutes?: number;
  statut: 'EN_COURS' | 'TERMINE';
  employeNom?: string;

  // Trace de présence, écrite par le serveur au pointage
  latitude?: number | null;
  longitude?: number | null;
  siteNom?: string | null;
  distanceMetres?: number | null;
  qrScanne?: boolean;
  presenceValidee?: boolean;
  aVerifier?: boolean;
  motifVerification?: string | null;
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

function formatDuree(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 h 00';
  return `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

const estWeekend = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00`).getDay());
const estFerie = (d: string) => JOURS_FERIES.includes(d);

/** Minutes de retard au-delà de la tolérance ; zéro si dans les temps */
function minutesRetard(heureArrivee: string): number {
  const d = new Date(heureArrivee);
  const arrivee = d.getHours() * 60 + d.getMinutes();
  return Math.max(0, arrivee - HEURE_ARRIVEE_MIN - TOLERANCE_MIN);
}

const estRetard = (h: string) => minutesRetard(h) > 0;

const heuresSupp = (dureeMinutes: number) =>
  Math.max(0, (dureeMinutes - DUREE_JOURNEE_MIN) / 60);

const TYPE_JOUR: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  ferie:    { label: 'Férié',    bg: 'bg-red-50',       text: 'text-red-500',    dot: 'bg-red-400' },
  weekend:  { label: 'Weekend',  bg: 'bg-purple-50',    text: 'text-purple-600', dot: 'bg-purple-400' },
  ouvrable: { label: 'Ouvrable', bg: 'bg-brand-500/10', text: 'text-brand-texte',  dot: 'bg-brand-500' },
};

function typeJour(d: string) {
  if (estFerie(d)) return TYPE_JOUR.ferie;
  if (estWeekend(d)) return TYPE_JOUR.weekend;
  return TYPE_JOUR.ouvrable;
}

/** Jours ouvrables du mois, fériés déduits */
function joursOuvrables(mois: number, annee: number): number {
  const dernier = new Date(annee, mois, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');

  let n = 0;
  for (let j = 1; j <= dernier; j += 1) {
    const d = new Date(annee, mois - 1, j);
    const cle = `${annee}-${pad(mois)}-${pad(j)}`;
    if (d.getDay() !== 0 && d.getDay() !== 6 && !JOURS_FERIES.includes(cle)) n += 1;
  }
  return n;
}

// ── Composants partagés ────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, fond, texte, alerte }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  fond: string;
  texte: string;
  alerte?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-2xl shadow-sm border p-5 ${
      alerte ? 'border-amber-200 ring-1 ring-amber-100' : 'border-stone-100'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Détail d'un pointage ───────────────────────────────────────────
// La position relevée au pointage n'a de sens que si le salarié peut
// la consulter : c'est elle qui justifiera un signalement.
function ModalDetail({ pointage, onClose }: {
  pointage: Pointage;
  onClose: () => void;
}) {
  const d = dateDe(pointage);
  const type = typeJour(d);
  const retard = minutesRetard(pointage.heureArrivee);
  const supp = heuresSupp(pointage.dureeMinutes ?? 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800 capitalize">
              {new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </h2>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${type.bg} ${type.text}`}>
              <span className={`w-1 h-1 rounded-full ${type.dot}`} />
              {type.label}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">

          <div className="grid grid-cols-3 gap-3">
            {([
              ['Arrivée', formatHeure(pointage.heureArrivee), retard > 0 ? 'text-amber-600' : 'text-stone-800'],
              ['Départ', pointage.heureDepart ? formatHeure(pointage.heureDepart) : '—', 'text-stone-800'],
              ['Durée', pointage.dureeMinutes ? formatDuree(pointage.dureeMinutes) : '—', 'text-brand-texte'],
            ] as [string, string, string][]).map(([label, valeur, couleur]) => (
              <div key={label} className="bg-stone-50 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  {label}
                </div>
                <div className={`text-sm font-bold ${couleur}`}>{valeur}</div>
              </div>
            ))}
          </div>

          {(retard > 0 || supp > 0) && (
            <div className="space-y-2">
              {retard > 0 && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs bg-amber-50 text-amber-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {retard} minute{retard > 1 ? 's' : ''} de retard au-delà de la
                  tolérance de {TOLERANCE_MIN} min
                </div>
              )}
              {supp > 0 && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs bg-purple-50 text-purple-600">
                  <Timer className="w-4 h-4 shrink-0" />
                  {supp.toFixed(1)} heure{supp > 1 ? 's' : ''} supplémentaire{supp > 1 ? 's' : ''},
                  majorée{supp > 1 ? 's' : ''} de 50 %
                </div>
              )}
            </div>
          )}

          {/* Trace de présence, si le pointage en porte une */}
          {pointage.latitude != null && (
            <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Navigation className="w-4 h-4 text-brand-texte" />
                <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Lieu du pointage
                </span>
              </div>

              <div className="bg-surface rounded-lg p-3 space-y-2">
                {pointage.siteNom && (
                  <div className="flex items-center gap-2 text-xs">
                    <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                    <span className="font-medium text-stone-800">{pointage.siteNom}</span>
                    {pointage.distanceMetres != null && (
                      <span className="text-stone-400 ms-auto">
                        à {pointage.distanceMetres} m
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs">
                  <QrCode className="w-3 h-3 text-stone-400 shrink-0" />
                  <span className="text-stone-500">
                    {pointage.qrScanne ? 'QR du site scanné' : 'Sans scan de QR'}
                  </span>
                </div>

                <div className="text-[10px] text-stone-400 font-mono pt-1 border-t border-stone-100">
                  {pointage.latitude.toFixed(5)}, {pointage.longitude?.toFixed(5)}
                </div>
              </div>

              {pointage.aVerifier && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] bg-amber-50 text-amber-700 mt-3">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {pointage.motifVerification ?? 'Position à vérifier par la RH'}
                </div>
              )}
            </div>
          )}

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

// ── Page ───────────────────────────────────────────────────────────
type FiltreStatut = 'tous' | 'TERMINE' | 'EN_COURS';

export default function HistoriquePointagePage() {
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const maintenant = new Date();
  const [mois, setMois] = useState(maintenant.getMonth() + 1);
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Pointage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setChargement(true);
        setErreur('');
        const res = await pointagesService.historique() as any;
        setPointages(res?.data?.pointages ?? res?.pointages ?? []);
      } catch (e: any) {
        console.error('Chargement des pointages :', e);
        setErreur(e?.erreur ?? 'Impossible de charger vos pointages');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  useEffect(() => { setPage(0); }, [mois, annee, filtreStatut]);

  const filtres = useMemo(
    () => pointages
      .filter((p) => {
        const d = new Date(p.heureArrivee || p.date || '');
        if (d.getMonth() + 1 !== mois || d.getFullYear() !== annee) return false;
        if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
        return true;
      })
      .sort((a, b) => new Date(b.heureArrivee).getTime() - new Date(a.heureArrivee).getTime()),
    [pointages, mois, annee, filtreStatut]
  );

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  // ── Indicateurs ──
  const termines = filtres.filter((p) => p.statut === 'TERMINE');
  const totalMin = termines.reduce((s, p) => s + (p.dureeMinutes ?? 0), 0);
  const moyenneMin = termines.length ? Math.round(totalMin / termines.length) : 0;
  const retards = filtres.filter((p) => estRetard(p.heureArrivee)).length;
  const totalSupp = termines.reduce((s, p) => s + heuresSupp(p.dureeMinutes ?? 0), 0);

  const nbOuvrables = joursOuvrables(mois, annee);
  const absences = Math.max(0, nbOuvrables - termines.length);
  const tauxPresence = nbOuvrables > 0
    ? Math.round((termines.length / nbOuvrables) * 100)
    : 0;

  // Les pointages signalés : le salarié doit les voir avant que la RH
  // ne les lui oppose.
  const aVerifier = filtres.filter((p) => p.aVerifier).length;

  const exporterCsv = () => {
    const lignes = [
      ['Date', 'Jour', 'Type', 'Arrivée', 'Départ', 'Durée',
       'Retard', 'Heures supp.', 'Statut', 'Lieu', 'À vérifier'],
      ...filtres.map((p) => {
        const d = dateDe(p);
        return [
          d,
          new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long' }),
          typeJour(d).label,
          formatHeure(p.heureArrivee),
          p.heureDepart ? formatHeure(p.heureDepart) : '—',
          p.dureeMinutes ? formatDuree(p.dureeMinutes) : '—',
          minutesRetard(p.heureArrivee) > 0 ? `${minutesRetard(p.heureArrivee)} min` : 'Non',
          `${heuresSupp(p.dureeMinutes ?? 0).toFixed(2)} h`,
          p.statut === 'TERMINE' ? 'Terminé' : 'En cours',
          p.siteNom ?? '',
          p.aVerifier ? 'Oui' : 'Non',
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
    a.download = `pointages-${annee}-${String(mois).padStart(2, '0')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const champ =
    'px-3 py-2 text-sm bg-surface border border-stone-200 rounded-xl shadow-sm focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout>

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Mon temps</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Historique de pointage</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Historique de pointage</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} pointage{filtres.length > 1 ? 's' : ''} en{' '}
                  {MOIS_NOMS[mois]} {annee}
                  {aVerifier > 0 && (
                    <span className="text-amber-600 font-semibold">
                      {' · '}{aVerifier} à vérifier
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className={champ}
            >
              {MOIS_NOMS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>

            <select
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className={champ}
            >
              {[annee - 1, annee, annee + 1].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <button
              onClick={exporterCsv}
              disabled={filtres.length === 0}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Exporter
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-sm bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            <StatCard
              icon={CheckCircle2}
              label="Journées complètes"
              value={chargement ? '…' : termines.length}
              sub={`sur ${nbOuvrables} jour${nbOuvrables > 1 ? 's' : ''} ouvrable${nbOuvrables > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={Clock}
              label="Total travaillé"
              value={chargement ? '…' : formatDuree(totalMin)}
              sub={`${formatDuree(moyenneMin)} par jour en moyenne`}
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={AlertTriangle}
              label="Retards"
              value={chargement ? '…' : retards}
              sub={`${absences} absence${absences > 1 ? 's' : ''}`}
              fond="bg-amber-50"
              texte="text-amber-600"
              alerte={retards > 0}
            />
            <StatCard
              icon={Timer}
              label="Heures supplémentaires"
              value={chargement ? '…' : `${totalSupp.toFixed(1)} h`}
              sub="majorées de 50 %"
              fond="bg-purple-50"
              texte="text-purple-600"
            />
          </div>

          {/* ── Taux de présence ── */}
          {!chargement && (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800">
                  Taux de présence — {MOIS_NOMS[mois]} {annee}
                </span>
                <span className={`text-sm font-bold ${
                  tauxPresence >= 90 ? 'text-brand-texte' : 'text-amber-600'
                }`}>
                  {tauxPresence} %
                </span>
              </div>

              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    tauxPresence >= 90 ? 'bg-brand-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${tauxPresence}%` }}
                />
              </div>

              <div className="flex justify-between mt-2 text-[10px] text-stone-400">
                <span>{termines.length} journée{termines.length > 1 ? 's' : ''} complète{termines.length > 1 ? 's' : ''}</span>
                <span>{absences} absence{absences > 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          {/* ── Onglets de statut ── */}
          <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1 shadow-sm w-fit mb-5">
            {([
              ['tous', 'Tous', filtres.length],
              ['TERMINE', 'Terminés', termines.length],
              ['EN_COURS', 'En cours', filtres.filter((p) => p.statut === 'EN_COURS').length],
            ] as [FiltreStatut, string, number][]).map(([cle, label, nb]) => (
              <button
                key={cle}
                onClick={() => setFiltreStatut(cle)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  filtreStatut === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                {label}
                <span className={`text-[10px] px-1.5 rounded-full ${
                  filtreStatut === cle ? 'bg-surface/25' : 'bg-stone-100'
                }`}>
                  {chargement ? '…' : nb}
                </span>
              </button>
            ))}
          </div>

          {/* ── Tableau ── */}
          {chargement ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="h-4 bg-stone-100 rounded w-40 mb-2" />
                  <div className="h-3 bg-stone-100 rounded w-56" />
                </div>
              ))}
            </div>
          ) : filtres.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">Aucun pointage</p>
              <p className="text-xs text-stone-500">
                {filtreStatut !== 'tous'
                  ? 'Aucun pointage dans cette catégorie'
                  : `Rien d'enregistré en ${MOIS_NOMS[mois]} ${annee}`}
              </p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[18%]">
                      Date
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Type
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Arrivée
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Départ
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Durée
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[16%]">
                      Lieu
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
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
                        key={`${p.employeId}-${p.date}`}
                        onClick={() => setDetail(p)}
                        className={`border-b border-stone-100 last:border-0 cursor-pointer transition-colors ${
                          p.aVerifier ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="text-sm font-bold text-stone-800">
                            {new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
                              weekday: 'short', day: 'numeric', month: 'short',
                            })}
                          </div>
                          <div className="text-[10px] text-stone-400">{annee}</div>
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${type.bg} ${type.text}`}>
                            <span className={`w-1 h-1 rounded-full ${type.dot}`} />
                            {type.label}
                          </span>
                        </td>

                        {/* Le retard accompagne l'arrivée : c'est la
                            même information lue autrement. */}
                        <td className="px-3 py-3">
                          <div className={`text-sm font-bold ${
                            retard > 0 ? 'text-amber-600' : 'text-stone-800'
                          }`}>
                            {formatHeure(p.heureArrivee)}
                          </div>
                          <div className={`text-[10px] ${
                            retard > 0 ? 'text-amber-600 font-bold' : 'text-brand-texte'
                          }`}>
                            {retard > 0 ? `+${retard} min` : "à l'heure"}
                          </div>
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

                        <td className="px-3 py-3">
                          {p.dureeMinutes ? (
                            <>
                              <div className={`text-sm font-bold ${
                                p.dureeMinutes >= DUREE_JOURNEE_MIN
                                  ? 'text-brand-texte' : 'text-amber-600'
                              }`}>
                                {formatDuree(p.dureeMinutes)}
                              </div>
                              {supp > 0 && (
                                <div className="text-[10px] font-bold text-purple-600">
                                  +{supp.toFixed(1)} h supp.
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-stone-300 text-sm">—</span>
                          )}
                        </td>

                        {/* Le lieu relevé au pointage : ce que la RH
                            verra, le salarié doit le voir aussi. */}
                        <td className="px-3 py-3">
                          {p.siteNom ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="text-xs text-stone-600 truncate">
                                {p.siteNom}
                              </span>
                            </div>
                          ) : p.latitude != null ? (
                            <span className="text-[10px] text-stone-400">
                              Position relevée
                            </span>
                          ) : (
                            <span className="text-stone-300 text-xs">—</span>
                          )}

                          {p.aVerifier && (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              À vérifier
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {p.statut === 'TERMINE' ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-texte bg-brand-500/10 px-3 py-1.5 rounded-full whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                              Terminé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              En cours
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtres.length}
                onPage={setPage}
                libelle="pointage"
                accent={ACCENT}
              />
            </div>
          )}

          {/* ── Règles appliquées ── */}
          {/* Un retard ou une heure supplémentaire se retrouvent sur le
              bulletin : la règle doit être connue avant, pas après. */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-brand-texte" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Règles appliquées
              </h4>
            </div>

            <div className="grid grid-cols-3 gap-x-10 gap-y-3">
              {([
                ['Jour ouvrable', 'taux normal'],
                ['Weekend', '+75 %'],
                ['Jour férié', '+100 %'],
                ['Arrivée attendue', '8 h 30'],
                ['Tolérance de retard', `${TOLERANCE_MIN} min`],
                ['Heures supplémentaires', `au-delà de ${DUREE_JOURNEE_MIN / 60} h, +50 %`],
              ] as [string, string][]).map(([label, valeur]) => (
                <div
                  key={label}
                  className="grid grid-cols-[1fr_auto] gap-3 items-baseline border-b border-stone-50 pb-2"
                >
                  <span className="text-xs text-stone-500">{label}</span>
                  <span className="text-xs font-bold text-stone-700 tabular-nums">{valeur}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {detail && <ModalDetail pointage={detail} onClose={() => setDetail(null)} />}

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