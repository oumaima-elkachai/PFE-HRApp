// src/pages/admin/NotesFraisAdminPage.tsx
//
// Traitement des notes de frais. Un remboursement n'est pas une
// rémunération : il s'ajoute au net du bulletin sans entrer dans
// l'assiette des cotisations.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Receipt, Check, X, Eye,  CheckCircle2, XCircle, Wallet,
  AlertCircle, Search, Car, UtensilsCrossed, BedDouble, Package,
  GraduationCap, MoreHorizontal, Download, ChevronRight,
  SlidersHorizontal, Hourglass, AlertTriangle, FileWarning,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import api from '../../services/api';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 10;

type Statut = 'SOUMISE' | 'APPROUVEE' | 'REFUSEE' | 'REMBOURSEE';

interface Note {
  id: string;
  employeId: string;
  employeNom: string;
  employeEmail: string;
  departement?: string | null;
  categorie: string;
  categorieLibelle: string;
  montant: number;
  montantAccorde?: number;
  dateDepense: string;
  description: string;
  justificatifKey?: string | null;
  justificatifNom?: string | null;
  depassePlafond: boolean;
  plafondCategorie: number | null;
  statut: Statut;
  commentaireRH?: string;
  traitePar?: string;
  periodeRemboursement?: string;
  creeLe: string;
}

const ICONES: Record<string, any> = {
  TRANSPORT: Car,
  REPAS: UtensilsCrossed,
  HEBERGEMENT: BedDouble,
  FOURNITURES: Package,
  FORMATION: GraduationCap,
  AUTRE: MoreHorizontal,
};

// Style uniquement : les libellés métier viennent du serveur.
const STYLE_STATUT: Record<Statut, {
  libelle: string; bg: string; text: string; dot: string; icone: any;
}> = {
  SOUMISE:    { libelle: 'À traiter',  bg: 'bg-amber-50',     text: 'text-amber-600', dot: 'bg-amber-400', icone: Hourglass },
  APPROUVEE:  { libelle: 'Approuvée',  bg: 'bg-blue-50',      text: 'text-blue-600',  dot: 'bg-blue-400',  icone: CheckCircle2 },
  REMBOURSEE: { libelle: 'Remboursée', bg: 'bg-brand-500/10', text: 'text-brand-texte', dot: 'bg-brand-500', icone: Wallet },
  REFUSEE:    { libelle: 'Refusée',    bg: 'bg-red-50',       text: 'text-red-500',   dot: 'bg-red-400',   icone: XCircle },
};

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const tnd = (v: number) => `${v.toFixed(3)} TND`;

