// src/pages/employee/MesDocumentsPage.tsx
//
// Deux volets, parce que le salarié a deux rapports distincts aux
// documents de l'entreprise : ceux qu'il FOURNIT — contrat signé, CIN,
// fiche d'aptitude — et ceux qu'il DEMANDE — attestations, certificat,
// renouvellement de contrat.
//
// Les deux listes viennent du serveur, catalogues compris. La page ne
// redéclare aucune liste de pièces : deux listes finissent par diverger,
// et c'est en démonstration qu'on s'en aperçoit.
//
// Sur le thème : aucune variante sombre. Le reste de l'application est
// en thème clair, et Tailwind déclenche ces variantes sur le réglage du
// SYSTÈME D'EXPLOITATION tant que `darkMode: 'class'` n'est pas déclaré
// dans tailwind.config. Une page qui en porte bascule donc toute seule
// quand Windows est en sombre, pendant que les autres restent claires.
// Les teintes ci-dessous sont exactement celles des autres écrans.
//
// Sur l'arabe : aucune marge ni bordure directionnelle en dur. Tout
// passe par les propriétés logiques — `ps-`, `pe-`, `text-start`,
// `border-s-` — et les chevrons par `rtl:rotate-180`.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileText, Download, Plus, X, Clock, CheckCircle2, XCircle,
  AlertTriangle, Building2, Wallet, ScrollText, CalendarDays,
  ChevronRight, Search, Hourglass, UploadCloud, ShieldCheck,
  IdCard, BadgeCheck, GraduationCap, Landmark, Camera, Gavel,
  Home, FileSignature, FileClock, RefreshCw, Scale, Paperclip,
  FolderOpen, Inbox, Ban,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import api from '../../services/api';
import { useI18n } from '../../i18n';

const ACCENT = '#4F46E5';
const PAR_PAGE = 6;
const TAILLE_MAX = 5 * 1024 * 1024;

// ── Types ──────────────────────────────────────────────────────────

type StatutPiece = 'MANQUANTE' | 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE' | 'EXPIREE';
type Nature = 'LEGALE' | 'INDIRECTE' | 'USAGE' | 'SECTORIELLE';
type StatutDemande = 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE' | 'ANNULEE';

interface PieceDeposee {
 id: string;
  nomFichier: string;
 taille: number;
  deposeLe: string;
 statut: StatutPiece;
  dateExpiration: string | null;
  commentaireRH: string | null;
  valideePar: string | null;
  valideeLe: string | null;
}

interface LigneDossier {
 type: string;
 obligatoire: boolean;
 multiple: boolean;
 expire: boolean;
 statut: StatutPiece;
 pieces: PieceDeposee[];
}

interface Avancement {
 obligatoires: number;
 fournies: number;
 pourcentage: number;
  enAttente: number;
 refusees: number;
 expirees: number;
 manquantes: number;
}

interface DefinitionPiece {
 libelle: string;
 nature: Nature;
 reference: string;
 obligatoire: boolean;
 expire: boolean;
 multiple: boolean;
}

interface DefinitionDelivre {
 libelle: string;
 nature: Nature;
 reference: string;
  delaiHeures: number;
  mentions?: string[];
}

interface Dossier {
 employe: { id: string; nom: string; poste: string | null; cin: string | null };
 lignes: LigneDossier[];
 avancement: Avancement;
 catalogue: Record<string, DefinitionPiece>;
  catalogueDelivres: Record<string, DefinitionDelivre>;
}

interface Demande {
 id: string;
 type: string;
  typeLibelle: string;
  motif?: string;
  destinataire?: string;
 statut: StatutDemande;
  demandeLe: string;
  traiteLe?: string;
  traitePar?: string;
  commentaireRH?: string;
  pdfKey?: string;
}

// ── Apparence ──────────────────────────────────────────────────────

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  CONTRAT_TRAVAIL: FileSignature,
  CARTE_CNSS: ShieldCheck,
  CERTIFICAT_MEDICAL: BadgeCheck,
  CIN: IdCard,
  EXTRAIT_NAISSANCE: ScrollText,
  DIPLOME: GraduationCap,
  RIB: Landmark,
  PHOTO_IDENTITE: Camera,
  CASIER_JUDICIAIRE: Gavel,
  JUSTIFICATIF_DOMICILE: Home,
  CV: Paperclip,
  ATTESTATION_TRAVAIL: Building2,
  ATTESTATION_SALAIRE: Wallet,
  CERTIFICAT_TRAVAIL: ScrollText,
  ATTESTATION_CONGES: CalendarDays,
  COPIE_CONTRAT: FileSignature,
  RENOUVELLEMENT_CONTRAT: RefreshCw,
  DUPLICATA_BULLETIN: FileClock,
};

// Teintes mesurées sur fond clair ET sur fond sombre : chaque paire
// texte/fond dépasse 4,5:1 dans les deux thèmes.
const TEINTE_STATUT: Record<StatutPiece, { bg: string; texte: string; barre: string }> = {
  MANQUANTE: {
 bg: 'bg-stone-100',
 texte: 'text-stone-500',
 barre: 'bg-stone-300',
  },
  EN_ATTENTE: {
 bg: 'bg-amber-50',
 texte: 'text-amber-600',
 barre: 'bg-amber-400',
  },
  VALIDEE: {
 bg: 'bg-brand-500/10',
 texte: 'text-brand-texte',
 barre: 'bg-brand-500',
  },
  REFUSEE: {
 bg: 'bg-red-50',
 texte: 'text-red-500',
 barre: 'bg-red-400',
  },
  EXPIREE: {
 bg: 'bg-purple-50',
 texte: 'text-purple-600',
 barre: 'bg-purple-400',
  },
};

const TEINTE_DEMANDE: Record<StatutDemande, { bg: string; texte: string; icone: React.ComponentType<{ className?: string }> }> = {
  EN_ATTENTE: {
 bg: 'bg-amber-50',
 texte: 'text-amber-600',
 icone: Clock,
  },
  APPROUVEE: {
 bg: 'bg-brand-500/10',
 texte: 'text-brand-texte',
 icone: CheckCircle2,
  },
  REFUSEE: {
 bg: 'bg-red-50',
 texte: 'text-red-500',
 icone: XCircle,
  },
  // Neutre : une annulation n'est ni un échec ni un succès, c'est un
  // retrait. La teindre en rouge laisserait croire à un refus.
  ANNULEE: {
 bg: 'bg-stone-100',
 texte: 'text-stone-500',
 icone: Ban,
  },
};

