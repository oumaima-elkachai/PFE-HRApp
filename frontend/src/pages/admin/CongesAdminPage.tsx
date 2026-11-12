// src/pages/admin/CongesAdminPage.tsx
//
// Traitement des demandes de congés. La RH approuve ou refuse ; le
// solde du salarié se recalcule côté serveur à chaque décision.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2, XCircle, Clock, Search, SlidersHorizontal,
  MessageSquare, X, ChevronRight, CalendarDays, Hourglass,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { congesService, type Conge, type DecisionConge } from '../../services/conges';
import { LIBELLES_STATUT_CONGE, LIBELLES_TYPE_CONGE, libelle } from '../../types/domaine';
import type { StatutConge } from '../../types/domaine';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 3;

// Le style reste ici ; le vocabulaire métier vit dans types/domaine.ts.
const STYLE_STATUT: Record<StatutConge, {
  bg: string; text: string; dot: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  EN_ATTENTE: { bg: 'bg-amber-50',     text: 'text-amber-600', dot: 'bg-amber-400', icon: Hourglass },
  APPROUVE:   { bg: 'bg-brand-500/10', text: 'text-brand-texte', dot: 'bg-brand-500', icon: CheckCircle2 },
  REFUSE:     { bg: 'bg-red-50',       text: 'text-red-500',   dot: 'bg-red-400',   icon: XCircle },
};

// Un statut inattendu venu du serveur ne doit jamais faire tomber la page
const STYLE_DEFAUT = { bg: 'bg-stone-50', text: 'text-stone-500', dot: 'bg-stone-400', icon: Clock };

