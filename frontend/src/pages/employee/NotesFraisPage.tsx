// src/pages/employee/NotesFraisPage.tsx
//
// Dépenses professionnelles du salarié : déclaration, suivi du
// remboursement. Un remboursement de frais n'est pas un élément de
// rémunération : il s'ajoute au net, hors cotisations et hors impôt.

import { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Plus, X, Upload, Trash2, Eye, Clock, CheckCircle2,
  XCircle, Wallet, AlertTriangle, Car, UtensilsCrossed, BedDouble,
  Package, GraduationCap, MoreHorizontal, ChevronRight, Search,
  FileText, 
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import api from '../../services/api';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 8;
const TAILLE_MAX = 5 * 1024 * 1024;

type Categorie = 'TRANSPORT' | 'REPAS' | 'HEBERGEMENT' | 'FOURNITURES' | 'FORMATION' | 'AUTRE';
type StatutNote = 'SOUMISE' | 'APPROUVEE' | 'REFUSEE' | 'REMBOURSEE';

interface Note {
  id: string;
  categorie: Categorie;
  categorieLibelle: string;
  montant: number;
  montantAccorde?: number;
  dateDepense: string;
  description: string;
  justificatifKey?: string | null;
  justificatifNom?: string | null;
  depassePlafond: boolean;
  plafondCategorie: number | null;
  statut: StatutNote;
  commentaireRH?: string;
  traitePar?: string;
  periodeRemboursement?: string;
  creeLe: string;
}

interface Resume {
  enAttente: number;
  aRembourser: number;
  rembourse: number;
}

const CATEGORIES: Record<Categorie, {
  libelle: string; icone: any; plafond: number | null; bg: string; text: string;
}> = {
  TRANSPORT:   { libelle: 'Transport',   icone: Car,             plafond: 500,  bg: 'bg-blue-50',      text: 'text-blue-600' },
  REPAS:       { libelle: 'Repas',       icone: UtensilsCrossed, plafond: 50,   bg: 'bg-amber-50',     text: 'text-amber-600' },
  HEBERGEMENT: { libelle: 'Hébergement', icone: BedDouble,       plafond: 300,  bg: 'bg-purple-50',    text: 'text-purple-600' },
  FOURNITURES: { libelle: 'Fournitures', icone: Package,         plafond: 200,  bg: 'bg-brand-500/10', text: 'text-brand-texte' },
  FORMATION:   { libelle: 'Formation',   icone: GraduationCap,   plafond: 2000, bg: 'bg-rose-50',      text: 'text-rose-600' },
  AUTRE:       { libelle: 'Autre',       icone: MoreHorizontal,  plafond: null, bg: 'bg-stone-100',    text: 'text-stone-500' },
};

const STYLE_STATUT: Record<StatutNote, {
  libelle: string; bg: string; text: string; barre: string; icone: any;
}> = {
  SOUMISE:    { libelle: 'En attente', bg: 'bg-amber-50',     text: 'text-amber-600', barre: 'bg-amber-400',  icone: Clock },
  APPROUVEE:  { libelle: 'Approuvée',  bg: 'bg-blue-50',      text: 'text-blue-600',  barre: 'bg-blue-400',   icone: CheckCircle2 },
  REMBOURSEE: { libelle: 'Remboursée', bg: 'bg-brand-500/10', text: 'text-brand-texte', barre: 'bg-brand-500',  icone: Wallet },
  REFUSEE:    { libelle: 'Refusée',    bg: 'bg-red-50',       text: 'text-red-500',   barre: 'bg-red-400',    icone: XCircle },
};

const tnd = (v: number) => `${v.toFixed(3)} TND`;

const dateAujourdhui = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Lecture du justificatif ────────────────────────────────────────
// Déclarée hors du composant : elle ne dépend d'aucun état et serait
// recréée à chaque rendu.
async function voirJustificatif(note: Note) {
  try {
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

    // Révoquer trop tôt annule l'affichage : l'URL doit survivre au
    // chargement de la nouvelle fenêtre.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e: any) {
    // L'intercepteur rejette avec le corps de la réponse, qui est un
    // Blob pour une requête binaire : il faut le lire pour obtenir le
    // message, sinon l'erreur reste opaque.
    if (e instanceof Blob) {
      const texte = await e.text();
      throw new Error(JSON.parse(texte)?.erreur ?? 'Erreur serveur');
    }
    throw e;
  }
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

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-6 end-6 z-70">
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

// ── Confirmation ───────────────────────────────────────────────────
// Le confirm() natif affiche la boîte du navigateur, étrangère au
// design et impossible à styler.
function ModalConfirmation({
  titre, message, libelleAction, onConfirmer, onAnnuler,
}: {
  titre: string;
  message: string;
  libelleAction: string;
  onConfirmer: () => void | Promise<void>;
  onAnnuler: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);

  const confirmer = async () => {
    setEnvoi(true);
    await onConfirmer();
    setEnvoi(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-stone-800">{titre}</h2>
            <p className="text-sm text-stone-500 mt-1">{message}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onAnnuler}
            disabled={envoi}
            className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={confirmer}
            disabled={envoi}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
          >
            {envoi
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            {envoi ? 'Suppression…' : libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Formulaire de déclaration ──────────────────────────────────────
function ModalDeclaration({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [categorie, setCategorie] = useState<Categorie>('TRANSPORT');
  const [montant, setMontant] = useState('');
  const [dateDepense, setDateDepense] = useState(dateAujourdhui());
  const [description, setDescription] = useState('');
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const cat = CATEGORIES[categorie];
  const plafond = cat.plafond;
  const somme = Number(montant) || 0;
  const depasse = plafond !== null && somme > plafond;

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (somme <= 0) { setErreur('Indiquez un montant positif'); return; }
    if (!dateDepense) { setErreur('Indiquez la date de la dépense'); return; }

    setEnvoi(true);
    try {
      const donnees = new FormData();
      donnees.append('categorie', categorie);
      donnees.append('montant', String(somme));
      donnees.append('dateDepense', dateDepense);
      donnees.append('description', description);
      if (justificatif) donnees.append('justificatif', justificatif);

      await api.post('/frais/notes', donnees);
      onSuccess(`Dépense de ${tnd(somme)} transmise aux ressources humaines`);
      onClose();
    } catch (err: any) {
      setErreur(err?.erreur ?? "Impossible d'enregistrer la note");
      setEnvoi(false);
    }
  };

  const champ =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-brand-texte" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-stone-800">Déclarer une dépense</h2>
              <p className="text-xs text-stone-500">
                Le remboursement figurera sur votre prochain bulletin
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <form onSubmit={soumettre} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">
              Catégorie
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORIES) as Categorie[]).map((cle) => {
                const c = CATEGORIES[cle];
                const Icone = c.icone;
                const choisi = categorie === cle;
                return (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => setCategorie(cle)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      choisi
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-stone-200 bg-surface hover:bg-stone-50'
                    }`}
                  >
                    <Icone className={`w-4 h-4 ${choisi ? 'text-brand-texte' : 'text-stone-400'}`} />
                    <span className={`text-[11px] font-bold ${
                      choisi ? 'text-brand-texte' : 'text-stone-500'
                    }`}>
                      {c.libelle}
                    </span>
                    {c.plafond !== null && (
                      <span className="text-[9px] text-stone-400">{c.plafond} TND</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Montant (TND) *
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0.000"
                className={champ}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Date de la dépense *
              </label>
              <input
                type="date"
                max={dateAujourdhui()}
                value={dateDepense}
                onChange={(e) => setDateDepense(e.target.value)}
                className={champ}
              />
            </div>
          </div>

          {/* Un dépassement n'empêche pas la déclaration : il attire
              l'attention de la RH, qui tranchera. */}
          {depasse && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Au-delà du plafond de {plafond} TND pour la catégorie {cat.libelle}.
                La RH peut rembourser partiellement — un justificatif détaillé aide
                à justifier l'écart.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Déplacement client à Sousse, taxi aller-retour…"
              className={`${champ} resize-none`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 mb-2">
              Justificatif
            </label>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors shrink-0">
                <Upload className="w-4 h-4" />
                Joindre
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > TAILLE_MAX) { setErreur('Le fichier dépasse 5 Mo'); return; }
                    setJustificatif(f);
                    setErreur('');
                  }}
                />
              </label>

              {justificatif && (
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-brand-texte shrink-0" />
                  <span className="text-xs text-stone-700 truncate">{justificatif.name}</span>
                  <button type="button" onClick={() => setJustificatif(null)} className="shrink-0">
                    <X className="w-3.5 h-3.5 text-stone-400 hover:text-stone-600" />
                  </button>
                </div>
              )}
            </div>

            {/* Sans pièce, la dépense n'est pas opposable à
                l'administration fiscale : le remboursement peut être
                refusé pour cette seule raison. */}
            <p className={`text-xs mt-2 ${justificatif ? 'text-stone-400' : 'text-amber-600'}`}>
              {justificatif
                ? 'Facture ou reçu, PDF ou photo, 5 Mo maximum'
                : 'Sans justificatif, le remboursement peut être refusé'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi || somme <= 0}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Receipt className="w-4 h-4" />}
              {envoi ? 'Envoi…' : 'Déclarer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
type Onglet = 'toutes' | StatutNote;

export default function NotesFraisPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [resume, setResume] = useState<Resume | null>(null);
  const [chargement, setChargement] = useState(true);
  const [formulaire, setFormulaire] = useState(false);
  const [aSupprimer, setASupprimer] = useState<Note | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = async () => {
    try {
      setChargement(true);
      const res = await api.get('/frais/notes') as any;
      setNotes(res?.data?.notes ?? []);
      setResume(res?.data?.resume ?? null);
    } catch (e) {
      console.error('Chargement des notes de frais :', e);
      setErreur('Impossible de charger vos notes de frais');
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(0); }, [onglet, recherche]);

  const supprimer = async (note: Note) => {
    try {
      await api.delete(`/frais/notes/${note.id}`);
      setToast('Note supprimée');
      setASupprimer(null);
      charger();
    } catch (e: any) {
      setErreur(e?.erreur ?? 'Suppression impossible');
      setASupprimer(null);
    }
  };

  const ouvrirJustificatif = async (note: Note) => {
    try {
      setErreur('');
      await voirJustificatif(note);
    } catch (e: any) {
      setErreur(e.message ?? 'Justificatif indisponible');
    }
  };

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (onglet !== 'toutes' && n.statut !== onglet) return false;
        if (!terme) return true;
        return `${n.categorieLibelle} ${n.description}`.toLowerCase().includes(terme);
      })
      .sort((a, b) => String(b.dateDepense).localeCompare(String(a.dateDepense)));
  }, [notes, onglet, recherche]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  const parStatut = (s: StatutNote) => notes.filter((n) => n.statut === s).length;
  const sansJustificatif = notes.filter((n) => !n.justificatifKey && n.statut === 'SOUMISE').length;

  const ONGLETS: [Onglet, string, number][] = [
    ['toutes', 'Toutes', notes.length],
    ['SOUMISE', 'En attente', parStatut('SOUMISE')],
    ['APPROUVEE', 'Approuvées', parStatut('APPROUVEE')],
    ['REMBOURSEE', 'Remboursées', parStatut('REMBOURSEE')],
    ['REFUSEE', 'Refusées', parStatut('REFUSEE')],
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher une dépense…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Ma rémunération</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Notes de frais</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Notes de frais</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : resume && resume.aRembourser > 0 ? (
                <>
                  <span className="text-brand-texte font-semibold">
                    {tnd(resume.aRembourser)}
                  </span>
                  {' '}seront ajoutés à votre prochain bulletin
                </>
              ) : 'Déclarez vos dépenses professionnelles et suivez leur remboursement'}
            </p>
          </div>

          <button
            onClick={() => setFormulaire(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Déclarer
          </button>
        </div>

        <div className="px-8 py-8">

          {erreur && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-sm bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{erreur}</span>
              <button onClick={() => setErreur('')} className="shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            <StatCard
              icon={Clock}
              label="En attente de validation"
              value={chargement ? '…' : tnd(resume?.enAttente ?? 0)}
              sub={`${parStatut('SOUMISE')} note${parStatut('SOUMISE') > 1 ? 's' : ''}`}
              fond="bg-amber-50"
              texte="text-amber-600"
            />
            <StatCard
              icon={Wallet}
              label="À rembourser"
              value={chargement ? '…' : tnd(resume?.aRembourser ?? 0)}
              sub="sur le prochain bulletin"
              fond="bg-blue-50"
              texte="text-blue-600"
            />
            <StatCard
              icon={CheckCircle2}
              label="Déjà remboursé"
              value={chargement ? '…' : tnd(resume?.rembourse ?? 0)}
              sub={`${parStatut('REMBOURSEE')} note${parStatut('REMBOURSEE') > 1 ? 's' : ''}`}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={AlertTriangle}
              label="Sans justificatif"
              value={chargement ? '…' : sansJustificatif}
              sub={sansJustificatif > 0 ? 'risque de refus' : 'toutes justifiées'}
              fond="bg-red-50"
              texte="text-red-500"
              alerte={sansJustificatif > 0}
            />
          </div>

          {/* Le remboursement n'est pas imposable : le rappeler évite
              que le salarié s'interroge en lisant son bulletin. */}
          {resume && resume.aRembourser > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 text-sm bg-blue-50 text-blue-600 border border-blue-200">
              <Wallet className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {tnd(resume.aRembourser)} seront ajoutés à votre prochain bulletin.
                Un remboursement de frais n'est ni soumis à cotisations ni imposable :
                il s'ajoute au net, après l'IRPP.
              </span>
            </div>
          )}

          {/* ── Onglets et recherche ── */}
          <div className="flex items-center justify-between gap-4 bg-surface border border-stone-200 rounded-xl shadow-sm px-2 py-2 mb-5">
            <div className="flex items-center gap-1">
              {ONGLETS.map(([cle, label, nb]) => (
                <button
                  key={cle}
                  onClick={() => setOnglet(cle)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${
                    onglet === cle ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  {label}
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    onglet === cle ? 'bg-surface/25' : 'bg-stone-100'
                  }`}>
                    {chargement ? '…' : nb}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative w-56 shrink-0">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Catégorie, objet…"
                className="w-full ps-9 pe-8 py-2 rounded-lg border border-stone-200 text-sm bg-stone-50 focus:outline-none focus:border-brand-500 focus:bg-surface transition-colors"
              />
              {recherche && (
                <button
                  onClick={() => setRecherche('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-200"
                >
                  <X className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>
          </div>

          {/* ── Liste ── */}
          {chargement ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-stone-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-100 rounded w-32" />
                      <div className="h-3 bg-stone-100 rounded w-48" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtres.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">Aucune note de frais</p>
              <p className="text-xs text-stone-500 mb-4">
                {recherche ? `Aucun résultat pour « ${recherche} »`
                  : onglet !== 'toutes' ? 'Aucune note dans cette catégorie'
                  : 'Transport, repas, hébergement… déclarez vos dépenses professionnelles'}
              </p>
              {onglet === 'toutes' && !recherche && (
                <button
                  onClick={() => setFormulaire(true)}
                  className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Déclarer une première dépense
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {pageCourante.map((n) => {
                  const cat = CATEGORIES[n.categorie] ?? CATEGORIES.AUTRE;
                  const Icone = cat.icone;
                  const style = STYLE_STATUT[n.statut];
                  const StatutIcone = style.icone;
                  const partiel = n.statut !== 'SOUMISE'
                    && n.montantAccorde != null
                    && n.montantAccorde < n.montant;

                  return (
                    <div
                      key={n.id}
                      className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden transition-shadow hover:shadow-md"
                    >
                      <div className="flex">
                        <div className={`w-1 shrink-0 ${style.barre}`} />

                        <div className="flex-1 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cat.bg}`}>
                                <Icone className={`w-5 h-5 ${cat.text}`} />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-stone-800">
                                    {n.categorieLibelle}
                                  </h4>
                                  {n.depassePlafond && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                      Au-delà du plafond
                                    </span>
                                  )}
                                  {!n.justificatifKey && n.statut === 'SOUMISE' && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                                      Sans justificatif
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-stone-400 mt-0.5">
                                  Dépense du {new Date(n.dateDepense).toLocaleDateString('fr-FR', {
                                    day: 'numeric', month: 'long', year: 'numeric',
                                  })}
                                </p>

                                {n.description && (
                                  <p className="text-sm text-stone-600 mt-1.5">
                                    {n.description}
                                  </p>
                                )}

                                {n.commentaireRH && (
                                  <p className="text-xs text-stone-500 mt-2 ps-2 border-s-2 border-stone-100">
                                    {n.commentaireRH}
                                    {n.traitePar && (
                                      <span className="text-stone-400"> — {n.traitePar}</span>
                                    )}
                                  </p>
                                )}

                                {n.periodeRemboursement && (
                                  <p className="text-xs font-bold text-brand-texte mt-1.5">
                                    Remboursé sur le bulletin de {n.periodeRemboursement}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="text-end">
                                <div className={`text-lg font-bold ${style.text}`}>
                                  {tnd(partiel ? n.montantAccorde! : n.montant)}
                                </div>
                                {partiel && (
                                  <div className="text-[10px] text-stone-400 line-through">
                                    {tnd(n.montant)} demandés
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${style.bg} ${style.text}`}>
                                  <StatutIcone className="w-3 h-3" />
                                  {style.libelle}
                                </span>

                                {n.justificatifKey && (
                                  <button
                                    onClick={() => ouvrirJustificatif(n)}
                                    className="p-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                                    title="Consulter le justificatif"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-stone-400" />
                                  </button>
                                )}

                                {/* Une note traitée appartient à
                                    l'historique comptable : seule une
                                    note en attente se retire. */}
                                {n.statut === 'SOUMISE' && (
                                  <button
                                    onClick={() => setASupprimer(n)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-stone-400 hover:text-red-500" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 mt-4 overflow-hidden">
                <Pagination
                  page={page}
                  taillePage={PAR_PAGE}
                  total={filtres.length}
                  onPage={setPage}
                  libelle="note"
                  accent={ACCENT}
                />
              </div>
            </>
          )}

          {/* ── Plafonds ── */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-brand-texte" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Plafonds de remboursement
              </h4>
            </div>

            <div className="grid grid-cols-3 gap-x-10 gap-y-3">
              {(Object.keys(CATEGORIES) as Categorie[]).map((cle) => {
                const c = CATEGORIES[cle];
                return (
                  <div
                    key={cle}
                    className="grid grid-cols-[1fr_auto] gap-3 items-baseline border-b border-stone-50 pb-2"
                  >
                    <span className="text-xs text-stone-500">{c.libelle}</span>
                    <span className="text-xs font-bold text-stone-700 tabular-nums">
                      {c.plafond !== null ? `${c.plafond} TND` : 'au cas par cas'}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-stone-400 mt-3">
              Un dépassement n'empêche pas la déclaration : la RH peut rembourser
              partiellement, et un justificatif détaillé aide à défendre l'écart.
            </p>
          </div>
        </div>

        {formulaire && (
          <ModalDeclaration
            onClose={() => setFormulaire(false)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}

        {aSupprimer && (
          <ModalConfirmation
            titre="Supprimer cette note ?"
            message={
              `${aSupprimer.categorieLibelle} du `
              + `${new Date(aSupprimer.dateDepense).toLocaleDateString('fr-FR')}, `
              + `${tnd(aSupprimer.montant)}. Cette action est définitive.`
            }
            libelleAction="Supprimer"
            onConfirmer={() => supprimer(aSupprimer)}
            onAnnuler={() => setASupprimer(null)}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #DFE3F0;
            border-radius: 10px;
          }
        `}</style>
      </Layout>
    </div>
  );
}