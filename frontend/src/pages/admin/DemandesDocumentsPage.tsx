// src/pages/admin/DemandesDocumentsPage.tsx
//
// Documents administratifs. Deux usages : traiter les demandes des
// salariés, et délivrer un document de sa propre initiative.
//
// Le document n'est généré qu'à l'approbation : c'est la situation de
// l'employé au moment de la signature qui fait foi, pas celle du jour
// de la demande.
//
// ── Ce qui change par rapport à la version précédente ──────────────
//
// 1. Le catalogue vient du SERVEUR. La liste était écrite en dur avec
// quatre types ; le serveur en déclare sept, dont trois qu'il ne
// compose pas — copie de contrat, renouvellement, duplicata de
//    bulletin. Deux listes finissent toujours par diverger.
//
// 2. La modale de traitement demande la CIN. Elle ne la demandait pas,
// alors qu'approuver déclenche la génération du PDF, qui l'exige :
// toute approbation d'une fiche sans CIN échouait en 400 sans que
//    l'écran propose de saisir ce qui manquait.
//
// 3. Mode sombre, aux mêmes teintes que le reste de l'application :
//    `brand` pour ce qui aboutit, `amber` pour ce qui attend, `red`
// pour ce qui est refusé, `stone` pour le reste.
//
// Les textes restent en français : cet écran est interne, et les pages
// traduites sont celles que voit le salarié.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Download, Check, X, CheckCircle2, XCircle, Search,
  Building2, Wallet, ScrollText, CalendarDays, AlertCircle,
  ChevronRight, SlidersHorizontal, Hourglass, ShieldAlert,
  Clock, Send, Plus, IdCard, UserCheck, FileSignature, RefreshCw,
  FileClock, PenLine,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { employesService } from '../../services/employes';
import api from '../../services/api';

const ACCENT = '#4F46E5';
const PAR_PAGE = 9;

type Statut = 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE';

// Les trois statuts que le serveur sait filtrer. `ANNULEE` n'en fait
// pas partie : une demande retirée par le salarié n'a rien à faire dans
// la file de la RH, et le serveur refuse d'ailleurs ce filtre.
const STATUTS: Statut[] = ['EN_ATTENTE', 'APPROUVEE', 'REFUSEE'];

interface Demande {
 id: string;
  employeId: string;
  employeNom: string;
  employeEmail: string;
  poste?: string;
  departement?: string;
 type: string;
  typeLibelle: string;
  motif?: string;
  destinataire?: string;
 statut: Statut;
  demandeLe: string;
  traiteLe?: string;
  traitePar?: string;
  commentaireRH?: string;
  pdfKey?: string;
  origine?: 'SALARIE' | 'RH';
}

interface TypeServeur {
 libelle: string;
 description: string;
 confidentiel: boolean;
 genere: boolean;
}

// ── Apparence ──────────────────────────────────────────────────────

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  ATTESTATION_TRAVAIL: Building2,
  ATTESTATION_SALAIRE: Wallet,
  ATTESTATION_CONGES: CalendarDays,
  CERTIFICAT_TRAVAIL: ScrollText,
  COPIE_CONTRAT: FileSignature,
  RENOUVELLEMENT_CONTRAT: RefreshCw,
  DUPLICATA_BULLETIN: FileClock,
};

// L'ordre d'affichage suit la fréquence d'usage. Un type inconnu du
// serveur n'apparaît pas ; un type connu mais absent d'ici se range à
// la fin plutôt que de disparaître.
const ORDRE = [
  'ATTESTATION_TRAVAIL', 'ATTESTATION_SALAIRE', 'ATTESTATION_CONGES',
  'CERTIFICAT_TRAVAIL', 'COPIE_CONTRAT', 'RENOUVELLEMENT_CONTRAT',
  'DUPLICATA_BULLETIN',
];

const rang = (cle: string) => {
 const i = ORDRE.indexOf(cle);
 return i === -1 ? ORDRE.length : i;
};

const STYLE_STATUT: Record<Statut, {
 libelle: string; bg: string; text: string; bord: string;
 barre: string; icone: React.ComponentType<{ className?: string }>;
}> = {
  EN_ATTENTE: {
 libelle: 'À traiter',
 bg: 'bg-amber-50',
 text: 'text-amber-600',
 bord: 'border-amber-200',
 barre: 'bg-amber-400',
 icone: Hourglass,
  },
  APPROUVEE: {
 libelle: 'Délivrée',
 bg: 'bg-brand-500/10',
 text: 'text-brand-texte',
 bord: 'border-stone-100',
 barre: 'bg-brand-500',
 icone: CheckCircle2,
  },
  REFUSEE: {
 libelle: 'Refusée',
 bg: 'bg-red-50',
 text: 'text-red-500',
 bord: 'border-stone-100',
 barre: 'bg-red-400',
 icone: XCircle,
  },
};