const styleStatut = (s: string) => STYLE_STATUT[s as StatutConge] ?? STYLE_DEFAUT;

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const jourCourt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });


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
    <div
      className={`bg-surface rounded-2xl shadow-sm border p-5 ${
        alerte ? 'border-amber-200 ring-1 ring-amber-100' : 'border-stone-100'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-60">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-70">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Modale de traitement ───────────────────────────────────────────
function ModalTraitement({ conge, onClose, onSuccess }: {
  conge: Conge;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [statut, setStatut] = useState<DecisionConge>('APPROUVE');
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const approuve = statut === 'APPROUVE';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Un refus sans explication laisse le salarié sans recours :
    // le commentaire est exigé dans ce cas seulement.
    if (!approuve && !commentaire.trim()) {
      setErreur('Expliquez le motif du refus');
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      await congesService.traiter(conge.id, statut, commentaire);
      onSuccess(
        approuve
          ? `Congé de ${conge.employeNom} approuvé, solde mis à jour`
          : `Demande de ${conge.employeNom} refusée, salarié informé`
      );
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur ?? 'Erreur lors du traitement');
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: couleurDe(conge.employeNom) }}
            >
              {initiales(conge.employeNom)}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-stone-800 truncate">
                {conge.employeNom}
              </h2>
              <p className="text-sm text-brand-texte font-semibold">
                {libelle(LIBELLES_TYPE_CONGE, conge.type)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {erreur}
            </div>
          )}

          <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-brand-texte" />
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Demande
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface rounded-lg p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Période
                </div>
                <div className="text-sm font-medium text-stone-800">
                  {jourCourt(conge.dateDebut)} → {jourCourt(conge.dateFin)}
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Durée
                </div>
                <div className="text-sm font-bold text-brand-texte">
                  {conge.nbJours} jour{conge.nbJours > 1 ? 's' : ''} ouvrable{conge.nbJours > 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {conge.motif && (
              <div className="bg-surface rounded-lg p-3 mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Motif invoqué
                </div>
                <p className="text-sm text-stone-700">{conge.motif}</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">Décision</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatut('APPROUVE')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${
                  approuve
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-surface text-stone-500 border-stone-200 hover:border-brand-500'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Approuver
              </button>
              <button
                type="button"
                onClick={() => setStatut('REFUSE')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${
                  !approuve
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-surface text-stone-500 border-stone-200 hover:border-red-300'
                }`}
              >
                <XCircle className="w-4 h-4" />
                Refuser
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Commentaire {approuve ? '(optionnel)' : '(requis)'}
            </label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder={approuve
                ? 'Ajouter une précision…'
                : 'Expliquer le motif du refus au salarié…'}
              className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 resize-none transition-colors"
            />
            {approuve && (
              <p className="text-xs text-stone-400 mt-1.5">
                {conge.nbJours} jour{conge.nbJours > 1 ? 's' : ''} seront déduits du solde.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi}
              className={`flex-1 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
                approuve ? 'bg-brand-500 hover:bg-brand-600' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {envoi && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {envoi ? 'Traitement…' : approuve ? "Confirmer l'approbation" : 'Confirmer le refus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
type FiltreStatut = StatutConge | 'tous';

export default function CongesAdminPage() {
  const [conges, setConges] = useState<Conge[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous');
  const [filtreType, setFiltreType] = useState('tous');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);
  const [congeATraiter, setCongeATraiter] = useState<Conge | null>(null);
  const [toast, setToast] = useState('');

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

  const charger = async () => {
    try {
      setChargement(true);
      const res = await congesService.lister();
      setConges(res?.data?.conges ?? []);
    } catch (e) {
      console.error('Chargement des congés :', e);
      setConges([]);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return conges
      .filter((c) => {
        if (terme && !c.employeNom.toLowerCase().includes(terme)) return false;
        if (filtreStatut !== 'tous' && c.statut !== filtreStatut) return false;
        if (filtreType !== 'tous' && c.type !== filtreType) return false;
        return true;
      })
      // Les demandes en attente remontent : ce sont les seules qui
      // appellent une action.
      .sort((a, b) => {
        const aAttente = a.statut === 'EN_ATTENTE' ? 0 : 1;
        const bAttente = b.statut === 'EN_ATTENTE' ? 0 : 1;
        if (aAttente !== bAttente) return aAttente - bAttente;
        return String(b.demandeLe).localeCompare(String(a.demandeLe));
      });
  }, [conges, recherche, filtreStatut, filtreType]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  useEffect(() => { setPage(0); }, [recherche, filtreStatut, filtreType]);

  const parStatut = (s: StatutConge) => conges.filter((c) => c.statut === s).length;

  const joursAccordes = conges
    .filter((c) => c.statut === 'APPROUVE')
    .reduce((s, c) => s + (c.nbJours ?? 0), 0);

  const nbFiltres = (filtreStatut !== 'tous' ? 1 : 0) + (filtreType !== 'tous' ? 1 : 0);

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
              <span className="text-brand-texte font-semibold">Congés</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Congés</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} demande{filtres.length > 1 ? 's' : ''} sur {conges.length}
                  {parStatut('EN_ATTENTE') > 0 && (
                    <span className="text-amber-600 font-semibold">
                      {' · '}{parStatut('EN_ATTENTE')} en attente
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom du salarié…"
                className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm focus:outline-none focus:border-brand-500"
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
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border shadow-sm transition-colors ${
                  menuOuvert || nbFiltres > 0
                  
                    ? 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                    : 'bg-brand-500 text-white border-brand-500'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtrer
                {nbFiltres > 0 && (
                  <span className="bg-brand-500 text-white text-[10px] font-bold px-1.5 rounded-full">
                    {nbFiltres}
                  </span>
                )}
              </button>

              {menuOuvert && (
                <div className="absolute end-0 top-full mt-2 w-72 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
                      Filtres
                    </span>
                    {nbFiltres > 0 && (
                      <button
                        onClick={() => { setFiltreStatut('tous'); setFiltreType('tous'); }}
                        className="text-xs font-medium text-stone-500 hover:text-stone-700"
                      >
                        Tout effacer
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Statut
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ['tous', 'Tous'],
                        ['EN_ATTENTE', 'En attente'],
                        ['APPROUVE', 'Approuvés'],
                        ['REFUSE', 'Refusés'],
                      ] as [FiltreStatut, string][]).map(([cle, label]) => (
                        <button
                          key={cle}
                          onClick={() => setFiltreStatut(cle)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors"
                          style={{
                            backgroundColor: filtreStatut === cle ? ACCENT : 'white',
                            color: filtreStatut === cle ? 'white' : '#656C86',
                            borderColor: filtreStatut === cle ? ACCENT : '#DFE3F0',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Type de congé
                    </label>
                    <select
                      value={filtreType}
                      onChange={(e) => setFiltreType(e.target.value)}
                      className={champ}
                    >
                      <option value="tous">Tous les types</option>
                      {Object.entries(LIBELLES_TYPE_CONGE).map(([cle, label]) => (
                        <option key={cle} value={cle}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Hourglass}
              label="En attente"
              value={chargement ? '…' : parStatut('EN_ATTENTE')}
              sub={parStatut('EN_ATTENTE') > 0 ? 'action requise' : 'rien à traiter'}
              fond="bg-amber-50"
              texte="text-amber-600"
              alerte={parStatut('EN_ATTENTE') > 0}
            />
            <StatCard
              icon={CheckCircle2}
              label="Approuvés"
              value={chargement ? '…' : parStatut('APPROUVE')}
              sub={`${joursAccordes} jour${joursAccordes > 1 ? 's' : ''} accordé${joursAccordes > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={XCircle}
              label="Refusés"
              value={chargement ? '…' : parStatut('REFUSE')}
              sub="demandes non retenues"
              fond="bg-red-50"
              texte="text-red-500"
            />
            <StatCard
              icon={CalendarDays}
              label="Total des demandes"
              value={chargement ? '…' : conges.length}
              sub="depuis le début"
              fond="bg-purple-50"
              texte="text-purple-600"
            />
          </div>

          {/* Les demandes en attente bloquent le salarié, qui ne peut
              pas s'organiser tant qu'il n'a pas de réponse. */}
          {!chargement && parStatut('EN_ATTENTE') > 0 && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-6 text-sm bg-amber-50 text-amber-700">
              <Hourglass className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {parStatut('EN_ATTENTE')} demande{parStatut('EN_ATTENTE') > 1 ? 's' : ''} en
                attente de décision. Les salariés concernés ne peuvent pas s'organiser
                tant qu'ils n'ont pas de réponse.
              </span>
            </div>
          )}

          {/* ── Tableau ── */}
          {chargement ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-40" />
                      <div className="h-3 bg-stone-100 rounded w-56" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtres.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {recherche ? `Aucun résultat pour « ${recherche} »` : 'Aucune demande'}
              </p>
              <p className="text-xs text-stone-500">
                {nbFiltres > 0 ? 'Aucune demande ne correspond aux filtres' : 'Rien à traiter pour le moment'}
              </p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[24%]">
                      Salarié
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Type
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[18%]">
                      Période
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[16%]">
                      Motif
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Statut
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Décision
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageCourante.map((conge) => {
                    const style = styleStatut(conge.statut);
                    const StatutIcon = style.icon;
                    const attente = conge.statut === 'EN_ATTENTE';

                    return (
                      <tr
                        key={conge.id}
                        className={`border-b border-stone-100 last:border-0 transition-colors ${
                          attente ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: couleurDe(conge.employeNom) }}
                            >
                              {initiales(conge.employeNom)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-stone-800 truncate">
                                {conge.employeNom}
                              </div>
                              <div className="text-[10px] text-stone-400">
                                Demandé le {new Date(conge.demandeLe).toLocaleDateString('fr-FR')}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-sm text-stone-700 truncate block">
                            {libelle(LIBELLES_TYPE_CONGE, conge.type)}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-sm font-medium text-stone-800 truncate">
                            {jourCourt(conge.dateDebut)} → {jourCourt(conge.dateFin)}
                          </div>
                          <div className="text-[10px] font-bold text-brand-texte">
                            {conge.nbJours} jour{conge.nbJours > 1 ? 's' : ''}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-xs text-stone-500 line-clamp-2">
                            {conge.motif || '—'}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${style.bg} ${style.text}`}>
                            <StatutIcon className="w-3 h-3 shrink-0" />
                            {libelle(LIBELLES_STATUT_CONGE, conge.statut)}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          {attente ? (
                            <button
                              onClick={() => setCongeATraiter(conge)}
                              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
                            >
                              Traiter
                            </button>
                          ) : (
                            <div className="text-[10px] text-stone-400">
                              {conge.traitePar && (
                                <div className="truncate">Par {conge.traitePar}</div>
                              )}
                              {conge.commentaireRH && (
                                <div className="flex items-start gap-1 mt-0.5">
                                  <MessageSquare className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                                  <span className="line-clamp-2">{conge.commentaireRH}</span>
                                </div>
                              )}
                            </div>
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
                libelle="demande"
                accent={ACCENT}
              />
            </div>
          )}
        </div>

        {congeATraiter && (
          <ModalTraitement
            conge={congeATraiter}
            onClose={() => setCongeATraiter(null)}
            onSuccess={(message) => { setToast(message); charger(); }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

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