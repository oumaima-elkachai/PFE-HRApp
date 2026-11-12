// src/pages/admin/ValidationDossiersPage.tsx
//
// La RH relit les pièces que les salariés ont déposées, et les valide
// ou les refuse.
//
// ── Pourquoi la pièce se juge dans son dossier ──────────────────────
//
// Une liste de pièces à relire, sortie de tout contexte, fait prendre
// des décisions à l'aveugle : on valide un contrat sans voir qu'il
// manque la CIN du même salarié, ni que sa fiche d'aptitude expire
// dans quinze jours. L'écran montre donc le dossier entier — les onze
// lignes du catalogue, leur état — et rend seulement les pièces en
// attente actionnables.
//
// ── Un refus porte toujours un motif ────────────────────────────────
//
// Le serveur le refuse autrement, et il a raison : un refus muet
// oblige le salarié à redéposer au hasard. Le bouton reste donc
// désactivé tant que le motif est vide.
//
// ── Ce que la page ne fait pas ──────────────────────────────────────
//
// Elle ne déclare aucune liste de documents. Le catalogue descend avec
// la réponse du serveur, références légales comprises. Deux listes
// finiraient par diverger, et c'est celle de l'écran qui aurait tort.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderCheck, FileText, Check, X, Clock, AlertTriangle, Search,
  Eye, User, ShieldCheck, CalendarClock, Loader2, IdCard, Info,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { EnTete, StatCard, Toast, Vide, Squelette, Anneau, CARTE, ton } from '@/components/ui/kit';
import api from '@/services/api';
import { STYLES_ANIMATION } from '@/utils/animations';

// ── Types ──────────────────────────────────────────────────────────

interface PieceEnAttente {
  id: string;
  type: string;
  nomFichier: string;
  deposeLe: string;
  taille: number;
}

interface DossierEnAttente {
  employeId: string;
  nom: string;
  poste: string | null;
  pieces: PieceEnAttente[];
}

interface Piece {
  id: string;
  nomFichier: string;
  taille: number;
  deposeLe: string;
  statut: string;
  dateExpiration: string | null;
  commentaireRH: string | null;
  valideePar: string | null;
  valideeLe: string | null;
  /** Ce que le salarié a lu sur sa propre carte en la déposant.
      Une proposition : elle n'entre sur la fiche que si la RH la
      confirme, scan sous les yeux. */
  cinPropose?: string | null;
  cinDelivreLePropose?: string | null;
  cinDelivreAPropose?: string | null;
}

interface Ligne {
  type: string;
  obligatoire: boolean;
  multiple: boolean;
  expire: boolean;
  statut: string;
  pieces: Piece[];
}

interface DefinitionCatalogue {
  libelle: string;
  nature?: string;
  reference?: string;
  obligatoire: boolean;
  expire: boolean;
  multiple: boolean;
}

interface Dossier {
  employe: {
    id: string; nom: string; poste: string | null;
    departement?: string | null; email: string | null; cin: string | null;
    cinDelivreLe?: string | null; cinDelivreA?: string | null;
    /** Qui a recopié le numéro depuis le scan, et quand. */
    cinVerifieLe?: string | null; cinVerifiePar?: string | null;
  };
  lignes: Ligne[];
  avancement: { obligatoires: number; fournies: number; pourcentage: number };
  catalogue: Record<string, DefinitionCatalogue>;
}

// ── Présentation des états ─────────────────────────────────────────

const ETAT: Record<string, { libelle: string; tonalite: string }> = {
  VALIDEE:    { libelle: 'Validée',    tonalite: 'brand' },
  EN_ATTENTE: { libelle: 'À relire',   tonalite: 'amber' },
  REFUSEE:    { libelle: 'Refusée',    tonalite: 'red' },
  EXPIREE:    { libelle: 'Expirée',    tonalite: 'red' },
  MANQUANTE:  { libelle: 'Manquante',  tonalite: 'stone' },
};

const etatDe = (s: string) => ETAT[s] ?? ETAT.MANQUANTE;