const ONGLETS: [Statut | 'tous', string][] = [
  ['tous', 'Toutes'],
  ['EN_ATTENTE', 'À traiter'],
  ['APPROUVEE', 'Délivrées'],
  ['REFUSEE', 'Refusées'],
];

const CARTE = 'bg-surface rounded-2xl shadow-sm border border-stone-100';
const TITRE = 'text-stone-800';
const SOUS = 'text-stone-500';
const DOUX = 'text-stone-400';
const CHAMP = 'w-full px-3 py-2.5 text-sm bg-stone-50 '
  + 'border border-stone-200 rounded-xl '
  + TITRE + ' focus:outline-none focus:border-brand-500 transition-colors';

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];
const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];
const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/**
 * Ancienneté de la demande. Au-delà de 24 h, le salarié relance : la
 * signaler évite qu'une demande dorme dans la file.
 */
function anciennete(iso: string): { texte: string; urgent: boolean } {
 const heures = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
 if (heures < 1) return { texte: "à l'instant", urgent: false };
 if (heures < 24) return { texte: `il y a ${heures} h`, urgent: heures >= 20 };
 const jours = Math.floor(heures / 24);
 return { texte: `il y a ${jours} j`, urgent: true };
}

async function telechargerDocument(demande: Demande) {
 const blob = await api.get(`/documents/demandes/${demande.id}/fichier`, {
    responseType: 'blob',
  }) as unknown as Blob;

  // Une réponse d'erreur arrive elle aussi sous forme de Blob : sans ce
  // contrôle, un message JSON serait enregistré avec l'extension .pdf.
 if (blob.type !== 'application/pdf') {
 const texte = await blob.text();
 let message = 'Document indisponible';
 try {
 const json = JSON.parse(texte);
 message = json?.message ?? json?.erreur ?? message;
    } catch { /* réponse HTML */ }
 throw new Error(message);
  }

 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
  a.href = url;
  a.download = `${demande.typeLibelle} - ${demande.employeNom}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Composants partagés ────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, fond, texte, alerte, actif, onClick }: {
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 value: string | number;
  sub?: string;
 fond: string;
 texte: string;
  alerte?: boolean;
  actif?: boolean;
  onClick?: () => void;
}) {
 const Balise = onClick ? 'button' : 'div';
 return (
    <Balise
      onClick={onClick}
      className={`bg-surface rounded-2xl shadow-sm border p-5 text-start w-full transition-all ${
 actif ? 'border-brand-500 ring-1 ring-brand-500/20'
          : alerte ? 'border-amber-200 ring-1 ring-amber-100'
          : 'border-stone-100'
      } ${onClick ? 'hover:shadow-md cursor-pointer' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${fond}`}>
        <Icon className={`w-4 h-4 ${texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${texte}`}>{value}</p>
      <p className={`text-xs ${SOUS} mt-0.5`}>{label}</p>
      {sub && <p className={`text-[10px] ${DOUX} mt-1`}>{sub}</p>}
    </Balise>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
 const timer = setTimeout(onClose, 3500);
 return () => clearTimeout(timer);
  }, [onClose]);

 return (
    <div className="fixed top-6 end-6 z-[60]">
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-[17rem]">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Alerte({ message }: { message: string }) {
 return (
    <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-red-50 text-red-500">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
    </div>
  );
}

// ── Bloc d'identité civile ─────────────────────────────────────────
//
// Les trois mentions que porte une attestation tunisienne. Sans elles,
// le document est refusé au guichet, et le serveur refuse de le
// produire. Le bloc est partagé par les deux modales : la délivrance
// directe le demandait déjà, le traitement d'une demande ne le
// demandait pas — et c'était la cause des échecs à l'approbation.

function BlocCin({ cin, setCin, cinDelivreLe, setCinDelivreLe, cinDelivreA, setCinDelivreA, manquant, connu }: {
 cin: string; setCin: (v: string) => void;
  cinDelivreLe: string; setCinDelivreLe: (v: string) => void;
  cinDelivreA: string; setCinDelivreA: (v: string) => void;
 manquant: boolean;
 connu: boolean;
}) {
 const petitChamp = 'w-full px-3 py-2 text-sm bg-surface border border-stone-200 '
    + ' rounded-xl ' + TITRE
    + ' focus:outline-none focus:border-brand-500';

 return (
    <div className={`rounded-xl p-4 ${
 manquant ? 'bg-amber-50' : 'bg-stone-50'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <IdCard className={`w-4 h-4 ${manquant ? 'text-amber-600' : 'text-brand-texte'}`} />
        <span className={`text-xs font-semibold ${TITRE} uppercase tracking-wider`}>
          Carte d'identité nationale
        </span>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className={`block text-[10px] font-medium ${SOUS} mb-1`}>Numéro de CIN</label>
          <input
            value={cin}
            onChange={(e) => setCin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="8 chiffres"
            className={`${petitChamp} font-mono`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={`block text-[10px] font-medium ${SOUS} mb-1`}>Délivrée le</label>
            <input
              type="date"
              value={cinDelivreLe}
              onChange={(e) => setCinDelivreLe(e.target.value)}
              className={petitChamp}
            />
          </div>
          <div>
            <label className={`block text-[10px] font-medium ${SOUS} mb-1`}>Délivrée à</label>
            <input
              value={cinDelivreA}
              onChange={(e) => setCinDelivreA(e.target.value)}
              placeholder="Tunis, Sfax…"
              className={petitChamp}
            />
          </div>
        </div>
      </div>

      {connu && manquant && (
        <p className="text-xs text-amber-600 mt-2.5">
          Ces données manquent sur la fiche du salarié. Elles y seront enregistrées
 pour les prochaines attestations.
        </p>
      )}
    </div>
  );
}

/** Les trois champs d'identité, dans un état réutilisable */
function useCin(employe: any, actif: boolean) {
 const [cin, setCin] = useState('');
 const [cinDelivreLe, setCinDelivreLe] = useState('');
 const [cinDelivreA, setCinDelivreA] = useState('');

  // Préremplissage depuis la fiche : la RH ne ressaisit pas ce qui est
  // déjà connu.
  useEffect(() => {
    setCin(employe?.cin ?? '');
    setCinDelivreLe(employe?.cinDelivreLe?.slice(0, 10) ?? '');
    setCinDelivreA(employe?.cinDelivreA ?? '');
  }, [employe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

 const manquant = actif && (!cin.trim() || !cinDelivreLe || !cinDelivreA.trim());

 return {
    cin, setCin, cinDelivreLe, setCinDelivreLe, cinDelivreA, setCinDelivreA,
    manquant,
 charge: () => ({
 cin: cin.trim(),
      cinDelivreLe,
      cinDelivreA: cinDelivreA.trim(),
    }),
  };
}

// ── Délivrance directe ─────────────────────────────────────────────

function ModalDelivrance({ employes, types, onClose, onSuccess }: {
 employes: any[];
 types: Record<string, TypeServeur>;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
 const [employeId, setEmployeId] = useState('');
 const [type, setType] = useState('ATTESTATION_TRAVAIL');
 const [destinataire, setDestinataire] = useState('');
 const [envoi, setEnvoi] = useState(false);
 const [erreur, setErreur] = useState('');

 const employe = employes.find((e) => e.id === employeId);
 const definition = types[type];
  // Seuls les documents que l'application compose ont besoin de la CIN.
 const compose = definition?.genere !== false;
 const identite = useCin(employe, compose);

 const valider = async () => {
 if (!employeId) { setErreur('Sélectionnez un salarié'); return; }
 if (identite.manquant) {
      setErreur('Le numéro de CIN, sa date et son lieu de délivrance sont requis.');
      return;
    }

    setEnvoi(true);
    setErreur('');
 try {
 await api.post('/documents/delivrer', {
        employeId,
        type,
 destinataire: destinataire.trim() || null,
        ...(compose ? identite.charge() : {}),
      });
      onSuccess(`${definition?.libelle ?? type} — ${employe.prenom} ${employe.nom}`);
      onClose();
    } catch (e: any) {
      setErreur(e?.response?.data?.message ?? e?.erreur ?? 'Impossible de générer le document');
      setEnvoi(false);
    }
  };

 const liste = Object.entries(types).sort(([a], [b]) => rang(a) - rang(b));

 return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className={`font-bold text-lg ${TITRE}`}>Délivrer un document</h2>
            <p className={`text-xs ${SOUS} mt-0.5`}>Sans attendre une demande du salarié</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className={`w-5 h-5 ${SOUS}`} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && <Alerte message={erreur} />}

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-1.5`}>Salarié</label>
            <select value={employeId} onChange={(e) => setEmployeId(e.target.value)} className={CHAMP}>
              <option value="">Sélectionner…</option>
              {employes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.prenom} {e.nom} — {e.poste ?? 'poste non renseigné'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-2`}>Type de document</label>
            <div className="grid grid-cols-2 gap-2">
              {liste.map(([cle, def]) => {
 const Icone = ICONES[cle] ?? FileText;
 const choisi = type === cle;
 return (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => setType(cle)}
                    className={`flex items-start gap-2 p-3 rounded-xl border text-start transition-all ${
 choisi
                        ? 'bg-brand-500/10 border-brand-500'
                        : 'bg-surface border-stone-200 hover:border-brand-500'
                    }`}
                  >
                    <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${choisi ? 'text-brand-texte' : DOUX}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-[11px] font-bold leading-tight ${
 choisi ? 'text-brand-texte' : SOUS
                        }`}>
                          {def.libelle}
                        </span>
                        {def.confidentiel && (
                          <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                      </div>
                      {/* Un document que l'application ne compose pas se
 remet par d'autres moyens : le dire ici évite
                          d'attendre un PDF qui ne viendra pas. */}
                      {def.genere === false && (
                        <span className={`text-[9px] ${DOUX}`}>remis manuellement</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {compose ? (
            <BlocCin {...identite} connu={!!employeId} />
          ) : (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${SOUS} bg-stone-50`}>
              <PenLine className="w-4 h-4 mt-0.5 shrink-0" />
              Ce document n'est pas composé par l'application. L'enregistrer ici le
 trace et prévient le salarié ; la remise se fait par vos moyens habituels.
            </div>
          )}

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-1.5`}>
              Destinataire (optionnel)
            </label>
            <input
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              placeholder="Banque, consulat, bailleur…"
              className={CHAMP}
            />
            <p className={`text-xs ${DOUX} mt-1.5`}>
              Sans destinataire, la mention « pour servir et valoir ce que de droit »
 est portée sur le document.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium ${SOUS} hover:bg-stone-50 transition-colors`}
            >
              Annuler
            </button>
            <button
              onClick={valider}
              disabled={envoi}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FileText className="w-4 h-4" />}
              {envoi ? 'Enregistrement…' : compose ? 'Générer et délivrer' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modale de traitement ───────────────────────────────────────────

function ModalTraitement({ demande, employe, definition, decision, onClose, onSuccess }: {
 demande: Demande;
 employe: any;
  definition?: TypeServeur;
 decision: 'APPROUVEE' | 'REFUSEE';
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
 const [commentaire, setCommentaire] = useState('');
 const [envoi, setEnvoi] = useState(false);
 const [erreur, setErreur] = useState('');

 const approbation = decision === 'APPROUVEE';
 const compose = definition?.genere !== false;
  // La CIN n'est réclamée qu'à l'approbation d'un document composé :
  // un refus n'a rien à produire.
 const identite = useCin(employe, approbation && compose);

 const Icone = ICONES[demande.type] ?? FileText;

 const valider = async () => {
 if (!approbation && !commentaire.trim()) {
      setErreur('Indiquez le motif du refus : il sera transmis au salarié.');
      return;
    }
 if (approbation && compose && identite.manquant) {
      setErreur(
        "Le numéro de CIN, sa date et son lieu de délivrance sont requis pour "
        + "générer ce document."
      );
      return;
    }

    setEnvoi(true);
    setErreur('');
 try {
 await api.put(`/documents/demandes/${demande.id}`, {
 statut: decision,
 commentaire: commentaire.trim(),
        // Envoyés avec la décision : le serveur les enregistre sur la
        // fiche, et la prochaine attestation ne les redemandera pas.
        ...(approbation && compose ? identite.charge() : {}),
      });
      onSuccess(
 approbation
          ? `${demande.typeLibelle} — ${demande.employeNom}`
          : `Demande de ${demande.employeNom} refusée`
      );
      onClose();
    } catch (e: any) {
      setErreur(e?.response?.data?.message ?? e?.erreur ?? 'Impossible de traiter la demande');
      setEnvoi(false);
    }
  };

 return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
 approbation ? 'bg-brand-500/10' : 'bg-red-50'
            }`}>
              <Icone className={`w-5 h-5 ${
 approbation ? 'text-brand-texte' : 'text-red-500'
              }`} />
            </div>
            <div className="min-w-0">
              <h2 className={`font-bold text-lg ${TITRE}`}>
                {approbation ? (compose ? 'Délivrer le document' : 'Marquer comme traité') : 'Refuser la demande'}
              </h2>
              <p className={`text-sm ${SOUS} truncate`}>
                {demande.employeNom} · {demande.typeLibelle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className={`w-5 h-5 ${SOUS}`} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && <Alerte message={erreur} />}

          <div className="bg-stone-50 rounded-xl p-4">
            <div className={`text-xs font-semibold ${TITRE} uppercase tracking-wider mb-3`}>
              Demande
            </div>

            <div className="bg-surface rounded-lg p-3 space-y-1.5">
              {demande.poste && (
                <div className="flex justify-between text-xs">
                  <span className={SOUS}>Poste</span>
                  <span className={`font-medium ${TITRE}`}>{demande.poste}</span>
                </div>
              )}
              {demande.departement && (
                <div className="flex justify-between text-xs">
                  <span className={SOUS}>Département</span>
                  <span className={`font-medium ${TITRE}`}>{demande.departement}</span>
                </div>
              )}
              {demande.destinataire && (
                <div className="flex justify-between text-xs">
                  <span className={SOUS}>Destinataire</span>
                  <span className={`font-medium ${TITRE}`}>{demande.destinataire}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className={SOUS}>Demandé</span>
                <span className={`font-medium ${TITRE}`}>
                  {anciennete(demande.demandeLe).texte}
                </span>
              </div>
              {demande.motif && (
                <p className={`text-xs ${SOUS} italic pt-1.5 border-t border-stone-100`}>
                  {demande.motif}
                </p>
              )}
            </div>
          </div>

          {approbation && definition?.confidentiel && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-amber-50 text-amber-600">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              Ce document mentionne la rémunération du salarié, salaire brut et moyenne
 des trois derniers bulletins compris.
            </div>
          )}

          {/* Le bloc qui manquait : approuver déclenche la génération du
              PDF, qui exige ces trois mentions. Sans lui, l'approbation
              échouait en 400 sans proposer de saisir quoi que ce soit. */}
          {approbation && compose && (
            <BlocCin {...identite} connu={!!employe} />
          )}

          {approbation && !compose && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${SOUS} bg-stone-50`}>
              <PenLine className="w-4 h-4 mt-0.5 shrink-0" />
              Ce document n'est pas composé par l'application : aucun PDF ne sera
              produit. Le salarié verra la demande traitée et votre réponse.
            </div>
          )}

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-1.5`}>
              {approbation ? 'Commentaire (optionnel)' : 'Motif du refus (requis)'}
            </label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder={approbation
                ? 'Visible par le salarié'
                : 'Expliquez pourquoi la demande ne peut pas aboutir'}
              className={`${CHAMP} resize-none`}
            />
          </div>

          {approbation && compose && (
            <p className={`text-xs ${DOUX}`}>
              Le document sera généré avec la situation du salarié à cet instant,
 puis mis à sa disposition.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium ${SOUS} hover:bg-stone-50 transition-colors`}
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
              {envoi ? 'Traitement…' : approbation ? (compose ? 'Générer' : 'Valider') : 'Refuser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Carte d'une demande ────────────────────────────────────────────

function CarteDemande({ demande, definition, onTraiter, onTelecharger }: {
 demande: Demande;
  definition?: TypeServeur;
  onTraiter: (decision: 'APPROUVEE' | 'REFUSEE') => void;
  onTelecharger: () => void;
}) {
 const Icone = ICONES[demande.type] ?? FileText;
 const style = STYLE_STATUT[demande.statut];
 const StatutIcone = style.icone;
 const age = anciennete(demande.demandeLe);
 const attente = demande.statut === 'EN_ATTENTE';

 return (
    <div
      className={`bg-surface rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
 attente && age.urgent ? 'border-amber-200' : style.bord
      }`}
    >
      {/* Barre de statut : l'état se lit avant même le texte */}
      <div className={`h-1 ${style.barre}`} />

      <div className="p-5 flex-1 flex flex-col">

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
              <Icone className="w-5 h-5 text-brand-texte" />
            </div>
            <div className="min-w-0">
              <h4 className={`text-sm font-bold ${TITRE} truncate`}>{demande.typeLibelle}</h4>
              <p className={`text-[10px] ${
                age.urgent && attente ? 'text-amber-600 font-bold' : DOUX
              }`}>
                {demande.origine === 'RH' ? 'Délivré' : 'Demandé'} {age.texte}
              </p>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${style.bg} ${style.text}`}>
            <StatutIcone className="w-2.5 h-2.5" />
            {style.libelle}
          </span>
        </div>

        <div className="flex items-center gap-2.5 py-3 border-y border-stone-100">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ backgroundColor: couleurDe(demande.employeNom) }}
          >
            {initiales(demande.employeNom)}
          </div>
          <div className="min-w-0">
            <div className={`text-xs font-bold ${TITRE} truncate`}>{demande.employeNom}</div>
            <div className={`text-[10px] ${DOUX} truncate`}>
              {demande.poste ?? demande.departement ?? demande.employeEmail}
            </div>
          </div>
        </div>

        <div className="py-3 space-y-1.5 flex-1">
          {/* Une délivrance d'office n'est pas une demande traitée :
 la distinction compte pour l'audit. */}
          {demande.origine === 'RH' && (
            <div className="flex items-center gap-1.5 text-[10px] text-blue-600">
              <UserCheck className="w-3 h-3 shrink-0" />
              Délivré à l'initiative de la RH
            </div>
          )}

          {definition?.genere === false && (
            <div className={`flex items-center gap-1.5 text-[10px] ${DOUX}`}>
              <PenLine className="w-3 h-3 shrink-0" />
              Remis manuellement, sans PDF
            </div>
          )}

          {demande.destinataire && (
            <div className="flex items-start gap-1.5 text-[11px]">
              <Send className={`w-3 h-3 ${DOUX} shrink-0 mt-0.5`} />
              <span className={SOUS}>Pour {demande.destinataire}</span>
            </div>
          )}

          {demande.motif && (
            <p className={`text-[11px] ${SOUS} italic line-clamp-2 ps-2 border-s-2 border-stone-100`}>
              {demande.motif}
            </p>
          )}

          {definition?.confidentiel && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
              <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
              Mentionne la rémunération
            </div>
          )}

          {demande.commentaireRH && (
            <div className={`text-[10px] ${SOUS} bg-stone-50 rounded-lg px-2 py-1.5`}>
              <span className="font-bold">Réponse :</span> {demande.commentaireRH}
            </div>
          )}
        </div>

        {attente ? (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onTraiter('REFUSEE')}
              className={`flex items-center justify-center gap-1.5 flex-1 border border-stone-200 rounded-xl py-2 text-xs font-bold ${SOUS} hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors`}
            >
              <X className="w-3.5 h-3.5" />
              Refuser
            </button>
            <button
              onClick={() => onTraiter('APPROUVEE')}
              className="flex items-center justify-center gap-1.5 flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2 text-xs font-bold transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {definition?.genere === false ? 'Valider' : 'Délivrer'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className={`text-[10px] ${DOUX} truncate`}>
              {demande.traitePar ? `Par ${demande.traitePar}` : 'Traité'}
            </span>
            {demande.pdfKey && (
              <button
                onClick={onTelecharger}
                className="flex items-center gap-1.5 text-xs font-bold text-brand-texte hover:underline shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function DemandesDocumentsPage() {
 const [demandes, setDemandes] = useState<Demande[]>([]);
 const [types, setTypes] = useState<Record<string, TypeServeur>>({});
 const [employes, setEmployes] = useState<any[]>([]);
 const [chargement, setChargement] = useState(true);
 const [recherche, setRecherche] = useState('');
 const [onglet, setOnglet] = useState<Statut | 'tous'>('tous');
 const [filtreType, setFiltreType] = useState('tous');
 const [menuOuvert, setMenuOuvert] = useState(false);
 const [page, setPage] = useState(0);
 const [toast, setToast] = useState('');
 const [delivrance, setDelivrance] = useState(false);
 const [traitement, setTraitement] = useState<{
 demande: Demande; decision: 'APPROUVEE' | 'REFUSEE';
  } | null>(null);

 const menuRef = useRef<HTMLDivElement>(null);

  // Un clic hors du menu le referme : sans cela, il resterait ouvert
  // et masquerait la liste qu'il sert à filtrer.
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

      // Un appel par statut : sans le paramètre, le serveur ne renvoie
      // que les demandes en attente, d'où les compteurs à zéro.
 const [reponses, empRes] = await Promise.all([
        Promise.all(
          STATUTS.map((statut) =>
            api.get('/documents/demandes', { params: { statut } })
              // Selon l'enveloppe de ton client HTTP, le corps est
              // sous `.data` ou à la racine : les deux sont acceptés.
              .then((r: any) => r?.data ?? r ?? {})
              .catch(() => ({}))
          )
        ),
        employesService.lister().catch(() => ({ data: { employes: [] } })) as any,
      ]);

      // Une même demande peut revenir de deux appels si le serveur
      // ignore le filtre : la clé évite les doublons.
 const uniques = new Map<string, Demande>();
 for (const corps of reponses) {
 for (const d of (corps.demandes ?? []) as Demande[]) uniques.set(d.id, d);
      }
      setDemandes([...uniques.values()]);

      // Le catalogue vient du serveur, pas d'une liste écrite ici.
 const catalogue = reponses.find((r: any) => r?.types)?.types;
 if (catalogue) setTypes(catalogue);

 const liste: any[] = empRes?.data?.employes ?? [];
      setEmployes(liste.filter((e) => String(e.statut).toLowerCase() === 'actif'));
    } catch (e) {
      console.error('Chargement des demandes :', e);
      setDemandes([]);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);
  useEffect(() => { setPage(0); }, [recherche, onglet, filtreType]);

 const filtrees = useMemo(() => {
 const terme = recherche.trim().toLowerCase();
 return demandes
      .filter((d) => {
 if (onglet !== 'tous' && d.statut !== onglet) return false;
 if (filtreType !== 'tous' && d.type !== filtreType) return false;
 if (!terme) return true;
 return `${d.employeNom} ${d.employeEmail} ${d.typeLibelle} ${d.departement ?? ''}`
          .toLowerCase().includes(terme);
      })
      // Les demandes à traiter remontent : ce sont les seules qui
      // appellent une action.
      .sort((a, b) => {
 const aAttente = a.statut === 'EN_ATTENTE' ? 0 : 1;
 const bAttente = b.statut === 'EN_ATTENTE' ? 0 : 1;
 if (aAttente !== bAttente) return aAttente - bAttente;
 return String(b.demandeLe).localeCompare(String(a.demandeLe));
      });
  }, [demandes, recherche, onglet, filtreType]);

 const pageCourante = useMemo(
    () => filtrees.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtrees, page]
  );

 const parStatut = (s: Statut) => demandes.filter((d) => d.statut === s).length;

 const enRetard = demandes.filter(
    (d) => d.statut === 'EN_ATTENTE' && anciennete(d.demandeLe).urgent
  ).length;

 const telecharger = async (d: Demande) => {
 try { await telechargerDocument(d); }
 catch (e: any) { setToast(e.message); }
  };

  // Les cartes d'indicateurs changent d'onglet : deux usages pour un
  // seul élément d'interface.
 const basculerOnglet = (s: Statut) =>
    setOnglet((actuel) => (actuel === s ? 'tous' : s));

 const listeTypes = Object.entries(types).sort(([a], [b]) => rang(a) - rang(b));

 return (
    <div className="min-h-screen">
      <Layout searchPlaceholder="Rechercher une demande…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200 gap-4 flex-wrap">
          <div>
            <nav className={`flex text-xs ${SOUS} mb-2 gap-2 items-center`}>
              <span>Administration</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Documents</span>
            </nav>
            <h2 className={`text-3xl font-bold ${TITRE}`}>Documents</h2>
            <p className={`${SOUS} mt-1`}>
              {chargement ? 'Chargement…' : (
                <>
                  {filtrees.length} document{filtrees.length > 1 ? 's' : ''} sur {demandes.length}
                  {parStatut('EN_ATTENTE') > 0 && (
                    <span className="text-amber-600 font-semibold">
                      {' · '}{parStatut('EN_ATTENTE')} à traiter
                    </span>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-52">
              <Search className={`absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 ${DOUX}`} />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, département…"
                className={`w-full ps-9 pe-8 py-2 rounded-xl border border-stone-200 text-sm bg-surface shadow-sm ${TITRE} focus:outline-none focus:border-brand-500`}
              />
              {recherche && (
                <button
                  onClick={() => setRecherche('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-100"
                >
                  <X className={`w-3.5 h-3.5 ${DOUX}`} />
                </button>
              )}
            </div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOuvert(!menuOuvert)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border shadow-sm transition-colors ${
                  menuOuvert || filtreType !== 'tous'
                    ? 'bg-brand-500 text-white border-brand-500'
                    : `bg-surface ${SOUS} border-stone-200 hover:bg-stone-50`
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Type
                {filtreType !== 'tous' && (
                  <span className="bg-surface text-brand-texte text-[10px] font-bold px-1.5 rounded-full">1</span>
                )}
              </button>

              {menuOuvert && (
                <div className={`absolute end-0 top-full mt-2 w-64 bg-surface rounded-2xl shadow-xl border border-stone-100 p-4 z-30`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase tracking-widest ${DOUX}`}>
                      Type de document
                    </span>
                    {filtreType !== 'tous' && (
                      <button
                        onClick={() => setFiltreType('tous')}
                        className={`text-xs font-medium ${SOUS} hover:text-stone-700`}
                      >
                        Effacer
                      </button>
                    )}
                  </div>

                  <select
                    value={filtreType}
                    onChange={(e) => setFiltreType(e.target.value)}
                    className={CHAMP}
                  >
                    <option value="tous">Tous les types</option>
                    {listeTypes.map(([cle, def]) => (
                      <option key={cle} value={cle}>{def.libelle}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={() => setDelivrance(true)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Délivrer
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs, cliquables ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              icon={Hourglass}
              label="À traiter"
              value={chargement ? '…' : parStatut('EN_ATTENTE')}
              sub={parStatut('EN_ATTENTE') > 0 ? 'action requise' : 'file vide'}
              fond="bg-amber-50"
              texte="text-amber-600"
              alerte={parStatut('EN_ATTENTE') > 0}
              actif={onglet === 'EN_ATTENTE'}
              onClick={() => basculerOnglet('EN_ATTENTE')}
            />
            <StatCard
              icon={CheckCircle2}
              label="Délivrées"
              value={chargement ? '…' : parStatut('APPROUVEE')}
              sub="documents générés"
              fond="bg-brand-500/10"
              texte="text-brand-texte"
              actif={onglet === 'APPROUVEE'}
              onClick={() => basculerOnglet('APPROUVEE')}
            />
            <StatCard
              icon={XCircle}
              label="Refusées"
              value={chargement ? '…' : parStatut('REFUSEE')}
              sub="demandes non abouties"
              fond="bg-red-50"
              texte="text-red-500"
              actif={onglet === 'REFUSEE'}
              onClick={() => basculerOnglet('REFUSEE')}
            />
            <StatCard
              icon={Clock}
              label="En attente depuis 24 h"
              value={chargement ? '…' : enRetard}
              sub="le salarié risque de relancer"
              fond="bg-purple-50"
              texte="text-purple-600"
            />
          </div>

          {/* ── Onglets ── */}
          <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl p-1 shadow-sm w-fit mb-5">
            {ONGLETS.map(([cle, libelle]) => {
 const nb = cle === 'tous' ? demandes.length : parStatut(cle as Statut);
 const actif = onglet === cle;
 return (
                <button
                  key={cle}
                  onClick={() => setOnglet(cle)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
 actif ? 'bg-brand-500 text-white' : `${SOUS} hover:bg-stone-50`
                  }`}
                >
                  {libelle}
                  <span className={`text-[10px] px-1.5 rounded-full ${
 actif ? 'bg-white/25' : 'bg-stone-100'
                  }`}>
                    {chargement ? '…' : nb}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Cartes ── */}
          {chargement ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`${CARTE} p-5 animate-pulse`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-stone-100 rounded w-28" />
                      <div className="h-2.5 bg-stone-100 rounded w-20" />
                    </div>
                  </div>
                  <div className="h-10 bg-stone-50 rounded-lg mb-3" />
                  <div className="h-8 bg-stone-50 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filtrees.length === 0 ? (
            <div className={`${CARTE} p-16 text-center`}>
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <FileText className={`w-6 h-6 ${DOUX}`} />
              </div>
              <p className={`text-sm font-bold ${TITRE} mb-1`}>Aucun document</p>
              <p className={`text-xs ${SOUS} mb-3`}>
                {recherche ? `Aucun résultat pour « ${recherche} »`
                  : onglet !== 'tous' || filtreType !== 'tous'
                    ? 'Aucun document ne correspond aux filtres'
                    : 'Délivrez un document ou attendez une demande'}
              </p>
              {onglet === 'tous' && filtreType === 'tous' && !recherche && (
                <button
                  onClick={() => setDelivrance(true)}
                  className="text-sm font-bold text-brand-texte hover:underline"
                >
                  Délivrer un document
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pageCourante.map((d) => (
                  <CarteDemande
                    key={d.id}
                    demande={d}
                    definition={types[d.type]}
                    onTraiter={(decision) => setTraitement({ demande: d, decision })}
                    onTelecharger={() => telecharger(d)}
                  />
                ))}
              </div>

              <div className={`${CARTE} mt-4 overflow-hidden`}>
                <Pagination
                  page={page}
                  taillePage={PAR_PAGE}
                  total={filtrees.length}
                  onPage={setPage}
                  libelle="document"
                  accent={ACCENT}
                />
              </div>
            </>
          )}

          {/* ── Documents délivrables ── */}
          {/* Rappeler ce que chaque document contient évite les échanges
 de courriels avec le salarié. */}
          <div className={`${CARTE} p-5 mt-4`}>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-brand-texte" />
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${DOUX}`}>
                Documents délivrables
              </h4>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {listeTypes.map(([cle, def]) => {
 const Icone = ICONES[cle] ?? FileText;
 return (
                  <button
                    key={cle}
                    onClick={() => setDelivrance(true)}
                    className="flex items-start gap-2.5 text-start hover:bg-stone-50 rounded-xl p-2 -m-2 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center shrink-0">
                      <Icone className={`w-4 h-4 ${DOUX}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-bold ${SOUS} truncate`}>{def.libelle}</span>
                        {def.confidentiel && <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <p className={`text-[10px] ${DOUX}`}>{def.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className={`text-xs ${DOUX} mt-4 pt-3 border-t border-stone-100`}>
              Chaque attestation porte le numéro de CIN du salarié, sa date et son lieu
 de délivrance, ainsi que le matricule fiscal et l'affiliation CNSS de la
              société. Le document est généré à la signature : c'est la situation du
              salarié à cet instant qui fait foi. Le certificat de travail suit
              l'article 27 du Code du travail, dont les mentions sont limitatives.
            </p>
          </div>
        </div>

        {delivrance && (
          <ModalDelivrance
            employes={employes}
            types={types}
            onClose={() => setDelivrance(false)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}

        {traitement && (
          <ModalTraitement
            demande={traitement.demande}
            employe={employes.find((e) => e.id === traitement.demande.employeId)}
            definition={types[traitement.demande.type]}
            decision={traitement.decision}
            onClose={() => setTraitement(null)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
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