const jourCourt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ── Lecture du justificatif ────────────────────────────────────────
async function voirJustificatif(note: Note) {
  const blob = await api.get(`/frais/notes/${note.id}/justificatif`, {
    responseType: 'blob',
  }) as unknown as Blob;

  // Une réponse JSON signale une erreur, pas un fichier
  if (blob.type.includes('json')) {
    const texte = await blob.text();
    throw new Error(JSON.parse(texte)?.erreur ?? 'Justificatif indisponible');
  }

  const url = URL.createObjectURL(blob);

  // window.open avec noopener refuse une URL blob: sur certains
  // navigateurs. Passer par un lien contourne cette restriction.
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
function ModalTraitement({ note, decision, onClose, onSuccess }: {
  note: Note;
  decision: 'APPROUVEE' | 'REFUSEE';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const approbation = decision === 'APPROUVEE';

  // Un dépassement de plafond se ramène au montant autorisé plutôt
  // que d'être refusé en bloc : c'est plus juste pour le salarié.
  const montantSuggere = note.depassePlafond && note.plafondCategorie
    ? note.plafondCategorie
    : note.montant;

  const [montantAccorde, setMontantAccorde] = useState(String(montantSuggere));
  const [commentaire, setCommentaire] = useState(
    note.depassePlafond && note.plafondCategorie
      ? `Remboursement plafonné à ${note.plafondCategorie} TND pour cette catégorie.`
      : ''
  );
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const somme = Number(montantAccorde) || 0;
  const partiel = approbation && somme < note.montant;

  const valider = async () => {
    if (!approbation && !commentaire.trim()) {
      setErreur('Indiquez le motif du refus : il sera transmis au salarié.');
      return;
    }
    if (approbation && somme <= 0) {
      setErreur('Le montant accordé doit être positif.');
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      await api.put(`/frais/notes/${note.id}`, {
        statut: decision,
        commentaire: commentaire.trim(),
        montantAccorde: approbation ? somme : 0,
      });
      onSuccess(
        approbation
          ? `${note.employeNom} : ${tnd(somme)} approuvés`
          : `Note de ${note.employeNom} refusée`
      );
      onClose();
    } catch (e: any) {
      setErreur(e?.erreur ?? 'Impossible de traiter la note');
      setEnvoi(false);
    }
  };

  const Icone = ICONES[note.categorie] ?? Receipt;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                approbation ? 'bg-brand-500/10' : 'bg-red-50'
              }`}
            >
              <Icone className={`w-5 h-5 ${approbation ? 'text-brand-texte' : 'text-red-500'}`} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-stone-800">
                {approbation ? 'Approuver la dépense' : 'Refuser la dépense'}
              </h2>
              <p className="text-sm text-stone-500 truncate">
                {note.employeNom} · {note.categorieLibelle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          <div className="bg-linear-to-r from-stone-50 to-brand-500/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                Dépense déclarée
              </span>
              <span className="text-xl font-bold text-stone-800">{tnd(note.montant)}</span>
            </div>

            <div className="bg-surface rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Date</span>
                <span className="font-medium text-stone-800">
                  {new Date(note.dateDepense).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
              {note.departement && (
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Département</span>
                  <span className="font-medium text-stone-800">{note.departement}</span>
                </div>
              )}
              {note.description && (
                <p className="text-xs text-stone-600 italic pt-1.5 border-t border-stone-100">
                  {note.description}
                </p>
              )}
            </div>

            {note.justificatifKey ? (
              <button
                onClick={() => voirJustificatif(note).catch((e) => setErreur(e.message))}
                className="flex items-center gap-1.5 text-xs font-bold mt-3 text-brand-texte hover:underline"
              >
                <Eye className="w-3.5 h-3.5" />
                Consulter le justificatif
              </button>
            ) : (
              // Sans justificatif, la dépense n'est pas opposable à
              // l'administration fiscale : il faut que la RH le voie.
              <div className="flex items-center gap-1.5 text-xs mt-3 text-amber-600">
                <FileWarning className="w-3.5 h-3.5" />
                Aucun justificatif fourni
              </div>
            )}
          </div>

          {note.depassePlafond && note.plafondCategorie && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Le plafond de la catégorie est de {note.plafondCategorie} TND. Vous pouvez
              rembourser partiellement.
            </div>
          )}

          {approbation && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Montant accordé (TND)
              </label>
              <input
                type="number"
                min="0"
                max={note.montant}
                step="0.001"
                value={montantAccorde}
                onChange={(e) => setMontantAccorde(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors"
              />
              {partiel && (
                <p className="text-xs mt-1.5 text-amber-600">
                  Remboursement partiel : {tnd(note.montant - somme)} resteront à la charge
                  du salarié. Expliquez-le dans le commentaire.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              {approbation ? 'Commentaire (optionnel)' : 'Motif du refus (requis)'}
            </label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder={approbation
                ? 'Visible par le salarié'
                : 'Expliquez pourquoi la dépense ne peut pas être remboursée'}
              className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl resize-none focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {approbation && (
            <p className="text-xs text-stone-400">
              Le montant s'ajoutera au net du prochain bulletin, sans cotisations
              ni impôt.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={valider}
              disabled={envoi}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2 transition-colors ${
                approbation ? 'bg-brand-500 hover:bg-brand-600' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : approbation ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {envoi ? 'Traitement…' : approbation ? 'Approuver' : 'Refuser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function NotesFraisAdminPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [onglet, setOnglet] = useState<Statut>('SOUMISE');
  const [recherche, setRecherche] = useState('');
  const [filtreCategorie, setFiltreCategorie] = useState('tous');
  const [sansJustificatif, setSansJustificatif] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState('');
  const [traitement, setTraitement] = useState<{
    note: Note; decision: 'APPROUVEE' | 'REFUSEE';
  } | null>(null);

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

  const charger = async (statut: Statut) => {
    try {
      setChargement(true);
      const res = await api.get('/frais/notes', { params: { statut } }) as any;
      setNotes(res?.data?.notes ?? []);
      setTotal(res?.data?.total ?? 0);
    } catch (e) {
      console.error('Chargement des notes de frais :', e);
      setNotes([]);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(onglet); }, [onglet]);
  useEffect(() => { setPage(0); }, [onglet, recherche, filtreCategorie, sansJustificatif]);

  const categories = useMemo(() => {
    const liste = new Map<string, string>();
    for (const n of notes) liste.set(n.categorie, n.categorieLibelle);
    return [...liste.entries()];
  }, [notes]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return notes.filter((n) => {
      if (filtreCategorie !== 'tous' && n.categorie !== filtreCategorie) return false;
      if (sansJustificatif && n.justificatifKey) return false;
      if (!terme) return true;
      return `${n.employeNom} ${n.employeEmail} ${n.categorieLibelle} ${n.departement ?? ''}`
        .toLowerCase().includes(terme);
    });
  }, [notes, recherche, filtreCategorie, sansJustificatif]);

  const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

  // Deux signaux que la RH doit voir avant de traiter en série.
  const nbSansJustificatif = notes.filter((n) => !n.justificatifKey).length;
  const nbHorsPlafond = notes.filter((n) => n.depassePlafond).length;

  const montantFiltre = filtrees.reduce(
    (s, n) => s + (n.montantAccorde ?? n.montant), 0
  );

  const nbFiltres = (filtreCategorie !== 'tous' ? 1 : 0) + (sansJustificatif ? 1 : 0);

  const exporter = () => {
    // La RH prépare souvent un récapitulatif pour la comptabilité :
    // l'export évite une ressaisie manuelle.
    const lignes = [
      ['Salarié', 'Département', 'Catégorie', 'Date', 'Montant', 'Accordé', 'Statut', 'Période'].join(';'),
      ...filtrees.map((n) => [
        n.employeNom, n.departement ?? '', n.categorieLibelle,
        new Date(n.dateDepense).toLocaleDateString('fr-FR'),
        n.montant.toFixed(3),
        (n.montantAccorde ?? n.montant).toFixed(3),
        n.statut,
        n.periodeRemboursement ?? '',
      ].join(';')),
    ];

    const blob = new Blob(['\ufeff' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-de-frais-${onglet.toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const ONGLETS: [Statut, string][] = [
    ['SOUMISE', 'À traiter'],
    ['APPROUVEE', 'À rembourser'],
    ['REMBOURSEE', 'Remboursées'],
    ['REFUSEE', 'Refusées'],
  ];

  const champ =
    'w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher une note…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Administration</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Notes de frais</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Notes de frais</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtrees.length} note{filtrees.length > 1 ? 's' : ''}
                  {' · '}{tnd(montantFiltre)}
                  {nbSansJustificatif > 0 && onglet === 'SOUMISE' && (
                    <span className="text-amber-600 font-semibold">
                      {' · '}{nbSansJustificatif} sans justificatif
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Salarié, catégorie…"
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
                <div className="absolute end-0 top-full mt-2 w-72 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
                      Filtres
                    </span>
                    {nbFiltres > 0 && (
                      <button
                        onClick={() => { setFiltreCategorie('tous'); setSansJustificatif(false); }}
                        className="text-xs font-medium text-stone-500 hover:text-stone-700"
                      >
                        Tout effacer
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Catégorie
                    </label>
                    <select
                      value={filtreCategorie}
                      onChange={(e) => setFiltreCategorie(e.target.value)}
                      className={champ}
                    >
                      <option value="tous">Toutes les catégories</option>
                      {categories.map(([cle, lib]) => (
                        <option key={cle} value={cle}>{lib}</option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer bg-stone-50 rounded-xl p-3">
                    <input
                      type="checkbox"
                      checked={sansJustificatif}
                      onChange={(e) => setSansJustificatif(e.target.checked)}
                      className="mt-0.5 accent-brand-texte"
                    />
                    <span>
                      <span className="text-sm font-medium text-stone-800">
                        Sans justificatif
                      </span>
                      <span className="block text-xs text-stone-400 mt-0.5">
                        Non opposables à l'administration fiscale
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            {filtrees.length > 0 && (
              <button
                onClick={exporter}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
                title="Exporter pour la comptabilité"
              >
                <Download className="w-4 h-4" />
                Exporter
              </button>
            )}
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={STYLE_STATUT[onglet].icone}
              label={STYLE_STATUT[onglet].libelle}
              value={chargement ? '…' : notes.length}
              sub={`note${notes.length > 1 ? 's' : ''} dans cet état`}
              fond={onglet === 'SOUMISE' ? 'bg-amber-50'
                : onglet === 'APPROUVEE' ? 'bg-blue-50'
                : onglet === 'REMBOURSEE' ? 'bg-brand-500/10' : 'bg-red-50'}
              texte={onglet === 'SOUMISE' ? 'text-amber-600'
                : onglet === 'APPROUVEE' ? 'text-blue-600'
                : onglet === 'REMBOURSEE' ? 'text-brand-texte' : 'text-red-500'}
              alerte={onglet === 'SOUMISE' && notes.length > 0}
            />
            <StatCard
              icon={Wallet}
              label="Montant total"
              value={chargement ? '…' : tnd(total)}
              sub={onglet === 'SOUMISE' ? 'en attente de validation'
                : onglet === 'APPROUVEE' ? 'à verser sur les bulletins'
                : onglet === 'REMBOURSEE' ? 'déjà versés' : 'non remboursés'}
              fond="bg-purple-50"
              texte="text-purple-600"
            />
            <StatCard
              icon={FileWarning}
              label="Sans justificatif"
              value={chargement ? '…' : nbSansJustificatif}
              sub="à réclamer au salarié"
              fond="bg-red-50"
              texte="text-red-500"
            />
            <StatCard
              icon={AlertTriangle}
              label="Au-delà du plafond"
              value={chargement ? '…' : nbHorsPlafond}
              sub="remboursement partiel possible"
              fond="bg-amber-50"
              texte="text-amber-600"
            />
          </div>

          {/* ── Onglets ── */}
          <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1 shadow-sm w-fit mb-6">
            {ONGLETS.map(([cle, libelle]) => (
              <button
                key={cle}
                onClick={() => setOnglet(cle)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  onglet === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>

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
          ) : filtrees.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {onglet === 'SOUMISE' ? 'Rien à traiter' : 'Aucune note'}
              </p>
              <p className="text-xs text-stone-500">
                {recherche ? `Aucun résultat pour « ${recherche} »`
                  : nbFiltres > 0 ? 'Aucune note ne correspond aux filtres'
                  : onglet === 'SOUMISE' ? 'Toutes les demandes ont été traitées'
                  : 'Aucune note dans cette catégorie'}
              </p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[22%]">
                      Salarié
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[20%]">
                      Dépense
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[11%]">
                      Date
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[14%]">
                      Montant
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[13%]">
                      Statut
                    </th>
                    <th className="text-end px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[20%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageCourante.map((n) => {
                    const Icone = ICONES[n.categorie] ?? Receipt;
                    const style = STYLE_STATUT[n.statut];
                    const StatutIcone = style.icone;
                    const partiel = n.montantAccorde != null && n.montantAccorde < n.montant;
                    const aSignaler = !n.justificatifKey || n.depassePlafond;

                    return (
                      <tr
                        key={n.id}
                        className={`border-b border-stone-100 last:border-0 transition-colors ${
                          aSignaler && n.statut === 'SOUMISE'
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: couleurDe(n.employeNom) }}
                            >
                              {initiales(n.employeNom)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-stone-800 truncate">
                                {n.employeNom}
                              </div>
                              <div className="text-[10px] text-stone-400 truncate">
                                {n.departement ?? n.employeEmail}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icone className="w-3.5 h-3.5 text-brand-texte shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-stone-800 truncate">
                                {n.categorieLibelle}
                              </div>
                              {n.description && (
                                <div className="text-[10px] text-stone-400 truncate">
                                  {n.description}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Les deux signaux qui doivent arrêter l'œil
                              avant une validation en série. */}
                          <div className="flex items-center gap-1.5 mt-1">
                            {!n.justificatifKey && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                                <FileWarning className="w-2.5 h-2.5" />
                                Sans justificatif
                              </span>
                            )}
                            {n.depassePlafond && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Hors plafond
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-sm text-stone-700">
                            {jourCourt(n.dateDepense)}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            déclarée {jourCourt(n.creeLe)}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-sm font-bold text-stone-800">
                            {tnd(partiel ? n.montantAccorde! : n.montant)}
                          </div>
                          {partiel && (
                            <div className="text-[10px] line-through text-stone-400">
                              {tnd(n.montant)}
                            </div>
                          )}
                          {n.periodeRemboursement && (
                            <div className="text-[10px] text-brand-texte">
                              bulletin {n.periodeRemboursement}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${style.bg} ${style.text}`}>
                            <StatutIcone className="w-3 h-3 shrink-0" />
                            {style.libelle}
                          </span>
                          {n.commentaireRH && (
                            <div className="text-[10px] text-stone-400 mt-1 line-clamp-2">
                              {n.commentaireRH}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {n.justificatifKey && (
                              <button
                                onClick={() => voirJustificatif(n).catch((e) => setToast(e.message))}
                                className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                                title="Voir le justificatif"
                              >
                                <Eye className="w-4 h-4 text-stone-400" />
                              </button>
                            )}

                            {n.statut === 'SOUMISE' && (
                              <>
                                <button
                                  onClick={() => setTraitement({ note: n, decision: 'REFUSEE' })}
                                  className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                                  title="Refuser"
                                >
                                  <X className="w-4 h-4 text-stone-400 hover:text-red-500" />
                                </button>
                                <button
                                  onClick={() => setTraitement({ note: n, decision: 'APPROUVEE' })}
                                  className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Approuver
                                </button>
                              </>
                            )}

                            {n.statut !== 'SOUMISE' && n.traitePar && (
                              <span className="text-[10px] text-stone-400 truncate max-w-23">
                                par {n.traitePar}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtrees.length}
                onPage={setPage}
                libelle="note"
                accent={ACCENT}
              />
            </div>
          )}

          {/* ── Plafonds en vigueur ── */}
          {/* Les afficher évite que la RH cherche la règle ailleurs au
              moment de trancher sur un dépassement. */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-brand-texte" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Plafonds par catégorie
              </h4>
            </div>

            <div className="grid grid-cols-3 gap-x-10 gap-y-3">
              {([
                ['Transport', '500 TND', Car],
                ['Repas', '50 TND', UtensilsCrossed],
                ['Hébergement', '300 TND', BedDouble],
                ['Fournitures', '200 TND', Package],
                ['Formation', '2 000 TND', GraduationCap],
                ['Autre', 'sans plafond', MoreHorizontal],
              ] as [string, string, any][]).map(([label, valeur, Icone]) => (
                <div
                  key={label}
                  className="grid grid-cols-[auto_1fr_auto] gap-2 items-center border-b border-stone-50 pb-2"
                >
                  <Icone className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs text-stone-500">{label}</span>
                  <span className="text-xs font-bold text-stone-700 tabular-nums">{valeur}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-stone-400 mt-3">
              Un dépassement n'empêche pas la déclaration : la RH peut rembourser
              partiellement. Les montants accordés s'ajoutent au net du bulletin, hors
              assiette de cotisations.
            </p>
          </div>
        </div>

        {traitement && (
          <ModalTraitement
            note={traitement.note}
            decision={traitement.decision}
            onClose={() => setTraitement(null)}
            onSuccess={(msg) => { setToast(msg); charger(onglet); }}
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