const ICONE_STATUT: Record<StatutPiece, React.ComponentType<{ className?: string }>> = {
  MANQUANTE: UploadCloud,
  EN_ATTENTE: Hourglass,
  VALIDEE: CheckCircle2,
  REFUSEE: XCircle,
  EXPIREE: AlertTriangle,
};

const CARTE = 'bg-surface rounded-2xl shadow-sm border border-stone-100';
const TITRE = 'text-stone-800';
const SOUS = 'text-stone-500';
const DOUX = 'text-stone-400';
const CHAMP = 'w-full px-3 py-2.5 text-sm text-start bg-stone-50 '
  + 'border border-stone-200 rounded-xl '
  + TITRE + ' focus:outline-none focus:border-brand-500 transition-colors';

// ── Petits composants ──────────────────────────────────────────────

function Anneau({ pourcentage, libelle }: { pourcentage: number; libelle: string }) {
 const R = 42;
 const circonference = 2 * Math.PI * R;
 const rempli = (Math.max(0, Math.min(100, pourcentage)) / 100) * circonference;

 return (
    <div className="relative w-28 h-28 shrink-0">
      {/* `rotate-[-90deg]` et non un attribut `transform` : en RTL, un
 transform SVG ne s'inverse pas, la classe non plus — l'anneau
 part donc du haut dans les deux sens de lecture. */}
      <svg viewBox="0 0 100 100" className="w-28 h-28 rotate-[-90deg]">
        <circle
          cx="50" cy="50" r={R} fill="none" strokeWidth="8"
          className="stroke-stone-100"
        />
        <circle
          cx="50" cy="50" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${rempli} ${circonference}`}
          className="stroke-brand-500 transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${TITRE}`}>{pourcentage}%</span>
        <span className={`text-[10px] ${DOUX}`}>{libelle}</span>
      </div>
    </div>
  );
}

function Compteur({ icone: Icone, valeur, libelle, teinte, alerte }: {
 icone: React.ComponentType<{ className?: string }>;
 valeur: number | string;
 libelle: string;
 teinte: { bg: string; texte: string };
  alerte?: boolean;
}) {
 return (
    <div className={`${CARTE} p-4 ${alerte ? 'ring-1 ring-amber-200' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${teinte.bg}`}>
        <Icone className={`w-4 h-4 ${teinte.texte}`} />
      </div>
      <p className={`text-2xl font-bold leading-tight ${teinte.texte}`}>{valeur}</p>
      <p className={`text-xs ${SOUS} mt-0.5`}>{libelle}</p>
    </div>
  );
}

function Etiquette({ texte, teinte, icone: Icone, titre }: {
 texte: string;
 teinte: { bg: string; texte: string };
  icone?: React.ComponentType<{ className?: string }>;
  titre?: string;
}) {
 return (
    <span
      title={titre}
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${teinte.bg} ${teinte.texte}`}
    >
      {Icone && <Icone className="w-3 h-3" />}
      {texte}
    </span>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
 const minuteur = setTimeout(onClose, 3500);
 return () => clearTimeout(minuteur);
  }, [onClose]);

 return (
    <div className="fixed top-6 z-[70]" style={{ insetInlineEnd: '1.5rem' }}>
      <div className="bg-brand-500 text-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3 min-w-[17rem]">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium flex-1 text-start">{message}</p>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Bandeau({ message, onClose, ton = 'erreur' }: {
 message: string; onClose?: () => void; ton?: 'erreur' | 'avertissement';
}) {
 const teinte = ton === 'erreur'
    ? 'bg-red-50 text-red-500'
    : 'bg-amber-50 text-amber-700';

 return (
    <div className={`flex items-start gap-2 rounded-xl px-4 py-3 mb-5 text-sm ${teinte}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="flex-1 text-start">{message}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0"><X className="w-4 h-4" /></button>
      )}
    </div>
  );
}

// ── Dépôt d'une pièce ──────────────────────────────────────────────