const taille = (octets?: number) =>
  !octets ? ''
    : octets > 1048576 ? `${(octets / 1048576).toFixed(1)} Mo`
    : `${Math.round(octets / 1024)} Ko`;

const jour = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : '—';

const jourCourt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';

/**
 * Le libellé d'un type de pièce.
 *
 * Le catalogue arrive avec le dossier d'un salarié ; tant qu'aucun
 * n'est ouvert, on se rabat sur le type lui-même, rendu lisible. Pas
 * de liste recopiée ici : elle divergerait de celle du serveur, et
 * c'est l'écran qui aurait tort.
 */
function libelleDe(type: string, catalogue: Record<string, DefinitionCatalogue>): string {
  const connu = catalogue[type]?.libelle;
  if (connu) return connu;
  const mots = type.replace(/_/g, ' ').toLowerCase();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

// ── Une ligne du catalogue ─────────────────────────────────────────

function LigneDossier({ ligne, definition, employeId, fiche, onDecision, onApercu }: {
  ligne: Ligne;
  definition?: DefinitionCatalogue;
  employeId: string;
  /** Les mentions déjà portées par la fiche, s'il y en a. */
  fiche: { cin: string | null; cinDelivreLe?: string | null; cinDelivreA?: string | null };
  onDecision: (message: string) => void;
  onApercu: (pieceId: string, nomFichier: string) => void;
}) {
  const [motifOuvert, setMotifOuvert] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  const estCin = ligne.type === 'CIN';

  // La pièce en attente de cette ligne : la CIN n'est pas « multiple »,
  // il n'y en a donc qu'une à la fois.
  const enAttenteCin = estCin
    ? ligne.pieces.find((p) => p.statut === 'EN_ATTENTE')
    : undefined;

  // Les trois mentions, pré-remplies dans cet ordre de priorité : ce que
  // le salarié a proposé, puis ce que la fiche porte déjà. La RH corrige
  // en lisant le scan — c'est elle qui fait foi.
  const [cin, setCin] = useState('');
  const [cinLe, setCinLe] = useState('');
  const [cinA, setCinA] = useState('');

  useEffect(() => {
    if (!estCin) return;
    setCin(enAttenteCin?.cinPropose ?? fiche.cin ?? '');
    setCinLe(enAttenteCin?.cinDelivreLePropose ?? fiche.cinDelivreLe ?? '');
    setCinA(enAttenteCin?.cinDelivreAPropose ?? fiche.cinDelivreA ?? '');
  }, [estCin, enAttenteCin, fiche.cin, fiche.cinDelivreLe, fiche.cinDelivreA]);

  const cinNet = cin.replace(/[\s.-]/g, '');
  const numeroValide = /^\d{8}$/.test(cinNet);

  // Les trois mentions, et pas seulement le numéro. `pdf.js` refuse de
  // produire la moindre attestation sans la date et le lieu de
  // délivrance — il lève avant même de dessiner. N'exiger que le numéro
  // laisserait la RH valider, croire que c'est réglé, et découvrir
  // l'échec au moment d'éditer le document.
  const cinComplet = numeroValide && !!cinLe && !!cinA.trim();

  const cinManquant = [
    !numeroValide && (cinNet ? 'un numéro à huit chiffres' : 'le numéro'),
    !cinLe && 'la date de délivrance',
    !cinA.trim() && 'le lieu de délivrance',
  ].filter(Boolean) as string[];

  const e = etatDe(ligne.statut);
  const t = ton(e.tonalite);
  const libelle = definition?.libelle ?? libelleDe(ligne.type, {});

  const decider = async (pieceId: string, statut: 'VALIDEE' | 'REFUSEE') => {
    setErreur('');

    if (statut === 'REFUSEE' && !motif.trim()) {
      setErreur('Indiquez ce que le salarié doit corriger.');
      return;
    }

    // Valider une carte d'identité sans relever son numéro laisse le
    // dossier dans l'état même qu'on cherche à corriger : la pièce est
    // verte, et aucune attestation ne sort.
    if (statut === 'VALIDEE' && estCin && !cinComplet) {
      const liste = cinManquant.length === 1
        ? cinManquant[0]
        : `${cinManquant.slice(0, -1).join(', ')} et ${cinManquant[cinManquant.length - 1]}`;
      setErreur(`Relevez ${liste} avant de valider.`);
      return;
    }

    setOccupe(true);
    try {
      const res = await api.put(`/dossier/pieces/${pieceId}`, {
        employeId,
        statut,
        commentaireRH: motif.trim(),
        // Les mentions ne partent qu'avec une validation de CIN : un
        // refus ne doit rien écrire sur la fiche.
        ...(statut === 'VALIDEE' && estCin
          ? { cin: cinNet, cinDelivreLe: cinLe, cinDelivreA: cinA.trim() }
          : {}),
      }) as any;

      setMotif('');
      setMotifOuvert(null);
      onDecision(res?.data?.message ?? 'Décision enregistrée.');
    } catch (err: any) {
      setErreur(err?.response?.data?.erreur ?? err?.erreur ?? 'Opération impossible.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${
      ligne.statut === 'EN_ATTENTE' ? 'border-amber-200 bg-amber-50/40' : 'border-stone-100'
    }`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-stone-800">{libelle}</h4>

            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
              {e.libelle}
            </span>

            {ligne.obligatoire && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
                Obligatoire
              </span>
            )}
          </div>

          {/* La référence légale vient du serveur. Elle explique à la
              RH pourquoi une pièce est exigée, et au jury d'où sort
              cette exigence. */}
          {definition?.reference && (
            <p className="text-[10px] text-stone-400 mt-1 flex items-start gap-1.5">
              <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
              {definition.reference}
            </p>
          )}
        </div>
      </div>

      {/* ── Le relevé de la carte ──
          Le numéro de CIN était saisi dans la modale de délivrance,
          c'est-à-dire au seul moment du parcours où personne n'a la
          carte sous les yeux. Il se relève ici, où le scan s'ouvre d'un
          clic, et il part sur la fiche avec la validation. */}
      {estCin && enAttenteCin && (
        <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
          <div className="flex items-start gap-2 mb-3">
            <IdCard className="w-4 h-4 mt-0.5 shrink-0 text-brand-texte" />
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-stone-800">
                Relevé de la carte
              </h5>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                Ouvrez le scan et recopiez les trois mentions. Elles
                partent sur la fiche du salarié en même temps que la
                validation. Les trois sont obligatoires : une attestation
                porte le numéro, sa date et son lieu de délivrance, et le
                générateur refuse d'éditer le document s'il en manque une.
              </p>
            </div>
          </div>

          {/* Deux colonnes et non quatre : le panneau de droite ne fait
              que ~670 px, et un champ date natif en dessous de 200 px
              tronque son sélecteur. Le numéro, seul obligatoire, prend
              la première ligne. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label
                htmlFor={`cin-${enAttenteCin.id}`}
                className="block text-[11px] font-bold text-stone-600 mb-1"
              >
                Numéro <span className="text-red-500">*</span>
              </label>
              <input
                id={`cin-${enAttenteCin.id}`}
                type="text"
                inputMode="numeric"
                value={cin}
                onChange={(ev) => { setCin(ev.target.value); setErreur(''); }}
                placeholder="12345678"
                aria-invalid={!!cin && !numeroValide}
                className={`w-full px-3 py-2 rounded-xl border bg-surface text-sm tabular-nums
                  focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors ${
                    cin && !numeroValide
                      ? 'border-red-300 focus:border-red-400'
                      : numeroValide
                        ? 'border-stone-200 focus:border-brand-500'
                        : 'border-amber-300'
                  }`}
              />
            </div>

            <div>
              <label
                htmlFor={`cin-le-${enAttenteCin.id}`}
                className="block text-[11px] font-bold text-stone-600 mb-1"
              >
                Délivrée le <span className="text-red-500">*</span>
              </label>
              <input
                id={`cin-le-${enAttenteCin.id}`}
                type="date"
                value={cinLe}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(ev) => { setCinLe(ev.target.value); setErreur(''); }}
                className={`w-full px-3 py-2 rounded-xl border bg-surface text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors ${
                    cinLe ? 'border-stone-200 focus:border-brand-500' : 'border-amber-300'
                  }`}
              />
            </div>

            <div>
              <label
                htmlFor={`cin-a-${enAttenteCin.id}`}
                className="block text-[11px] font-bold text-stone-600 mb-1"
              >
                Délivrée à <span className="text-red-500">*</span>
              </label>
              <input
                id={`cin-a-${enAttenteCin.id}`}
                type="text"
                value={cinA}
                onChange={(ev) => { setCinA(ev.target.value); setErreur(''); }}
                placeholder="Tunis"
                className={`w-full px-3 py-2 rounded-xl border bg-surface text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors ${
                    cinA.trim() ? 'border-stone-200 focus:border-brand-500' : 'border-amber-300'
                  }`}
              />
            </div>
          </div>

          {/* D'où viennent les valeurs pré-remplies. La RH doit savoir
              si elle relit une saisie du salarié ou la fiche. */}
          {enAttenteCin.cinPropose ? (
            <p className="text-[11px] text-stone-500 mt-2.5 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Pré-rempli par le salarié au dépôt. Vérifiez contre le scan
              avant de valider : c'est votre saisie qui fait foi.
            </p>
          ) : fiche.cin ? (
            <p className="text-[11px] text-stone-500 mt-2.5 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Pré-rempli depuis la fiche. Corrigez si la carte déposée
              porte autre chose.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 mt-2.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              Le salarié n'a rien proposé et la fiche est vide : tout est
              à relever sur le scan.
            </p>
          )}
        </div>
      )}

      {/* Le numéro est connu et plus rien n'est en attente : on le
          rappelle, avec la trace de qui l'a vérifié. */}
      {estCin && !enAttenteCin && fiche.cin && fiche.cinDelivreLe && fiche.cinDelivreA && (
        <p className="text-[11px] text-stone-500 mt-3 flex items-start gap-1.5">
          <IdCard className="w-3 h-3 mt-0.5 shrink-0 text-stone-400" />
          <span>
            Numéro sur la fiche : <span className="font-bold tabular-nums text-stone-700">{fiche.cin}</span>
            {fiche.cinDelivreA && ` — délivrée à ${fiche.cinDelivreA}`}
            {fiche.cinDelivreLe && ` le ${jourCourt(fiche.cinDelivreLe)}`}
          </span>
        </p>
      )}

      {ligne.pieces.length === 0 ? (
        <p className="text-xs text-stone-400">Aucun fichier déposé.</p>
      ) : (
        <div className="space-y-2 mt-3">
          {ligne.pieces.map((p) => {
            const te = etatDe(p.statut);
            const tp = ton(te.tonalite);
            const enAttente = p.statut === 'EN_ATTENTE';

            return (
              <div key={p.id} className="bg-surface rounded-xl border border-stone-100 p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <button
                    onClick={() => onApercu(p.id, p.nomFichier)}
                    className="flex items-center gap-2.5 min-w-0 text-start group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-stone-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-stone-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-800 truncate group-hover:text-brand-texte transition-colors">
                        {p.nomFichier}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        {taille(p.taille)} · déposé le {jourCourt(p.deposeLe)}
                        {p.dateExpiration && ` · expire le ${jourCourt(p.dateExpiration)}`}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onApercu(p.id, p.nomFichier)}
                      aria-label="Ouvrir le fichier"
                      title="Ouvrir le fichier"
                      className="p-2 rounded-xl border border-stone-200 text-stone-500 hover:bg-stone-50 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {enAttente && (
                      <>
                        <button
                          onClick={() => {
                            setMotifOuvert(motifOuvert === p.id ? null : p.id);
                            setErreur('');
                          }}
                          disabled={occupe}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Refuser
                        </button>

                        <button
                          onClick={() => decider(p.id, 'VALIDEE')}
                          disabled={occupe}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-40 transition-colors"
                        >
                          {occupe
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          Valider
                        </button>
                      </>
                    )}

                    {!enAttente && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${tp.bg} ${tp.text}`}>
                        {te.libelle}
                      </span>
                    )}
                  </div>
                </div>

                {/* Le motif d'un refus déjà prononcé reste visible : la
                    RH doit voir ce qu'elle a demandé la fois d'avant. */}
                {p.commentaireRH && p.statut === 'REFUSEE' && (
                  <p className="text-xs text-red-600 mt-2.5 pt-2.5 border-t border-stone-100">
                    Motif : {p.commentaireRH}
                  </p>
                )}

                {p.valideeLe && p.statut === 'VALIDEE' && (
                  <p className="text-[10px] text-stone-400 mt-2.5 pt-2.5 border-t border-stone-100">
                    Validée le {jour(p.valideeLe)}
                    {p.valideePar && ` par ${p.valideePar}`}
                  </p>
                )}

                {/* ── Refus : le motif d'abord ── */}
                {motifOuvert === p.id && (
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Que doit corriger le salarié ?
                    </label>
                    <textarea
                      rows={2}
                      value={motif}
                      onChange={(ev) => setMotif(ev.target.value)}
                      placeholder="Le document est illisible : la photo est floue sur la moitié basse."
                      className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 resize-none transition-colors"
                    />

                    {erreur && (
                      <p className="flex items-start gap-1.5 text-xs font-bold text-red-500 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {erreur}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => { setMotifOuvert(null); setMotif(''); setErreur(''); }}
                        className="text-xs font-medium px-3 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
                      >
                        Annuler
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={() => decider(p.id, 'REFUSEE')}
                        disabled={occupe || !motif.trim()}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white disabled:opacity-40 transition-colors"
                      >
                        {occupe
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <X className="w-3.5 h-3.5" />}
                        Refuser la pièce
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* L'erreur d'une VALIDATION. Elle n'avait jusqu'ici qu'un seul
          endroit où s'afficher — le formulaire de refus — donc tout
          échec de validation, y compris un 400 du serveur, se perdait
          en silence : le bouton revenait à la normale et rien ne
          bougeait. */}
      {erreur && !motifOuvert && (
        <p className="flex items-start gap-1.5 text-xs font-bold text-red-500 mt-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {erreur}
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function ValidationDossiersPage() {
  const [attente, setAttente] = useState<DossierEnAttente[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);

  const [chargementListe, setChargementListe] = useState(true);
  const [chargementDossier, setChargementDossier] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [toast, setToast] = useState('');
  const [toutes, setToutes] = useState(false);

  const chargerListe = useCallback(async () => {
    try {
      const res = await api.get('/dossier/a-valider') as any;
      const liste: DossierEnAttente[] = res?.data?.dossiers ?? [];
      setAttente(liste);
      // Le premier dossier s'ouvre tout seul : un écran partagé dont
      // la moitié droite est vide invite à se demander quoi faire.
      setChoisi((actuel) => actuel ?? liste[0]?.employeId ?? null);
    } catch (e) {
      console.error('Chargement des dossiers à valider :', e);
    } finally {
      setChargementListe(false);
    }
  }, []);

  const chargerDossier = useCallback(async (employeId: string) => {
    setChargementDossier(true);
    try {
      const res = await api.get(`/dossier/employes/${employeId}/pieces`) as any;
      setDossier(res?.data ?? null);
    } catch (e) {
      console.error('Chargement du dossier :', e);
      setDossier(null);
    } finally {
      setChargementDossier(false);
    }
  }, []);

  useEffect(() => { chargerListe(); }, [chargerListe]);
  useEffect(() => { if (choisi) chargerDossier(choisi); }, [choisi, chargerDossier]);

  /**
   * Ouvre le fichier dans un onglet.
   *
   * Le serveur renvoie l'octet, pas une adresse : une adresse vers le
   * seau se copie et se colle, et la CIN d'un salarié se retrouve
   * lisible par quelqu'un qui n'y a aucun droit.
   *
   * ── Le paramètre employeId n'est pas facultatif ──
   *
   * `handlerFichier` cherche la pièce dans le dossier de l'appelant,
   * sauf si la RH indique de qui elle veut lire le dossier. Sans ce
   * paramètre, le serveur cherchait la pièce dans le dossier de la
   * RH elle-même et répondait 404 — c'est volontaire de sa part :
   * sans cette règle, n'importe qui lirait la pièce d'un autre en
   * devinant un identifiant.
   */
  const apercu = async (pieceId: string, nomFichier: string) => {
    const employeId = dossier?.employe.id ?? choisi;
    if (!employeId) return;

    try {
      const blob = await api.get(
        `/dossier/pieces/${pieceId}/fichier?employeId=${encodeURIComponent(employeId)}`,
        { responseType: 'blob' },
      ) as unknown as Blob;

      // Un refus revient en JSON : sans ce test, le navigateur
      // ouvrirait un onglet affichant le message d'erreur brut.
      if (blob.type.includes('json') || blob.type.startsWith('text/')) {
        const texte = await blob.text();
        let message = 'Fichier indisponible';
        try { message = JSON.parse(texte)?.erreur ?? message; } catch { /* réponse HTML */ }
        setToast(message);
        return;
      }

      const url = URL.createObjectURL(blob);
      const onglet = window.open(url, '_blank', 'noopener');

      // Bloqueur de fenêtres : on retombe sur un téléchargement.
      if (!onglet) {
        const a = document.createElement('a');
        a.href = url;
        a.download = nomFichier;
        a.click();
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setToast('Impossible d’ouvrir ce fichier');
    }
  };

  const apresDecision = (message: string) => {
    setToast(message);
    chargerListe();
    if (choisi) chargerDossier(choisi);
  };

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return attente;
    return attente.filter((d) =>
      `${d.nom} ${d.poste ?? ''}`.toLowerCase().includes(terme));
  }, [attente, recherche]);

  const totalPieces = attente.reduce((s, d) => s + d.pieces.length, 0);

  const catalogue = dossier?.catalogue ?? {};

  // Par défaut, seules les lignes qui demandent quelque chose. Un
  // dossier complet affiche onze lignes vertes où il n'y a rien à
  // faire ; la RH les regarde quand elle le décide.
  const lignesVisibles = useMemo(() => {
    if (!dossier) return [];
    if (toutes) return dossier.lignes;
    return dossier.lignes.filter(
      (l) => l.statut === 'EN_ATTENTE' || l.statut === 'REFUSEE' || l.statut === 'EXPIREE'
        || (l.obligatoire && l.statut === 'MANQUANTE')
    );
  }, [dossier, toutes]);

  const enAttenteDuDossier = dossier?.lignes.filter((l) => l.statut === 'EN_ATTENTE').length ?? 0;

  // La carte d'identité est-elle déposée et en attente ? De quoi dire à
  // la RH si elle peut relever le numéro tout de suite, ou s'il faut
  // d'abord que le salarié dépose sa carte.
  const cinEnAttente = dossier?.lignes.some(
    (l) => l.type === 'CIN' && l.pieces.some((p) => p.statut === 'EN_ATTENTE'),
  ) ?? false;

  // Les trois mentions, pas seulement le numéro : `pdf.js` refuse
  // d'éditer une attestation s'il en manque une.
  const cinIncomplet = !!dossier && !(
    dossier.employe.cin && dossier.employe.cinDelivreLe && dossier.employe.cinDelivreA
  );

  return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher un salarié…">

        <EnTete
          fil={['Pilotage', 'Dossiers du personnel']}
          titre="Pièces à valider"
          sousTitre={chargementListe ? 'Chargement…'
            : totalPieces > 0
              ? `${totalPieces} pièce${totalPieces > 1 ? 's' : ''} déposée${totalPieces > 1 ? 's' : ''} par ${attente.length} salarié${attente.length > 1 ? 's' : ''}`
              : 'Aucune pièce en attente de relecture'}
        />

        <div className="px-4 sm:px-8 py-6 sm:py-8 space-y-4">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Clock}
              label="Pièces à relire"
              value={chargementListe ? '…' : totalPieces}
              sub="déposées, jamais relues"
              tonalite="amber"
              alerte={totalPieces > 0}
              delai={0}
            />
            <StatCard
              icon={User}
              label="Salariés concernés"
              value={chargementListe ? '…' : attente.length}
              sub="en attente d'une décision"
              tonalite="brand"
              delai={60}
            />
            <StatCard
              icon={FolderCheck}
              label="Dossier ouvert"
              value={dossier ? `${dossier.avancement.pourcentage} %` : '—'}
              sub={dossier
                ? `${dossier.avancement.fournies} sur ${dossier.avancement.obligatoires} pièces obligatoires`
                : 'aucun dossier ouvert'}
              tonalite={dossier && dossier.avancement.pourcentage === 100 ? 'brand' : 'amber'}
              delai={120}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start">

            {/* ── Les salariés ── */}
            <div className={`hrup-monter ${CARTE} overflow-hidden xl:sticky xl:top-6`}>
              <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Nom, poste…"
                    className="w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  {recherche && (
                    <button
                      onClick={() => setRecherche('')}
                      aria-label="Effacer la recherche"
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                    >
                      <X className="w-3.5 h-3.5 text-stone-400" />
                    </button>
                  )}
                </div>
              </div>

              {chargementListe ? (
                <div className="p-4"><Squelette nombre={4} hauteur="h-14" /></div>
              ) : filtres.length === 0 ? (
                <div className="p-8 text-center">
                  <FolderCheck className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {recherche
                      ? `Aucun salarié ne correspond à « ${recherche} »`
                      : 'Tous les dossiers sont à jour.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-stone-50 max-h-[32rem] overflow-y-auto">
                  {filtres.map((d) => {
                    const actif = d.employeId === choisi;
                    return (
                      <button
                        key={d.employeId}
                        onClick={() => setChoisi(d.employeId)}
                        className={`w-full text-start px-4 py-3 transition-colors ${
                          actif ? 'bg-brand-500/10' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-bold truncate ${
                            actif ? 'text-brand-texte' : 'text-stone-800'
                          }`}>
                            {d.nom}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
                            {d.pieces.length}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5 truncate">
                          {d.poste ?? 'Poste non renseigné'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Le dossier ── */}
            <div className="min-w-0">
              {!choisi ? (
                <Vide
                  icone={FolderCheck}
                  message="Aucune pièce à relire"
                  detail="Les documents déposés par les salariés apparaîtront ici dès qu'un dépôt a lieu."
                />
              ) : chargementDossier && !dossier ? (
                <div className={`${CARTE} p-5`}><Squelette nombre={4} hauteur="h-24" /></div>
              ) : !dossier ? (
                <Vide
                  icone={AlertTriangle}
                  message="Dossier illisible"
                  detail="La fiche de ce salarié est introuvable, ou le service est indisponible."
                />
              ) : (
                <div style={{ animationDelay: '180ms' }} className={`hrup-monter ${CARTE} overflow-hidden`}>

                  {/* ── Le salarié ── */}
                  {/* Sur téléphone, le bouton passe sous le nom : à
                      côté, il ne laissait qu'une centaine de pixels et
                      « Nourane Turki » devenait « Nourane … ». */}
                  <div className="px-5 py-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                    <Anneau
                      valeur={dossier.avancement.pourcentage}
                      taille={64}
                      epaisseur={6}
                      tonalite={dossier.avancement.pourcentage === 100 ? 'brand' : 'amber'}
                    />

                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-stone-800 truncate">
                        {dossier.employe.nom}
                      </h3>
                      <p className="text-xs text-stone-500 mt-0.5 truncate">
                        {[dossier.employe.poste, dossier.employe.departement]
                          .filter(Boolean).join(' · ') || 'Poste non renseigné'}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">
                        {dossier.avancement.fournies} sur {dossier.avancement.obligatoires} pièces
                        obligatoires validées
                        {enAttenteDuDossier > 0 && (
                          <span className="text-amber-600 font-semibold">
                            {' · '}{enAttenteDuDossier} à relire
                          </span>
                        )}
                      </p>
                    </div>
                    </div>

                    <button
                      onClick={() => setToutes(!toutes)}
                      className="text-xs font-bold px-3 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors shrink-0 self-start"
                    >
                      {toutes ? 'Ce qui demande une action' : 'Tout le dossier'}
                    </button>
                  </div>

                  {/* Le numéro de CIN vit sur la fiche, le scan dans le
                      dossier. Le bandeau ne se contente plus de signaler
                      le manque : il dit où le combler, et disparaît dès
                      que c'est fait. */}
                  {cinIncomplet && (
                    <div className="mx-5 mt-5 flex items-start gap-2.5 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                      <div className="text-xs text-amber-800 leading-relaxed">
                        <p className="font-bold">
                          {dossier.employe.cin
                            ? "La carte d'identité de ce salarié est incomplète sur sa fiche."
                            : "Le numéro de CIN manque sur la fiche de ce salarié."}
                        </p>
                        <p className="mt-0.5">
                          {cinEnAttente
                            ? "Sa carte est déposée et attend votre relecture : "
                              + "ouvrez le scan et relevez le numéro, sa date et son "
                              + "lieu de délivrance dans la ligne « Carte d'identité "
                              + "nationale » ci-dessous. Les trois partiront sur la "
                              + "fiche avec la validation."
                            : "Tant que les trois mentions ne sont pas renseignées, "
                              + "aucune attestation ne peut être délivrée. Demandez au "
                              + "salarié de déposer sa carte : vous les relèverez en "
                              + "la validant."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Le numéro est là : on dit qui l'a vérifié et quand.
                      Une donnée d'identité sans trace de vérification ne
                      vaut rien devant un contrôle. */}
                  {!cinIncomplet && dossier.employe.cinVerifieLe && (
                    <p className="mx-5 mt-5 flex items-start gap-1.5 text-[11px] text-stone-400">
                      <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
                      <span>
                        Numéro de CIN relevé sur le scan le{' '}
                        {jourCourt(dossier.employe.cinVerifieLe)}
                        {dossier.employe.cinVerifiePar
                          ? ` par ${dossier.employe.cinVerifiePar}`
                          : ''}.
                      </span>
                    </p>
                  )}

                  <div className="p-5 space-y-3">
                    {lignesVisibles.length === 0 ? (
                      <div className="py-10 text-center">
                        <Check className="w-6 h-6 text-brand-texte mx-auto mb-2" />
                        <p className="text-sm font-bold text-stone-800">
                          Rien à relire dans ce dossier
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Toutes les pièces obligatoires sont validées.
                        </p>
                      </div>
                    ) : (
                      lignesVisibles.map((ligne) => (
                        <LigneDossier
                          key={ligne.type}
                          ligne={ligne}
                          definition={catalogue[ligne.type]}
                          employeId={dossier.employe.id}
                          fiche={dossier.employe}
                          onDecision={apresDecision}
                          onApercu={apercu}
                        />
                      ))
                    )}
                  </div>

                  {/* ── Les pièces qui expirent ── */}
                  {/* Une fiche d'aptitude périmée n'est pas une pièce
                      manquante : elle a été validée, puis le temps a
                      passé. Elle mérite son propre avertissement. */}
                  {dossier.lignes.some((l) => l.statut === 'EXPIREE') && (
                    <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
                      <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                      <p className="text-xs text-red-700 leading-relaxed">
                        Une ou plusieurs pièces de ce dossier ont dépassé leur date de
                        validité. Le salarié doit en déposer une nouvelle.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {toast && <Toast message={toast} onClose={() => setToast('')} duree={4000} />}

        <style>{STYLES_ANIMATION}</style>
      </Layout>
    </div>
  );
}