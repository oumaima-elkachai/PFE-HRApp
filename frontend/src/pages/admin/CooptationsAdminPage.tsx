// src/pages/admin/CooptationsAdminPage.tsx
//
// Cooptation, côté ressources humaines : examiner les recommandations,
// trancher, et accorder la prime.
//
// ── Les deux décisions ne sont pas la même ──────────────────────────
//
// Décider du sort d'une candidature et fixer une prime sont deux
// gestes séparés, et la page les sépare. La première se prend au fil
// du recrutement ; la seconde une fois la personne embauchée, et elle
// engage de l'argent. Les confondre dans un seul formulaire ferait
// accorder des primes par inadvertance.
//
// ── Le cas du parrain double ────────────────────────────────────────
//
// Deux salariés peuvent recommander la même personne. C'est la
// première source de litige d'un dispositif de cooptation. La fiche
// affiche donc les autres recommandations du même candidat AVANT que
// la prime ne soit décidée, pas après.

import { useState, useEffect, useMemo } from 'react';
import {
  Users, Award, Gift, Clock, CheckCircle2, XCircle, Send, X,
  ChevronRight, Paperclip, Search, AlertTriangle, Briefcase, Mail,
  Phone, UserCheck, Download,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import api from '../../services/api';
import { STYLES_ANIMATION } from '../../utils/animations';

type Statut = 'ENVOYEE' | 'EN_COURS' | 'RECRUTEE' | 'ECARTEE';
type StatutPrime = 'AUCUNE' | 'ACCORDEE' | 'VERSEE';

interface Cooptation {
  id: string;
  parrainId: string;
  parrainNom: string;
  parrainEmail: string;
  candidatNom: string;
  candidatEmail: string;
  candidatTelephone?: string | null;
  relationLibelle?: string;
  commentaire: string;
  commentaireRH?: string | null;
  offreTitre?: string | null;
  spontanee: boolean;
  statut: Statut;
  primeStatut: StatutPrime;
  primeMontant?: number | null;
  primeMois?: string | null;
  primeBulletin?: string | null;
  cvNom?: string | null;
  creeLe: string;
}

interface AutreRecommandation {
  id: string;
  parrainNom: string;
  creeLe: string;
  statut: Statut;
  primeStatut: StatutPrime;
}

const STYLE_STATUT: Record<Statut, {
  libelle: string; bg: string; text: string;
  icone: React.ComponentType<{ className?: string }>;
}> = {
  ENVOYEE: { libelle: 'À examiner', bg: 'bg-stone-100', text: 'text-stone-500', icone: Send },
  EN_COURS: { libelle: 'En cours', bg: 'bg-amber-50', text: 'text-amber-600', icone: Clock },
  RECRUTEE: { libelle: 'Recrutée', bg: 'bg-brand-500/10', text: 'text-brand-texte', icone: CheckCircle2 },
  ECARTEE: { libelle: 'Écartée', bg: 'bg-red-50', text: 'text-red-500', icone: XCircle },
};

const ORDRE: Statut[] = ['ENVOYEE', 'EN_COURS', 'RECRUTEE', 'ECARTEE'];

const tnd = (v: number) => `${Number(v).toFixed(3)} TND`;

const jourCourt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—';

const moisLong = (m?: string | null) => {
  if (!m) return '';
  const [a, mois] = m.split('-');
  const noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${noms[Number(mois) - 1] ?? m} ${a}`;
};

/**
 * Récupère le CV et le pose dans les téléchargements.
 *
 * Même procédé que tes attestations : la route renvoie le fichier
 * lui-même, pas une adresse. Un lien direct vers le stockage se
 * partagerait par copier-coller et contournerait le contrôle d'accès.
 */
async function telechargerCv(c: Cooptation): Promise<void> {
  const blob = await api.get(`/cooptations/${c.id}/cv`, {
    responseType: 'blob',
  }) as unknown as Blob;

  // Un refus revient en JSON. Sans ce test, le navigateur
  // enregistrerait le message d'erreur sous le nom du CV.
  if (blob.type.includes('json') || blob.type.startsWith('text/')) {
    const texte = await blob.text();
    let message = 'CV indisponible';
    try { message = JSON.parse(texte)?.erreur ?? message; } catch { /* réponse HTML */ }
    throw new Error(message);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = c.cvNom || `CV - ${c.candidatNom}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Mois courant au format attendu par le serveur. */
function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Fiche détaillée ─────────────────────────────────────────────────

function Fiche({ cooptation, autres, onFermer, onAgir }: {
  cooptation: Cooptation;
  autres: AutreRecommandation[];
  onFermer: () => void;
  onAgir: (message: string) => void;
}) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [commentaire, setCommentaire] = useState('');

  const [cvEnCours, setCvEnCours] = useState(false);

  const [primeOuverte, setPrimeOuverte] = useState(false);
  const [montant, setMontant] = useState('');
  const [mois, setMois] = useState(moisCourant());

  const style = STYLE_STATUT[cooptation.statut] ?? STYLE_STATUT.ENVOYEE;
  const Icone = style.icone;

  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onFermer]);

  const decider = async (statut: Statut) => {
    setErreur('');

    // Le serveur refuse un écartement sans explication. Le dire ici
    // évite un aller-retour pour une règle qu'on ne pouvait pas voir.
    if (statut === 'ECARTEE' && commentaire.trim().length < 3) {
      setErreur('Expliquez brièvement pourquoi la candidature n’aboutit pas.');
      return;
    }

    setOccupe(true);
    try {
      const res = await api.patch(`/cooptations/${cooptation.id}`, {
        statut, commentaire: commentaire.trim(),
      }) as any;
      onAgir(res?.data?.message ?? 'Décision enregistrée.');
    } catch (e: any) {
      setErreur(e?.response?.data?.erreur ?? e?.erreur ?? 'Opération impossible.');
      setOccupe(false);
    }
  };

  const accorder = async () => {
    setErreur('');
    const valeur = Number(montant);

    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Indiquez un montant positif.');
      return;
    }

    setOccupe(true);
    try {
      const res = await api.post(`/cooptations/${cooptation.id}/prime`, {
        montant: valeur, mois,
      }) as any;
      onAgir(res?.data?.message ?? 'Prime accordée.');
    } catch (e: any) {
      setErreur(e?.response?.data?.erreur ?? e?.erreur ?? 'Opération impossible.');
      setOccupe(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={onFermer}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 py-5 border-b border-stone-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                <Icone className="w-2.5 h-2.5" />
                {style.libelle}
              </span>
              {cooptation.primeStatut !== 'AUCUNE' && (
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  cooptation.primeStatut === 'VERSEE'
                    ? 'bg-brand-500/10 text-brand-texte'
                    : 'bg-amber-50 text-amber-600'
                }`}>
                  <Gift className="w-2.5 h-2.5" />
                  Prime {cooptation.primeStatut === 'VERSEE' ? 'versée' : 'accordée'}
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-stone-800">{cooptation.candidatNom}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Recommandation de <strong>{cooptation.parrainNom}</strong>
              {' · '}{jourCourt(cooptation.creeLe)}
            </p>
          </div>

          <button
            onClick={onFermer}
            aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-stone-50 transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 sm:max-h-[60vh] sm:overflow-y-auto">

          {/* ── Le candidat ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              [Mail, 'Adresse', cooptation.candidatEmail],
              [Phone, 'Téléphone', cooptation.candidatTelephone || 'Non communiqué'],
              [Briefcase, 'Poste visé',
                cooptation.spontanee ? 'Candidature spontanée' : (cooptation.offreTitre ?? '—')],
              [UserCheck, 'Lien déclaré', cooptation.relationLibelle ?? '—'],
            ] as [any, string, string][]).map(([Ico, libelle, valeur]) => (
              <div key={libelle} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                  <Ico className="w-4 h-4 text-stone-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                    {libelle}
                  </div>
                  <div className="text-sm text-stone-700 mt-0.5 break-words">{valeur}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Le motif ── */}
          <div className="pt-4 border-t border-stone-100">
            <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
              Motif de la recommandation
            </div>
            <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line">
              {cooptation.commentaire}
            </p>

            {cooptation.cvNom && (
              <button
                onClick={async () => {
                  setErreur('');
                  setCvEnCours(true);
                  try {
                    await telechargerCv(cooptation);
                  } catch (e: any) {
                    setErreur(e?.message ?? 'CV indisponible.');
                  } finally {
                    setCvEnCours(false);
                  }
                }}
                disabled={cvEnCours}
                className="mt-3 flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
              >
                {cvEnCours
                  ? <span className="w-3.5 h-3.5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Télécharger le CV
                <span className="font-normal text-stone-400 truncate max-w-[12rem]">
                  {cooptation.cvNom}
                </span>
              </button>
            )}
          </div>

          {/* ── Autres parrains ── */}
          {autres.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-amber-900">
                    {autres.length} autre{autres.length > 1 ? 's' : ''} recommandation
                    {autres.length > 1 ? 's' : ''} pour cette personne
                  </h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Une seule prime est due. Vérifiez qui a recommandé en premier
                    avant de l'accorder.
                  </p>
                  <ul className="mt-2.5 space-y-1">
                    {autres.map((a) => (
                      <li key={a.id} className="text-xs text-amber-900">
                        <strong>{a.parrainNom}</strong> — {jourCourt(a.creeLe)}
                        {a.primeStatut !== 'AUCUNE' && ' · prime déjà accordée'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {cooptation.commentaireRH && (
            <div className="rounded-xl bg-stone-50 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">
                Note interne
              </div>
              <p className="text-sm text-stone-600 leading-relaxed">
                {cooptation.commentaireRH}
              </p>
            </div>
          )}

          {/* ── La prime ── */}
          {cooptation.primeStatut !== 'AUCUNE' ? (
            <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-4">
              <div className="flex items-start gap-2.5">
                <Gift className="w-4 h-4 mt-0.5 shrink-0 text-brand-texte" />
                <p className="text-sm text-stone-700 leading-relaxed">
                  <strong>{tnd(cooptation.primeMontant ?? 0)}</strong>
                  {cooptation.primeStatut === 'VERSEE'
                    ? ` versés à ${cooptation.parrainNom}`
                      + (cooptation.primeBulletin ? ` — bulletin ${cooptation.primeBulletin}` : '')
                    : ` à verser à ${cooptation.parrainNom} sur le bulletin de ${moisLong(cooptation.primeMois)}`}
                </p>
              </div>
            </div>
          ) : cooptation.statut === 'RECRUTEE' && primeOuverte ? (
            <div className="rounded-xl border border-stone-200 p-4 space-y-3">
              <h4 className="text-sm font-bold text-stone-800">
                Prime pour {cooptation.parrainNom}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">
                    Montant (TND)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.001"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="500"
                    className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">
                    Bulletin de
                  </label>
                  <input
                    type="month"
                    value={mois}
                    onChange={(e) => setMois(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <p className="text-[11px] text-stone-400 leading-relaxed">
                La prime s'ajoutera automatiquement au bulletin de ce mois.
                Une fois versée, elle ne pourra plus être modifiée — il faudra
                passer par une régularisation de paie.
              </p>
            </div>
          ) : null}

          {erreur && (
            <div className="flex items-start gap-2 text-xs font-bold rounded-xl px-3 py-2 bg-red-50 text-red-500">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {erreur}
            </div>
          )}

          {/* ── Note de décision ── */}
          {cooptation.statut !== 'ECARTEE' && !primeOuverte && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Note en retour <span className="text-stone-400">(obligatoire pour écarter)</span>
              </label>
              <textarea
                rows={2}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Profil intéressant, entretien prévu la semaine prochaine."
                className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50 flex items-center gap-2.5 flex-wrap">
          {cooptation.statut === 'RECRUTEE'
            && cooptation.primeStatut === 'AUCUNE' ? (
            primeOuverte ? (
              <>
                <button
                  onClick={() => setPrimeOuverte(false)}
                  className="text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-surface transition-colors"
                >
                  Annuler
                </button>
                <div className="flex-1" />
                <button
                  onClick={accorder}
                  disabled={occupe}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors"
                >
                  {occupe
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Gift className="w-4 h-4" />}
                  Accorder la prime
                </button>
              </>
            ) : (
              <>
                <div className="flex-1" />
                <button
                  onClick={() => setPrimeOuverte(true)}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors"
                >
                  <Gift className="w-4 h-4" />
                  Accorder une prime
                </button>
              </>
            )
          ) : (
            <>
              {cooptation.statut !== 'ECARTEE' && (
                <button
                  onClick={() => decider('ECARTEE')}
                  disabled={occupe}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Écarter
                </button>
              )}

              <div className="flex-1" />

              {cooptation.statut === 'ENVOYEE' && (
                <button
                  onClick={() => decider('EN_COURS')}
                  disabled={occupe}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-surface disabled:opacity-40 transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  Je garde ce profil
                </button>
              )}

              {cooptation.statut !== 'RECRUTEE' && (
                <button
                  onClick={() => decider('RECRUTEE')}
                  disabled={occupe}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-40 transition-colors"
                >
                  {occupe
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  Marquer recrutée
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 start-4 end-4 sm:start-auto sm:top-6 sm:end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-start gap-3 sm:max-w-md">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-medium flex-1 leading-relaxed">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function CooptationsAdminPage() {
  const [liste, setListe] = useState<Cooptation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<Statut | 'TOUTES'>('TOUTES');
  const [recherche, setRecherche] = useState('');
  const [toast, setToast] = useState('');

  const [ficheId, setFicheId] = useState<string | null>(null);
  const [autres, setAutres] = useState<AutreRecommandation[]>([]);

  const charger = async () => {
    try {
      const res = await api.get('/cooptations') as any;
      setListe(res?.data?.cooptations ?? []);
    } catch (e) {
      console.error('Chargement des cooptations :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  // On garde l'identifiant, pas l'objet : après une décision la liste
  // est rechargée, et un objet figé afficherait encore l'ancien état.
  const fiche = ficheId ? liste.find((c) => c.id === ficheId) ?? null : null;

  // Le détail porte les autres recommandations du même candidat, que
  // la liste ne connaît pas.
  useEffect(() => {
    if (!ficheId) { setAutres([]); return; }

    (async () => {
      try {
        const res = await api.get(`/cooptations/${ficheId}`) as any;
        setAutres(res?.data?.autresRecommandations ?? []);
      } catch {
        setAutres([]);
      }
    })();
  }, [ficheId]);

  const comptes = useMemo(() => {
    const c: Record<string, number> = { TOUTES: liste.length };
    for (const s of ORDRE) c[s] = liste.filter((x) => x.statut === s).length;
    return c;
  }, [liste]);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return liste
      .filter((c) => filtre === 'TOUTES' || c.statut === filtre)
      .filter((c) => !terme
        || `${c.candidatNom} ${c.parrainNom} ${c.candidatEmail} ${c.offreTitre ?? ''}`
          .toLowerCase().includes(terme))
      .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
  }, [liste, filtre, recherche]);

  const aTraiter = comptes.ENVOYEE ?? 0;
  const primesDues = liste
    .filter((c) => c.primeStatut === 'ACCORDEE')
    .reduce((s, c) => s + Number(c.primeMontant ?? 0), 0);

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher…">

        <div className="px-4 sm:px-8 py-5 sm:py-6 border-b border-stone-200">
          <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
            <span>Recrutement</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-brand-texte font-semibold">Cooptation</span>
          </nav>
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-800">
            Recommandations des salariés
          </h2>
          <p className="text-stone-500 mt-1 text-sm">
            {chargement ? 'Chargement…'
              : aTraiter > 0
                ? `${aTraiter} recommandation${aTraiter > 1 ? 's' : ''} à examiner`
                : 'Rien à examiner pour le moment'}
          </p>
        </div>

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-4">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              [Users, 'Recommandations reçues', chargement ? '…' : String(liste.length),
                'bg-brand-500/10', 'text-brand-texte', false],
              [Award, 'Personnes recrutées', chargement ? '…' : String(comptes.RECRUTEE ?? 0),
                'bg-brand-500/10', 'text-brand-texte', false],
              [Gift, 'Primes à verser', chargement ? '…' : tnd(primesDues),
                'bg-amber-50', 'text-amber-600', primesDues > 0],
            ] as [any, string, string, string, string, boolean][])
              .map(([Icone, libelle, valeur, fond, texte, alerte], i) => (
                <div
                  key={libelle}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className={`hrup-monter hrup-carte bg-surface rounded-2xl shadow-sm border p-5 ${
                    alerte ? 'border-amber-200' : 'border-stone-100'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
                    <Icone className={`w-4 h-4 ${texte}`} />
                  </div>
                  <div className={`text-2xl font-bold leading-tight ${texte}`}>{valeur}</div>
                  <div className="text-xs text-stone-500 mt-0.5">{libelle}</div>
                </div>
              ))}
          </div>

          {/* ── Filtres et recherche ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['TOUTES', ...ORDRE] as (Statut | 'TOUTES')[]).map((s) => {
              const actif = filtre === s;
              const style = s === 'TOUTES' ? null : STYLE_STATUT[s];

              return (
                <button
                  key={s}
                  onClick={() => setFiltre(s)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    actif
                      ? 'bg-brand-500 text-white border-transparent'
                      : 'bg-surface text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {s === 'TOUTES' ? 'Toutes' : style!.libelle}
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    actif ? 'bg-white/20' : 'bg-stone-100'
                  }`}>
                    {comptes[s] ?? 0}
                  </span>
                </button>
              );
            })}

            <div className="relative w-full sm:w-64 sm:ms-auto">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Candidat, parrain, poste…"
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* ── Liste ── */}
          {chargement ? (
            <div className="space-y-2.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-stone-50 animate-pulse" />
              ))}
            </div>
          ) : filtrees.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-3">
                <Users className="w-5 h-5 text-stone-300" />
              </div>
              <p className="text-sm text-stone-500">
                {recherche
                  ? `Rien ne correspond à « ${recherche} »`
                  : 'Aucune recommandation dans cette catégorie'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtrees.map((c, i) => {
                const style = STYLE_STATUT[c.statut] ?? STYLE_STATUT.ENVOYEE;
                const Icone = style.icone;

                return (
                  <button
                    key={c.id}
                    onClick={() => setFicheId(c.id)}
                    style={{ animationDelay: `${180 + i * 50}ms` }}
                    className="hrup-monter hrup-carte w-full text-start bg-surface rounded-2xl shadow-sm border border-stone-100 p-5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-stone-800">
                            {c.candidatNom}
                          </span>
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                            <Icone className="w-2.5 h-2.5" />
                            {style.libelle}
                          </span>
                          {c.primeStatut !== 'AUCUNE' && (
                            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              c.primeStatut === 'VERSEE'
                                ? 'bg-brand-500/10 text-brand-texte'
                                : 'bg-amber-50 text-amber-600'
                            }`}>
                              <Gift className="w-2.5 h-2.5" />
                              {tnd(c.primeMontant ?? 0)}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-500 mt-1">
                          Recommandation de <strong className="text-stone-700">{c.parrainNom}</strong>
                          {' · '}
                          {c.spontanee ? 'Candidature spontanée' : c.offreTitre}
                          {' · '}{jourCourt(c.creeLe)}
                        </p>

                        <p className="text-xs text-stone-500 mt-2 line-clamp-1 max-w-2xl">
                          {c.commentaire}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {c.cvNom && <Paperclip className="w-3.5 h-3.5 text-stone-300" />}
                        <ChevronRight className="w-4 h-4 text-stone-300" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {fiche && (
          <Fiche
            cooptation={fiche}
            autres={autres}
            onFermer={() => setFicheId(null)}
            onAgir={(m) => { setToast(m); setFicheId(null); charger(); }}
          />
        )}

        {toast && <Toast message={toast} onClose={() => setToast('')} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}