function ModalDepot({ type, definition, onClose, onSuccess }: {
 type: string;
 definition: DefinitionPiece;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
 const { t } = useI18n();
 const td = (cle: string) => t(cle as Parameters<typeof t>[0]);

 const [fichier, setFichier] = useState<File | null>(null);
 const [echeance, setEcheance] = useState('');

   // La carte d'identité est la seule pièce dont une mention doit finir
  // sur la fiche. Le salarié la lit ; la RH la vérifiera contre le scan.
  // Rien de ce qui est saisi ici n'entre sur la fiche avant cette
  // vérification — sinon un salarié se renommerait tout seul.
 const estCin = type === 'CIN';
 const [cinNum, setCinNum] = useState('');
 const [cinLe, setCinLe] = useState('');
 const [cinA, setCinA] = useState('');

 const cinNet = cinNum.replace(/[\s.-]/g, '');
 const cinValide = /^\d{8}$/.test(cinNet);

 const [envoi, setEnvoi] = useState(false);
 const [erreur, setErreur] = useState('');
 const champFichier = useRef<HTMLInputElement>(null);

 const aujourdhui = new Date().toISOString().slice(0, 10);

 const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
 if (!fichier) { setErreur(td('md.choisirFichier')); return; }

    // Les mêmes contrôles qu'au serveur, pour éviter un aller-retour de
    // 5 Mo qui finira en 400. Le serveur les refait : une validation
    // côté page n'est qu'une politesse, jamais une sécurité.
 if (fichier.size > TAILLE_MAX) {
      setErreur(`${(fichier.size / 1024 / 1024).toFixed(1)} Mo — ${td('md.tailleMax')}`);
      return;
    }
 if (!['application/pdf', 'image/jpeg', 'image/png'].includes(fichier.type)) {
      setErreur(td('md.formats'));
      return;
    }
 if (definition.expire && !echeance) { setErreur(td('md.echeanceAide')); return; }
     // Facultatif : le dépôt reste possible sans. Mais un numéro saisi
    // doit être un numéro, sinon il arrive à la RH comme une erreur à
    // corriger plutôt que comme une aide.
 if (estCin && cinNum.trim() && !cinValide) {
      setErreur(td('md.cinFormat'));
      return;
    }

    setEnvoi(true);
    setErreur('');

 try {
 const base64 = await new Promise<string>((resolve, reject) => {
 const lecteur = new FileReader();
        lecteur.onload = () => resolve(String(lecteur.result).replace(/^data:[^,]+,/, ''));
        lecteur.onerror = () => reject(new Error('lecture'));
        lecteur.readAsDataURL(fichier);
      });

  await api.post('/dossier/pieces', {
        type,
        typeMime: fichier.type,
        nomFichier: fichier.name,
 fichier: base64,
        ...(echeance ? { dateExpiration: echeance } : {}),
        // Le serveur ne retient ces trois champs que pour une pièce de
        // type CIN, et les range sous un nom suffixé « Propose ».
        ...(estCin && cinValide
          ? {
            cin: cinNet,
            ...(cinLe ? { cinDelivreLe: cinLe } : {}),
            ...(cinA.trim() ? { cinDelivreA: cinA.trim() } : {}),
          }
          : {}),
      });

      onSuccess(td('md.depotReussi'));
      onClose();
    } catch (e: any) {
      // Le serveur renvoie un message qui nomme la cause : l'afficher tel
      // quel vaut mieux qu'un « échec » générique.
      setErreur(e?.response?.data?.message ?? e?.erreur ?? e?.message ?? td('md.erreurChargement'));
      setEnvoi(false);
    }
  };

 const Icone = ICONES[type] ?? FileText;

 return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Icone className="w-5 h-5 text-brand-texte" />
            </div>
            <div className="text-start">
              <h2 className={`font-bold text-lg ${TITRE}`}>{td(`md.t.${type}`)}</h2>
              <p className={`text-xs ${SOUS}`}>{td(`md.q.${type}`)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={td('md.fermer')}
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors"
          >
            <X className={`w-5 h-5 ${SOUS}`} />
          </button>
        </div>

        <form onSubmit={soumettre} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {erreur && <Bandeau message={erreur} onClose={() => setErreur('')} />}

          {definition.reference && (
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs bg-brand-500/10 text-brand-texte">
              <Scale className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-start">
                <span className="font-bold">{td('md.reference')} : </span>
                {definition.reference}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => champFichier.current?.click()}
            className={`w-full rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-2 transition-colors ${
 fichier
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-stone-200 hover:border-brand-500/50'
            }`}
          >
            <UploadCloud className={`w-7 h-7 ${fichier ? 'text-brand-texte' : DOUX}`} />
            <span className={`text-sm font-bold ${TITRE}`}>
              {fichier ? fichier.name : td('md.choisirFichier')}
            </span>
            <span className={`text-xs ${DOUX}`}>
              {fichier
                ? `${(fichier.size / 1024).toFixed(0)} ko`
                : `${td('md.formats')} · ${td('md.tailleMax')}`}
            </span>
          </button>

          <input
            ref={champFichier}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => { setFichier(e.target.files?.[0] ?? null); setErreur(''); }}
            className="hidden"
          />

                    {estCin && (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4 space-y-3">
              <p className={`text-xs ${SOUS} text-start leading-relaxed`}>
                {td('md.cinSaisieAide')}
              </p>

              <div>
                <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
                  {td('md.cinNumero')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cinNum}
                  onChange={(e) => { setCinNum(e.target.value); setErreur(''); }}
                  placeholder="12345678"
                  className={CHAMP}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
                    {td('md.cinDelivreLe')}
                  </label>
                  <input
                    type="date"
                    value={cinLe}
                    max={aujourdhui}
                    onChange={(e) => setCinLe(e.target.value)}
                    className={CHAMP}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
                    {td('md.cinDelivreA')}
                  </label>
                  <input
                    type="text"
                    value={cinA}
                    onChange={(e) => setCinA(e.target.value)}
                    placeholder="Tunis"
                    className={CHAMP}
                  />
                </div>
              </div>
            </div>
          )}

          {definition.expire && (
            <div>
              <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
                {td('md.echeance')}
              </label>
              <input
                type="date"
                value={echeance}
                min={aujourdhui}
                onChange={(e) => setEcheance(e.target.value)}
                className={CHAMP}
              />
              <p className={`text-xs ${DOUX} mt-1 text-start`}>{td('md.echeanceAide')}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium ${SOUS} hover:bg-stone-50 transition-colors`}
            >
              {td('md.annuler')}
            </button>
            <button
              type="submit"
              disabled={envoi || !fichier}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <UploadCloud className="w-4 h-4" />}
              {envoi ? td('md.envoi') : td('md.deposer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Demande d'un document ──────────────────────────────────────────

function ModalDemande({ typeInitial, catalogue, onClose, onSuccess }: {
  typeInitial: string | null;
 catalogue: Record<string, DefinitionDelivre>;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
 const { t } = useI18n();
 const td = (cle: string) => t(cle as Parameters<typeof t>[0]);
  // L'unité passe par la traduction : « h » n'est pas « ساعة ».
 const delai = (h: number) => td('md.delaiHeures').replace('{n}', String(h));

 const [type, setType] = useState<string | null>(typeInitial);
 const [motif, setMotif] = useState('');
 const [destinataire, setDestinataire] = useState('');
 const [envoi, setEnvoi] = useState(false);
 const [erreur, setErreur] = useState('');

 const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
 if (!type) { setErreur(td('md.typeDocument')); return; }

    setEnvoi(true);
    setErreur('');
 try {
 await api.post('/documents/demandes', { type, motif, destinataire });
      onSuccess(`${td(`md.d.${type}`)} — ${td('md.delai')} ${delai(catalogue[type].delaiHeures)}`);
      onClose();
    } catch (e: any) {
      setErreur(e?.response?.data?.message ?? e?.erreur ?? e?.message ?? td('md.erreurChargement'));
      setEnvoi(false);
    }
  };

 return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-texte" />
            </div>
            <div className="text-start">
              <h2 className={`font-bold text-lg ${TITRE}`}>{td('md.demanderUn')}</h2>
              <p className={`text-xs ${SOUS}`}>{td('md.demanderAide')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={td('md.fermer')}
            className="p-2 hover:bg-stone-50 rounded-xl transition-colors"
          >
            <X className={`w-5 h-5 ${SOUS}`} />
          </button>
        </div>

        <form onSubmit={soumettre} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {erreur && <Bandeau message={erreur} onClose={() => setErreur('')} />}

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-2 text-start`}>
              {td('md.typeDocument')}
            </label>
            <div className="space-y-2">
              {Object.entries(catalogue).map(([cle, def]) => {
 const Icone = ICONES[cle] ?? FileText;
 const choisi = type === cle;

 return (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => setType(cle)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-start transition-all ${
 choisi
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-stone-200 bg-surface hover:bg-stone-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
                      <Icone className="w-4 h-4 text-brand-texte" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-bold ${TITRE}`}>{td(`md.d.${cle}`)}</span>
                        <span className={`text-[10px] ${DOUX} shrink-0`}>{delai(def.delaiHeures)}</span>
                      </div>
                      <p className={`text-xs ${SOUS} mt-0.5 leading-relaxed`}>
                        {td(`md.u.${cle}`)}
                      </p>
                      {def.reference && (
                        <p className="text-[10px] text-brand-texte font-semibold mt-1">
                          {def.reference}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
              {td('md.destinataire')}
            </label>
            <input
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
              placeholder={td('md.destinatairePlaceholder')}
              className={CHAMP}
            />
            <p className={`text-xs ${DOUX} mt-1 text-start`}>{td('md.destinataireAide')}</p>
          </div>

          <div>
            <label className={`block text-xs font-medium ${SOUS} mb-1.5 text-start`}>
              {td('md.motif')}
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              placeholder={td('md.motifPlaceholder')}
              className={`${CHAMP} resize-none`}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium ${SOUS} hover:bg-stone-50 transition-colors`}
            >
              {td('md.annuler')}
            </button>
            <button
              type="submit"
              disabled={envoi || !type}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {envoi
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FileText className="w-4 h-4" />}
              {envoi ? td('md.envoi') : td('md.envoyer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Téléchargements ────────────────────────────────────────────────

/**
 * Une réponse d'erreur arrive elle aussi sous forme de Blob : sans ce
 * contrôle, un message JSON serait enregistré avec l'extension .pdf, et
 * l'utilisateur ouvrirait un fichier illisible en croyant à un document.
 */
async function enregistrer(chemin: string, nom: string, typeAttendu?: string) {
 const blob = await api.get(chemin, { responseType: 'blob' }) as unknown as Blob;

 if (typeAttendu && blob.type && blob.type !== typeAttendu) {
 const texte = await blob.text();
 let message = 'Document indisponible';
 try {
 const json = JSON.parse(texte);
 message = json?.message ?? json?.erreur ?? message;
    } catch { /* réponse HTML ou binaire inattendu */ }
 throw new Error(message);
  }

 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Page ───────────────────────────────────────────────────────────

type Volet = 'dossier' | 'demandes';
type FiltrePiece = 'toutes' | StatutPiece;
type FiltreDemande = 'toutes' | StatutDemande;

export default function MesDocumentsPage() {
 const { t, tn, langue } = useI18n();
 const td = (cle: string) => t(cle as Parameters<typeof t>[0]);
 const delaiPage = (h: number) => td('md.delaiHeures').replace('{n}', String(h));

 const locale = langue === 'ar' ? 'ar-TN' : langue === 'en' ? 'en-GB' : 'fr-FR';
 const jour = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale, {
 day: 'numeric', month: 'long', year: 'numeric',
    }),
    [locale]
  );

  // Une pièce qui expire dans trois semaines n'est pas encore un
  // problème, mais le devient sans prévenir. Le seuil est volontairement
  // large : une fiche d'aptitude se renouvelle sur rendez-vous.
 const SEUIL_ALERTE_JOURS = 60;
 const joursAvant = (iso: string) =>
    Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86_400_000);

 const [volet, setVolet] = useState<Volet>('dossier');

 const [dossier, setDossier] = useState<Dossier | null>(null);
 const [demandes, setDemandes] = useState<Demande[]>([]);
 const [chargement, setChargement] = useState(true);
 const [erreur, setErreur] = useState('');
 const [toast, setToast] = useState('');

 const [depot, setDepot] = useState<string | null>(null);
 const [formulaire, setFormulaire] = useState<string | null | false>(false);

 const [filtrePiece, setFiltrePiece] = useState<FiltrePiece>('toutes');
 const [pagePieces, setPagePieces] = useState(0);

 const [filtreDemande, setFiltreDemande] = useState<FiltreDemande>('toutes');
 const [recherche, setRecherche] = useState('');
 const [pageDemandes, setPageDemandes] = useState(0);

 const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');

    // Les deux volets se chargent ensemble : basculer d'un onglet à
    // l'autre ne doit pas déclencher une attente.
 const [resDossier, resDemandes] = await Promise.allSettled([
      api.get('/dossier/mes-pieces') as any,
      api.get('/documents/demandes') as any,
    ]);

 if (resDossier.status === 'fulfilled') {
      setDossier(resDossier.value?.data ?? resDossier.value ?? null);
    } else {
 const e = resDossier.reason;
      setErreur(e?.response?.data?.message ?? e?.erreur ?? td('md.erreurChargement'));
    }

 if (resDemandes.status === 'fulfilled') {
      setDemandes(resDemandes.value?.data?.demandes ?? resDemandes.value?.demandes ?? []);
    }

    setChargement(false);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { setPagePieces(0); }, [filtrePiece]);
  useEffect(() => { setPageDemandes(0); }, [filtreDemande, recherche]);

  // ── Volet dossier ──

 const lignes = dossier?.lignes ?? [];
 const avancement = dossier?.avancement;

 const lignesFiltrees = useMemo(() => {
 const ordre: StatutPiece[] = ['REFUSEE', 'EXPIREE', 'MANQUANTE', 'EN_ATTENTE', 'VALIDEE'];
 return lignes
      .filter((l) => {
 if (filtrePiece === 'toutes') return true;
        // L'onglet « à corriger » compte les refusées ET les expirées :
        // les deux réclament le même geste. Il doit donc aussi les
        // filtrer ensemble, sinon le compteur annonce plus de lignes que
        // la liste n'en montre.
 if (filtrePiece === 'REFUSEE') return l.statut === 'REFUSEE' || l.statut === 'EXPIREE';
 return l.statut === filtrePiece;
      })
      // Ce qui demande une action remonte : un refus et une pièce expirée
      // réclament un geste, une pièce validée ne réclame rien.
      .sort((a, b) => {
 const rang = ordre.indexOf(a.statut) - ordre.indexOf(b.statut);
 if (rang !== 0) return rang;
 if (a.obligatoire !== b.obligatoire) return a.obligatoire ? -1 : 1;
 return td(`md.t.${a.type}`).localeCompare(td(`md.t.${b.type}`), locale);
      });
  }, [lignes, filtrePiece, locale]); // eslint-disable-line react-hooks/exhaustive-deps

 const pagePiecesCourante = useMemo(
    () => lignesFiltrees.slice(pagePieces * PAR_PAGE, (pagePieces + 1) * PAR_PAGE),
    [lignesFiltrees, pagePieces]
  );

 const compterPieces = (s: StatutPiece) => lignes.filter((l) => l.statut === s).length;

 const ONGLETS_PIECES: [FiltrePiece, string, number][] = [
    ['toutes', td('md.ongletToutes'), lignes.length],
    ['MANQUANTE', td('md.s.MANQUANTE'), compterPieces('MANQUANTE')],
    ['EN_ATTENTE', td('md.s.EN_ATTENTE'), compterPieces('EN_ATTENTE')],
    ['VALIDEE', td('md.s.VALIDEE'), compterPieces('VALIDEE')],
    ['REFUSEE', td('md.s.REFUSEE'), compterPieces('REFUSEE') + compterPieces('EXPIREE')],
  ];

 const telechargerPiece = async (p: PieceDeposee) => {
 try {
      setErreur('');
 await enregistrer(`/dossier/pieces/${p.id}/fichier`, p.nomFichier);
    } catch (e: any) { setErreur(e.message); }
  };

  // ── Volet demandes ──

 const demandesFiltrees = useMemo(() => {
 const terme = recherche.trim().toLowerCase();
 return demandes
      .filter((d) => {
 if (filtreDemande !== 'toutes' && d.statut !== filtreDemande) return false;
 if (!terme) return true;
 return `${d.typeLibelle} ${d.destinataire ?? ''} ${d.motif ?? ''}`
          .toLowerCase().includes(terme);
      })
      // Les documents disponibles remontent : c'est ce que le salarié
      // vient chercher.
      .sort((a, b) => {
 const aPret = a.statut === 'APPROUVEE' ? 0 : 1;
 const bPret = b.statut === 'APPROUVEE' ? 0 : 1;
 if (aPret !== bPret) return aPret - bPret;
 return String(b.demandeLe).localeCompare(String(a.demandeLe));
      });
  }, [demandes, filtreDemande, recherche]);

 const pageDemandesCourante = useMemo(
    () => demandesFiltrees.slice(pageDemandes * PAR_PAGE, (pageDemandes + 1) * PAR_PAGE),
    [demandesFiltrees, pageDemandes]
  );

 const compterDemandes = (s: StatutDemande) => demandes.filter((d) => d.statut === s).length;

 const ONGLETS_DEMANDES: [FiltreDemande, string, number][] = [
    ['toutes', td('md.ongletToutes'), demandes.length],
    ['EN_ATTENTE', td('md.ongletAttente'), compterDemandes('EN_ATTENTE')],
    ['APPROUVEE', td('md.ongletDisponibles'), compterDemandes('APPROUVEE')],
    ['REFUSEE', td('md.ongletRefusees'), compterDemandes('REFUSEE')],
  ];

  // Une demande partie par erreur — mauvais type, mauvais destinataire —
  // se retire sans passer par la RH, tant qu'elle n'est pas traitée. La
  // confirmation est volontaire : le bouton est à côté du téléchargement.
 const [annulation, setAnnulation] = useState<string | null>(null);

 const annulerDemande = async (d: Demande) => {
 try {
      setErreur('');
 await api.delete(`/documents/demandes/${d.id}`);
      setAnnulation(null);
      setToast(td('md.demandeAnnulee'));
      charger();
    } catch (e: any) {
      setAnnulation(null);
      setErreur(e?.response?.data?.message ?? e?.erreur ?? e?.message ?? td('md.erreurChargement'));
    }
  };

 const telechargerDemande = async (d: Demande) => {
 try {
      setErreur('');
 await enregistrer(
        `/documents/demandes/${d.id}/fichier`,
        `${d.typeLibelle}.pdf`,
        'application/pdf'
      );
    } catch (e: any) { setErreur(e.message); }
  };

 const catalogue = dossier?.catalogue ?? {};
 const catalogueDelivres = dossier?.catalogueDelivres ?? {};

 const classeOnglet = (actif: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
 actif ? 'bg-brand-500 text-white' : `${SOUS} hover:bg-stone-50`
    }`;

 const classePastille = (actif: boolean) =>
    `text-[10px] px-1.5 rounded-full ${actif ? 'bg-white/25' : 'bg-stone-100'}`;

 return (
    <div className="min-h-screen">
      <Layout searchPlaceholder={td('md.recherchePlaceholder')}>

        {/* ── En-tête ── */}
        <div className="px-8 py-6 border-b border-stone-200">
          <div className="flex justify-between items-end gap-4 flex-wrap">
            <div className="text-start">
              <nav className={`flex text-xs ${SOUS} mb-2 gap-2 items-center`}>
                <span>{td('md.filMonEspace')}</span>
                <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                <span className="text-brand-texte font-semibold">{td('md.titre')}</span>
              </nav>
              <h2 className={`text-3xl font-bold ${TITRE}`}>{td('md.titre')}</h2>
              <p className={`${SOUS} mt-1`}>
                {chargement
                  ? td('md.chargement')
                  : volet === 'dossier'
                    ? td('md.voletDossierAide')
                    : compterDemandes('APPROUVEE') > 0
                      ? (
                        <>
                          <span className="text-brand-texte font-semibold">
                            {tn('md.demande', compterDemandes('APPROUVEE'))}
                          </span>
                          {` ${td('md.aTelecharger')}`}
                        </>
                      )
                      : td('md.voletDemandesAide')}
              </p>
            </div>

            {volet === 'demandes' && (
              <button
                onClick={() => setFormulaire(null)}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                {td('md.demander')}
              </button>
            )}
          </div>

          {/* ── Les deux volets ── */}
          <div className="flex items-center gap-1 mt-5 bg-surface border border-stone-200 rounded-xl shadow-sm p-1.5 w-fit">
            {([
              ['dossier', td('md.voletDossier'), FolderOpen, avancement?.manquantes ?? 0],
              ['demandes', td('md.voletDemandes'), Inbox, compterDemandes('APPROUVEE')],
            ] as [Volet, string, React.ComponentType<{ className?: string }>, number][])
              .map(([cle, label, Icone, nb]) => {
 const actif = volet === cle;
 return (
                  <button key={cle} onClick={() => setVolet(cle)} className={classeOnglet(actif)}>
                    <Icone className="w-4 h-4" />
                    {label}
                    {nb > 0 && <span className={classePastille(actif)}>{nb}</span>}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="px-8 py-8">
          {erreur && <Bandeau message={erreur} onClose={() => setErreur('')} />}

          {/* ═══════════ VOLET 1 — MON DOSSIER ═══════════ */}
          {volet === 'dossier' && (
            <>
              {/* Avancement */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
                <div className={`${CARTE} p-5 lg:col-span-2 flex items-center gap-5`}>
                  <Anneau
                    pourcentage={avancement?.pourcentage ?? 0}
                    libelle={td('md.avancement')}
                  />
                  <div className="min-w-0 text-start">
                    <p className={`text-sm font-bold ${TITRE}`}>
                      {avancement && avancement.pourcentage === 100
                        ? td('md.dossierComplet')
                        : tn('md.pieceFournie', avancement?.fournies ?? 0)}
                    </p>
                    <p className={`text-xs ${SOUS} mt-0.5`}>
                      {avancement?.obligatoires ?? 0} {td('md.attendues')}
                    </p>
                    {dossier && (
                      <div className="mt-3">
                        <p className={`text-[10px] uppercase tracking-widest ${DOUX}`}>
                          {td('md.cin')}
                        </p>
                        {dossier.employe.cin ? (
                          <p className={`text-sm font-bold ${TITRE}`}>{dossier.employe.cin}</p>
                        ) : (
                          <Etiquette
                            texte={td('md.cinManquant')}
                            teinte={TEINTE_STATUT.REFUSEE}
                            icone={AlertTriangle}
                            titre={td('md.cinAide')}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <Compteur
                  icone={UploadCloud}
                  valeur={chargement ? '…' : avancement?.manquantes ?? 0}
                  libelle={td('md.manquantes')}
                  teinte={TEINTE_STATUT.MANQUANTE}
                />
                <Compteur
                  icone={Hourglass}
                  valeur={chargement ? '…' : avancement?.enAttente ?? 0}
                  libelle={td('md.enAttente')}
                  teinte={TEINTE_STATUT.EN_ATTENTE}
                  alerte={(avancement?.enAttente ?? 0) > 0}
                />
                <Compteur
                  icone={AlertTriangle}
                  valeur={chargement ? '…' : (avancement?.refusees ?? 0) + (avancement?.expirees ?? 0)}
                  libelle={td('md.refusees')}
                  teinte={TEINTE_STATUT.REFUSEE}
                />
              </div>

              {dossier && !dossier.employe.cin && !chargement && (
                <Bandeau message={td('md.cinAide')} ton="avertissement" />
              )}

              {/* Onglets */}
              <div className="flex items-center gap-1 bg-surface border border-stone-200 rounded-xl shadow-sm px-2 py-2 mb-5 overflow-x-auto">
                {ONGLETS_PIECES.map(([cle, label, nb]) => {
 const actif = filtrePiece === cle;
 return (
                    <button key={cle} onClick={() => setFiltrePiece(cle)} className={classeOnglet(actif)}>
                      {label}
                      <span className={classePastille(actif)}>{chargement ? '…' : nb}</span>
                    </button>
                  );
                })}
              </div>

              {/* Liste des pièces */}
              {chargement ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`${CARTE} p-5 animate-pulse`}>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-stone-100 rounded w-44" />
                          <div className="h-3 bg-stone-100 rounded w-56" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : lignesFiltrees.length === 0 ? (
                <div className={`${CARTE} p-16 text-center`}>
                  <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                    <FolderOpen className={`w-6 h-6 ${DOUX}`} />
                  </div>
                  <p className={`text-sm font-bold ${TITRE} mb-1`}>{td('md.aucunePiece')}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {pagePiecesCourante.map((ligne) => {
 const def = catalogue[ligne.type];
 const Icone = ICONES[ligne.type] ?? FileText;
 const teinte = TEINTE_STATUT[ligne.statut];
 const IconeStatut = ICONE_STATUT[ligne.statut];
 const derniere = ligne.pieces[0];
 const aAgir = ligne.statut === 'MANQUANTE'
                        || ligne.statut === 'REFUSEE'
                        || ligne.statut === 'EXPIREE';

 return (
                        <div
                          key={ligne.type}
                          className={`${CARTE} overflow-hidden transition-shadow hover:shadow-md ${
                            aAgir && ligne.obligatoire ? 'ring-1 ring-brand-500/20' : ''
                          }`}
                        >
                          <div className="flex">
                            <div className={`w-1 shrink-0 ${teinte.barre}`} />

                            <div className="flex-1 p-5">
                              <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${teinte.bg}`}>
                                    <Icone className={`w-5 h-5 ${teinte.texte}`} />
                                  </div>

                                  <div className="min-w-0 text-start">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className={`font-bold ${TITRE}`}>
                                        {td(`md.t.${ligne.type}`)}
                                      </h4>
                                      {def && (
                                        <Etiquette
                                          texte={td(`md.n.${def.nature}`)}
                                          teinte={def.nature === 'LEGALE' || def.nature === 'INDIRECTE'
                                            ? { bg: 'bg-brand-500/10', texte: 'text-brand-texte' }
                                            : TEINTE_STATUT.MANQUANTE}
                                          icone={def.nature === 'LEGALE' ? Scale : undefined}
                                          titre={def.reference || td('md.natureAide')}
                                        />
                                      )}
                                      <span className={`text-[10px] ${DOUX}`}>
                                        {ligne.obligatoire ? td('md.obligatoire') : td('md.facultative')}
                                      </span>
                                    </div>

                                    <p className={`text-xs ${SOUS} mt-0.5 leading-relaxed`}>
                                      {td(`md.q.${ligne.type}`)}
                                    </p>

                                    {derniere && (
                                      <p className={`text-xs ${DOUX} mt-1.5`}>
                                        {td('md.deposeLe')} {jour(derniere.deposeLe)}
                                        {derniere.dateExpiration && (
                                          <>
                                            {' · '}
                                            <span className={ligne.statut === 'EXPIREE'
                                              ? 'text-purple-600 font-semibold'
                                              : ''}
                                            >
                                              {ligne.statut === 'EXPIREE'
                                                ? td('md.expireLe')
                                                : td('md.valableJusquau')}
                                              {' '}
                                              {jour(derniere.dateExpiration)}
                                            </span>
                                          </>
                                        )}
                                      </p>
                                    )}

                                    {derniere?.commentaireRH && (
                                      <p className={`text-xs ${SOUS} bg-stone-50 rounded-lg px-3 py-2 mt-2 text-start`}>
                                        <span className="font-bold">{td('md.motifRefus')} : </span>
                                        {derniere.commentaireRH}
                                      </p>
                                    )}

                                    {derniere?.valideeLe && ligne.statut === 'VALIDEE' && (
                                      <p className="text-[10px] text-brand-texte font-bold mt-1.5">
                                        {td('md.valideeLe')} {jour(derniere.valideeLe)}
                                        {derniere.valideePar && ` ${td('md.valideePar')} ${derniere.valideePar}`}
                                      </p>
                                    )}

                                    {/* Les fichiers supplémentaires d'un type
 multiple : plusieurs diplômes, un
 contrat et son avenant. */}
                                    {ligne.pieces.length > 1 && (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {ligne.pieces.slice(1).map((p) => (
                                          <button
                                            key={p.id}
                                            onClick={() => telechargerPiece(p)}
                                            className={`inline-flex items-center gap-1.5 text-[11px] ${SOUS} bg-stone-50 hover:bg-stone-100 rounded-lg px-2.5 py-1 transition-colors`}
                                          >
                                            <Paperclip className="w-3 h-3" />
                                            {p.nomFichier}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                  <Etiquette
                                    texte={td(`md.s.${ligne.statut}`)}
                                    teinte={teinte}
                                    icone={IconeStatut}
                                  />

                                  {ligne.statut === 'VALIDEE'
                                    && derniere?.dateExpiration
                                    && joursAvant(derniere.dateExpiration) <= SEUIL_ALERTE_JOURS && (
                                      <Etiquette
                                        texte={tn('md.expireBientot', Math.max(0, joursAvant(derniere.dateExpiration)))}
                                        teinte={TEINTE_STATUT.EXPIREE}
                                        icone={AlertTriangle}
                                      />
                                    )}

                                  {derniere && (
                                    <button
                                      onClick={() => telechargerPiece(derniere)}
                                      title={td('md.telecharger')}
                                      aria-label={td('md.telecharger')}
                                      className={`p-2 rounded-xl border border-stone-200 ${SOUS} hover:bg-stone-50 transition-colors`}
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setDepot(ligne.type)}
                                    className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-colors ${
                                      aAgir
                                        ? 'bg-brand-500 hover:bg-brand-600 text-white'
                                        : `border border-stone-200 ${SOUS} hover:bg-stone-50`
                                    }`}
                                  >
                                    <UploadCloud className="w-3.5 h-3.5" />
                                    {ligne.statut === 'MANQUANTE'
                                      ? td('md.deposer')
                                      : ligne.multiple
                                        ? td('md.ajouter')
                                        : td('md.redeposer')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`${CARTE} mt-4 overflow-hidden`}>
                    <Pagination
                      page={pagePieces}
                      taillePage={PAR_PAGE}
                      total={lignesFiltrees.length}
                      onPage={setPagePieces}
                      libelle={td('md.libellePiece')}
                      accent={ACCENT}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* ═══════════ VOLET 2 — DEMANDER UN DOCUMENT ═══════════ */}
          {volet === 'demandes' && (
            <>
              {/* Catalogue : on part du besoin, pas d'un bouton générique */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {Object.entries(catalogueDelivres).map(([cle, def]) => {
 const Icone = ICONES[cle] ?? FileText;
 return (
                    <button
                      key={cle}
                      onClick={() => setFormulaire(cle)}
                      className={`${CARTE} p-4 text-start hover:shadow-md hover:border-brand-500/30 transition-all`}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 bg-brand-500/10">
                        <Icone className="w-4 h-4 text-brand-texte" />
                      </div>
                      <div className={`text-xs font-bold ${TITRE} leading-tight`}>
                        {td(`md.d.${cle}`)}
                      </div>
                      <div className={`text-[10px] ${DOUX} mt-1 line-clamp-2`}>
                        {td(`md.u.${cle}`)}
                      </div>
                      <div className="text-[10px] text-brand-texte font-bold mt-2">
                        {td('md.delai')} {delaiPage(def.delaiHeures)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Onglets et recherche */}
              <div className={`flex items-center justify-between gap-4 bg-surface border border-stone-200 rounded-xl shadow-sm px-2 py-2 mb-5 flex-wrap`}>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {ONGLETS_DEMANDES.map(([cle, label, nb]) => {
 const actif = filtreDemande === cle;
 return (
                      <button key={cle} onClick={() => setFiltreDemande(cle)} className={classeOnglet(actif)}>
                        {label}
                        <span className={classePastille(actif)}>{chargement ? '…' : nb}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-56 shrink-0">
                  <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 ${DOUX}`}
                    style={{ insetInlineStart: '0.75rem' }} />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder={td('md.recherchePlaceholder')}
                    className={`${CHAMP} ps-9 pe-8 py-2`}
                  />
                  {recherche && (
                    <button
                      onClick={() => setRecherche('')}
                      aria-label={td('md.effacer')}
                      className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-stone-200"
                      style={{ insetInlineEnd: '0.625rem' }}
                    >
                      <X className={`w-3.5 h-3.5 ${DOUX}`} />
                    </button>
                  )}
                </div>
              </div>

              {/* Liste des demandes */}
              {chargement ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`${CARTE} p-5 animate-pulse`}>
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-stone-100 rounded-xl" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-stone-100 rounded w-44" />
                          <div className="h-3 bg-stone-100 rounded w-56" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : demandesFiltrees.length === 0 ? (
                <div className={`${CARTE} p-16 text-center`}>
                  <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                    <FileText className={`w-6 h-6 ${DOUX}`} />
                  </div>
                  <p className={`text-sm font-bold ${TITRE} mb-1`}>{td('md.aucuneDemande')}</p>
                  <p className={`text-xs ${SOUS}`}>
                    {recherche
                      ? td('md.aucunResultat').replace('{n}', recherche)
                      : filtreDemande !== 'toutes'
                        ? td('md.aucuneCategorie')
                        : td('md.choisirCiDessus')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {pageDemandesCourante.map((d) => {
 const teinte = TEINTE_DEMANDE[d.statut];
 const IconeStatut = teinte.icone;
 const Icone = ICONES[d.type] ?? FileText;
 const pret = d.statut === 'APPROUVEE' && d.pdfKey;

 return (
                        <div
                          key={d.id}
                          className={`${CARTE} overflow-hidden transition-shadow hover:shadow-md ${
 pret ? 'ring-1 ring-brand-500/20' : ''
                          }`}
                        >
                          <div className="flex">
                            <div className={`w-1 shrink-0 ${pret ? 'bg-brand-500' : 'bg-stone-200'}`} />

                            <div className="flex-1 p-5">
                              <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${teinte.bg}`}>
                                    <Icone className={`w-5 h-5 ${teinte.texte}`} />
                                  </div>

                                  <div className="min-w-0 text-start">
                                    <h4 className={`font-bold ${TITRE}`}>
                                      {catalogueDelivres[d.type] ? td(`md.d.${d.type}`) : d.typeLibelle}
                                    </h4>

                                    <p className={`text-xs ${DOUX} mt-0.5`}>
                                      {td('md.demandeLe')} {jour(d.demandeLe)}
                                      {d.destinataire && (
                                        <span className="text-brand-texte font-semibold">
                                          {` · ${td('md.pour')} ${d.destinataire}`}
                                        </span>
                                      )}
                                    </p>

                                    {d.motif && (
                                      <p className={`text-xs ${SOUS} italic mt-1.5 ps-2 border-s-2 border-stone-100`}>
                                        {d.motif}
                                      </p>
                                    )}

                                    {d.commentaireRH && (
                                      <p className={`text-xs ${SOUS} bg-stone-50 rounded-lg px-3 py-2 mt-2 text-start`}>
                                        <span className="font-bold">{td('md.reponseRH')} : </span>
                                        {d.commentaireRH}
                                        {d.traitePar && <span className={DOUX}> — {d.traitePar}</span>}
                                      </p>
                                    )}

                                    {d.traiteLe && d.statut === 'APPROUVEE' && (
                                      <p className="text-[10px] text-brand-texte font-bold mt-1.5">
                                        {td('md.delivreLe')} {jour(d.traiteLe)}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Etiquette
                                    texte={td(`md.ds.${d.statut}`)}
                                    teinte={teinte}
                                    icone={IconeStatut}
                                  />

                                  {pret && (
                                    <button
                                      onClick={() => telechargerDemande(d)}
                                      className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      {td('md.telecharger')}
                                    </button>
                                  )}

                                  {d.statut === 'EN_ATTENTE' && (
                                    <button
                                      onClick={() => setAnnulation(d.id)}
                                      className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl border border-stone-200 ${SOUS} hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors`}
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                      {td('md.annulerDemande')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`${CARTE} mt-4 overflow-hidden`}>
                    <Pagination
                      page={pageDemandes}
                      taillePage={PAR_PAGE}
                      total={demandesFiltrees.length}
                      onPage={setPageDemandes}
                      libelle={td('md.libelleDemande')}
                      accent={ACCENT}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Mentions ── */}
          <div className={`${CARTE} p-5 mt-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-4 h-4 text-brand-texte" />
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${DOUX}`}>
                {td('md.mentionsTitre')}
              </h4>
            </div>
            <div className="space-y-2 text-start">
              <p className={`text-xs ${SOUS} leading-relaxed`}>{td('md.mentionsCertificat')}</p>
              <p className={`text-xs ${SOUS} leading-relaxed`}>{td('md.mentionsBulletin')}</p>
              <p className={`text-xs ${DOUX} leading-relaxed`}>{td('md.mentionsDossier')}</p>
            </div>
          </div>
        </div>

        {depot && catalogue[depot] && (
          <ModalDepot
            type={depot}
            definition={catalogue[depot]}
            onClose={() => setDepot(null)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}

        {formulaire !== false && (
          <ModalDemande
            typeInitial={formulaire}
            catalogue={catalogueDelivres}
            onClose={() => setFormulaire(false)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}

        {/* Confirmation d'annulation. Une demande retirée ne se récupère
 pas : mieux vaut une question qu'un regret. */}
        {annulation && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-2xl w-full max-w-sm shadow-xl p-6">
              <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                <Ban className="w-5 h-5 text-red-500" />
              </div>
              <h3 className={`font-bold text-lg ${TITRE} text-start`}>
                {td('md.annulerDemande')}
              </h3>
              <p className={`text-sm ${SOUS} mt-1 text-start`}>
                {td('md.annulerConfirmation')}
              </p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setAnnulation(null)}
                  className={`flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium ${SOUS} hover:bg-stone-50 transition-colors`}
                >
                  {td('md.fermer')}
                </button>
                <button
                  onClick={() => {
 const d = demandes.find((x) => x.id === annulation);
 if (d) annulerDemande(d);
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors"
                >
                  {td('md.annulerDemande')}
                </button>
              </div>
            </div>
          </div>
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