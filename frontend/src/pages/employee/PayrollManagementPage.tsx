// src/pages/admin/InvoicingPage.tsx
//
// Bulletins de salaire. Le calcul vient du moteur de paie, à partir
// des pointages et congés réellement enregistrés : cette page ne fait
// qu'afficher et déclencher.

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download, Play, TrendingUp, FileText, CheckCircle2, ShieldCheck,
  X, Trash2, Eye, AlertTriangle, Search, SlidersHorizontal,
  ChevronRight, Users,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import Pagination from '../../components/ui/Pagination';
import { facturesService } from '../../services/factures';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';
import api from '../../services/api';

const ACCENT = '#4F46E5';
const FOND = 'transparent';

const PAR_PAGE = 3;

const MOIS_NOMS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// ── Types, alignés sur ce que renvoie le moteur de paie ────────────
interface Cotisations {
  cnss: number;
  irpp: number;
  css: number;
  total: number;
}

interface DetailFiscal {
  brutAnnualise: number;
  cnssAnnualisee: number;
  fraisProfessionnels: number;
  abattementsFamiliaux: number;
  revenuNetImposable: number;
  irppAnnuel: number;
  cssAnnuelle: number;
  tauxMoyen: number;
}

interface Facture {
  id: string;
  numero: string;
  employeId: string;
  employeNom: string;
  employePoste?: string;
  periode: string;
  mois: number;
  annee: number;
  moisLabel: string;

  nbJoursOuvrables?: number;
  joursPresents?: number;
  joursAbsents?: number;
  congesPayes?: number;
  congesNonPayes?: number;
  heuresSupplementaires?: number;
  heuresWeekend?: number;
  heuresFeries?: number;
  minutesRetard?: number;

  tauxHoraire?: number;
  salaireBase: number;
  gains?: Record<string, number>;
  retenues?: Record<string, number>;
  remboursements?: number;
  totalBrut: number;
  cotisations?: Cotisations;
  salaireNet: number;
  fiscal?: DetailFiscal;

  pdfKey?: string;
  statut: string;
  genereLe: string;
}

const tnd = (v?: number) => `${(v ?? 0).toFixed(3)} TND`;

const PALETTE = ['#4F46E5', '#3b82f6', '#8B5CF6', '#F59E0B', '#F43F5E', '#22A6BF'];

const couleurDe = (nom: string) => PALETTE[(nom || 'A').charCodeAt(0) % PALETTE.length];

const initiales = (nom: string) =>
  (nom || 'XX').split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const LIBELLES_GAIN: Record<string, string> = {
  heuresSupplementaires: 'Heures supplémentaires',
  heuresWeekend: 'Heures de weekend',
  heuresFeries: 'Heures de jours fériés',
  primes: 'Primes',
};

const LIBELLES_RETENUE: Record<string, string> = {
  absences: 'Absences non justifiées',
  retards: 'Retards',
};

async function telechargerPdf(facture: Facture) {
  // Passe par api.get : un lien direct n'enverrait pas le jeton Cognito,
  // et une URL relative viserait CloudFront au lieu de l'API.
  const blob = await api.get(
    `/factures/pdf/${encodeURIComponent(facture.id)}`,
    { responseType: 'blob' }
  ) as unknown as Blob;

  // Une réponse d'erreur arrive elle aussi sous forme de Blob : sans ce
  // contrôle, un message JSON serait enregistré avec l'extension .pdf
  if (blob.type !== 'application/pdf') {
    const texte = await blob.text();
    let message = 'Bulletin indisponible';
    try {
      message = JSON.parse(texte)?.erreur ?? message;
    } catch {
      // Réponse HTML : la requête n'a pas atteint l'API
    }
    throw new Error(message);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${facture.numero}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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
            <AlertTriangle className="w-5 h-5 text-red-500" />
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
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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

// ── Détail d'un bulletin ───────────────────────────────────────────
function ModalDetailFacture({ facture, onClose }: { facture: Facture; onClose: () => void }) {
  const [erreur, setErreur] = useState('');

  const handlePdf = async () => {
    try {
      setErreur('');
      await telechargerPdf(facture);
    } catch (e: any) {
      setErreur(e.message);
    }
  };

  const tempsDeTravail: [string, string][] = [
    ['Jours ouvrables', `${facture.nbJoursOuvrables ?? '—'}`],
    ['Jours travaillés', `${facture.joursPresents ?? '—'}`],
    ['Absences non justifiées', `${facture.joursAbsents ?? 0}`],
    ['Congés payés', `${facture.congesPayes ?? 0}`],
    ['Congés sans solde', `${facture.congesNonPayes ?? 0}`],
    ['Heures supplémentaires', `${facture.heuresSupplementaires ?? 0} h`],
    ['Heures de weekend', `${facture.heuresWeekend ?? 0} h`],
    ['Heures de jours fériés', `${facture.heuresFeries ?? 0} h`],
    ['Retard cumulé', `${facture.minutesRetard ?? 0} min`],
  ];

  const partNet = facture.totalBrut > 0
    ? (facture.salaireNet / facture.totalBrut) * 100
    : 100;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: couleurDe(facture.employeNom) }}
            >
              {initiales(facture.employeNom)}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg text-stone-800 truncate">
                {facture.employeNom}
              </h2>
              <p className="text-sm text-stone-500">
                {facture.moisLabel} · <span className="font-mono">{facture.numero}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors shrink-0">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {erreur && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {erreur}
            </div>
          )}

          {/* Le net à payer est ce que le salarié vérifie en premier */}
          <div className="bg-brand-500 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/70 mb-1 uppercase tracking-wider">Net à payer</p>
                <p className="text-3xl font-bold">{tnd(facture.salaireNet)}</p>
              </div>
              <div className="text-end">
                <p className="text-[10px] text-white/60 uppercase tracking-wider">Salaire brut</p>
                <p className="text-lg font-bold">{tnd(facture.totalBrut)}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-surface/80 rounded-full" style={{ width: `${partNet}%` }} />
            </div>
            <p className="text-[10px] text-white/60 mt-1.5">
              {partNet.toFixed(1)} % du brut après cotisations et impôts
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-stone-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-3">
                Temps de travail
              </p>
              <div className="space-y-1.5">
                {tempsDeTravail.map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-stone-500">{l}</span>
                    <span className="font-bold text-stone-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-stone-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-3">
                Rémunération
              </p>

              <div className="flex justify-between text-sm mb-2">
                <span className="text-stone-500">Salaire de base</span>
                <span className="font-bold text-stone-800">{tnd(facture.salaireBase)}</span>
              </div>
              {facture.tauxHoraire !== undefined && (
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-stone-400">Taux horaire</span>
                  <span className="text-stone-500">{facture.tauxHoraire.toFixed(3)} TND/h</span>
                </div>
              )}

              {facture.gains && Object.entries(facture.gains).some(([, v]) => v > 0) && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-[10px] font-bold text-brand-texte uppercase tracking-wider mb-2">
                    Gains
                  </p>
                  {Object.entries(facture.gains).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-stone-500">{LIBELLES_GAIN[k] ?? k}</span>
                      <span className="font-bold text-brand-texte">+{tnd(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {facture.retenues && Object.entries(facture.retenues).some(([, v]) => v > 0) && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">
                    Retenues
                  </p>
                  {Object.entries(facture.retenues).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-stone-500">{LIBELLES_RETENUE[k] ?? k}</span>
                      <span className="font-bold text-red-500">-{tnd(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {facture.cotisations && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">
                    Cotisations et impôts
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">CNSS</span>
                    <span className="font-bold text-red-500">-{tnd(facture.cotisations.cnss)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">IRPP</span>
                    <span className="font-bold text-red-500">-{tnd(facture.cotisations.irpp)}</span>
                  </div>
                  {facture.cotisations.css > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-stone-500">Contribution de solidarité</span>
                      <span className="font-bold text-red-500">-{tnd(facture.cotisations.css)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Un remboursement de frais n'est pas une rémunération :
                  il s'ajoute au net, sans cotisations ni impôt. */}
              {(facture.remboursements ?? 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">Remboursement de frais</span>
                    <span className="font-bold text-blue-600">
                      +{tnd(facture.remboursements)}
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1">
                    Hors assiette de cotisations
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Justification du calcul de l'impôt — ce qui distingue un
              bulletin crédible d'un simple affichage de montants */}
          {facture.fiscal && (
            <div className="bg-surface rounded-xl p-4 border border-stone-100">
              <p className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-3">
                Base de calcul de l'impôt
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {([
                  ['Brut annualisé', tnd(facture.fiscal.brutAnnualise)],
                  ['CNSS annualisée', `-${tnd(facture.fiscal.cnssAnnualisee)}`],
                  ['Frais professionnels', `-${tnd(facture.fiscal.fraisProfessionnels)}`],
                  ['Abattements familiaux', `-${facture.fiscal.abattementsFamiliaux.toFixed(3)} TND`],
                  ['Revenu net imposable', tnd(facture.fiscal.revenuNetImposable)],
                  ['Taux de prélèvement', `${facture.fiscal.tauxMoyen} %`],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-stone-400">{l}</span>
                    <span className="font-medium text-stone-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-stone-400 border-t border-stone-100 pt-4">
            <span>
              Généré le {new Date(facture.genereLe).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span className="font-bold">{facture.statut}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={handlePdf}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Télécharger le PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Génération d'un bulletin ───────────────────────────────────────
function ModalGeneration({ employes, onClose, onSuccess }: {
  employes: Employe[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [form, setForm] = useState({
    employeId: '',
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    primes: 0,
    deduireRetards: false,
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [conflit, setConflit] = useState(false);
  const [resultat, setResultat] = useState<Facture | null>(null);

  const employeSelectionne = employes.find((e) => e.id === form.employeId) as any;

  const generer = async (regenerer: boolean) => {
    setEnvoi(true);
    setErreur('');
    setConflit(false);
    try {
      const res = await facturesService.generer({ ...form, regenerer }) as any;
      const facture = res?.data?.facture ?? null;
      setResultat(facture);
      onSuccess(
        facture
          ? `Bulletin ${facture.numero} généré`
          : 'Bulletin généré'
      );
    } catch (err: any) {
      const message = err?.erreur || err?.message || 'Erreur lors de la génération';
      // 409 : un bulletin existe déjà pour cette période
      if (/existe déjà/i.test(message)) setConflit(true);
      setErreur(message);
    } finally {
      setEnvoi(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeId) { setErreur('Sélectionnez un salarié'); return; }
    generer(false);
  };

  const champ =
    'w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col">

        <div className="flex items-center justify-between p-6 border-b border-stone-200 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-stone-800">
              {resultat ? 'Bulletin généré' : 'Générer un bulletin'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {resultat
                ? 'Calculé à partir des pointages de la période'
                : 'Le calcul utilise les pointages et congés enregistrés'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        {resultat ? (
          <div className="p-6 overflow-y-auto custom-scrollbar">
            <div className="bg-brand-500 rounded-2xl p-5 text-center text-white mb-4">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-white/80" />
              <p className="text-xs text-white/70 uppercase tracking-wider mb-1">Net à payer</p>
              <p className="text-3xl font-bold">{tnd(resultat.salaireNet)}</p>
              <p className="text-xs text-white/60 mt-1 font-mono">{resultat.numero}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              {([
                ['Jours travaillés', `${resultat.joursPresents ?? 0}`],
                ['Absences', `${resultat.joursAbsents ?? 0}`],
                ['Heures supp.', `${resultat.heuresSupplementaires ?? 0} h`],
                ['Retard cumulé', `${resultat.minutesRetard ?? 0} min`],
                ['Salaire brut', tnd(resultat.totalBrut)],
                ['Cotisations', `-${tnd(resultat.cotisations?.total)}`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="bg-stone-50 rounded-lg p-2.5">
                  <div className="text-stone-400 text-[10px]">{l}</div>
                  <div className="font-bold text-stone-800">{v}</div>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 font-bold text-sm transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
            {erreur && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
                {erreur}
                {conflit && (
                  <button
                    type="button"
                    onClick={() => generer(true)}
                    className="block mt-2 font-bold underline"
                  >
                    Remplacer le bulletin existant
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">Salarié</label>
              <select
                value={form.employeId}
                onChange={(e) => setForm({ ...form, employeId: e.target.value })}
                className={champ}
              >
                <option value="">Sélectionner…</option>
                {employes.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.prenom} {emp.nom} — {emp.poste}
                  </option>
                ))}
              </select>
            </div>

            {/* Le salaire vient de la fiche employé : il n'est plus saisi
                à chaque génération, ce qui garantit la cohérence entre
                deux bulletins successifs. */}
            {employeSelectionne && (
              <div className="bg-stone-50 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-stone-500">Salaire brut mensuel</span>
                  <span className="font-bold text-stone-800">
                    {employeSelectionne.salaireBrutMensuel
                      ? `${employeSelectionne.salaireBrutMensuel} TND`
                      : 'non renseigné'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Situation familiale</span>
                  <span className="text-stone-700">
                    {employeSelectionne.chefDeFamille ? 'Chef de famille' : 'Célibataire'}
                    {employeSelectionne.nbEnfants > 0 && `, ${employeSelectionne.nbEnfants} enfant(s)`}
                  </span>
                </div>
                {!employeSelectionne.salaireBrutMensuel && (
                  <p className="text-amber-600 pt-1">
                    Renseignez le salaire sur la fiche du salarié avant de générer.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Mois</label>
                <select
                  value={form.mois}
                  onChange={(e) => setForm({ ...form, mois: Number(e.target.value) })}
                  className={champ}
                >
                  {MOIS_NOMS.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">Année</label>
                <input
                  type="number"
                  value={form.annee}
                  onChange={(e) => setForm({ ...form, annee: Number(e.target.value) })}
                  className={champ}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5">
                Primes exceptionnelles (TND)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={form.primes}
                onChange={(e) => setForm({ ...form, primes: Number(e.target.value) })}
                className={champ}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer bg-stone-50 rounded-xl p-3">
              <input
                type="checkbox"
                checked={form.deduireRetards}
                onChange={(e) => setForm({ ...form, deduireRetards: e.target.checked })}
                className="mt-0.5 accent-brand-texte"
              />
              <span>
                <span className="text-sm font-medium text-stone-800">
                  Retenir les retards sur le salaire
                </span>
                <span className="block text-xs text-stone-400 mt-0.5">
                  Doit être prévu par le règlement intérieur. Désactivé par défaut.
                </span>
              </span>
            </label>

            <div className="flex gap-3 pt-1">
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
                className="flex-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {envoi
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Play className="w-4 h-4" />}
                {envoi ? 'Calcul…' : 'Générer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
export default function InvoicingPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreMois, setFiltreMois] = useState('tous');
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [page, setPage] = useState(0);

  const [generation, setGeneration] = useState(false);
  const [detail, setDetail] = useState<Facture | null>(null);
  const [aSupprimer, setASupprimer] = useState<Facture | null>(null);
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
      const [facRes, empRes] = await Promise.all([
        facturesService.lister() as any,
        employesService.lister() as any,
      ]);

      // Le plus récent d'abord : la RH consulte le dernier mois.
      const liste: Facture[] = (facRes?.data?.factures ?? [])
        .sort((a: Facture, b: Facture) =>
          String(b.periode).localeCompare(String(a.periode)));
      setFactures(liste);

      // Le statut a été normalisé en majuscules, mais des données
      // migrées peuvent encore porter l'ancienne valeur.
      const emps: Employe[] = empRes?.data?.employes ?? [];
      setEmployes(emps.filter((e) => String(e.statut).toUpperCase() === 'ACTIF'));
    } catch (e) {
      console.error('Chargement de la paie :', e);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const handleSupprimer = async (f: Facture) => {
    try {
      await (facturesService as any).supprimer(f.id);
      setASupprimer(null);
      charger();
      setToast(`Bulletin ${f.numero} supprimé`);
    } catch (e) {
      console.error(e);
      setASupprimer(null);
      setToast('Suppression impossible');
    }
  };

  const handlePdf = async (f: Facture) => {
    try {
      await telechargerPdf(f);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  // Les périodes disponibles viennent des bulletins eux-mêmes : une
  // liste figée afficherait des mois sans aucun bulletin.
  const periodes = useMemo(() => {
    const liste = new Set(factures.map((f) => f.periode).filter(Boolean));
    return [...liste].sort().reverse();
  }, [factures]);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return factures.filter((f) => {
      if (filtreMois !== 'tous' && f.periode !== filtreMois) return false;
      if (filtreEmploye && f.employeId !== filtreEmploye) return false;
      if (!terme) return true;
      return `${f.employeNom} ${f.numero} ${f.employePoste ?? ''}`
        .toLowerCase()
        .includes(terme);
    });
  }, [factures, recherche, filtreMois, filtreEmploye]);

  const pageCourante = useMemo(
    () => filtres.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE),
    [filtres, page]
  );

  useEffect(() => { setPage(0); }, [recherche, filtreMois, filtreEmploye]);

  // Les totaux portent sur la sélection : filtrer un mois donne la
  // masse salariale de ce mois, pas celle de tous les temps.
  const totalNet = filtres.reduce((s, f) => s + (f.salaireNet ?? 0), 0);
  const totalBrut = filtres.reduce((s, f) => s + (f.totalBrut ?? 0), 0);
  const totalCotisations = filtres.reduce((s, f) => s + (f.cotisations?.total ?? 0), 0);

  const nbFiltres = (filtreMois !== 'tous' ? 1 : 0) + (filtreEmploye ? 1 : 0);

  const champ =
    'w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-500 transition-colors';

  return (
    <div className="min-h-screen" style={{ backgroundColor: FOND }}>
      <Layout searchPlaceholder="Rechercher un bulletin…">

        {/* ── En-tête ── */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-stone-200">
          <div>
            <nav className="flex text-xs text-stone-500 mb-2 gap-2 items-center">
              <span>Administration</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-brand-texte font-semibold">Paie</span>
            </nav>
            <h2 className="text-3xl font-bold text-stone-800">Paie</h2>
            <p className="text-stone-500 mt-1">
              {chargement ? 'Chargement…' : (
                <>
                  {filtres.length} bulletin{filtres.length > 1 ? 's' : ''} sur {factures.length}
                  {periodes.length > 0 && ` · ${periodes.length} période${periodes.length > 1 ? 's' : ''}`}
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
                placeholder="Nom, référence…"
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
                        onClick={() => { setFiltreMois('tous'); setFiltreEmploye(''); }}
                        className="text-xs font-medium text-stone-500 hover:text-stone-700"
                      >
                        Tout effacer
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1.5">
                      Période
                    </label>
                    <select
                      value={filtreMois}
                      onChange={(e) => setFiltreMois(e.target.value)}
                      className={champ}
                    >
                      <option value="tous">Toutes les périodes</option>
                      {periodes.map((p) => {
                        const [annee, mois] = p.split('-');
                        return (
                          <option key={p} value={p}>
                            {MOIS_NOMS[Number(mois)]} {annee}
                          </option>
                        );
                      })}
                    </select>
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
                </div>
              )}
            </div>

            <button
              onClick={() => setGeneration(true)}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2 rounded-xl shadow-sm transition-colors"
            >
              <Play className="w-4 h-4" />
              Générer
            </button>
          </div>
        </div>

        <div className="px-8 py-8">

          {/* ── Indicateurs ── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={TrendingUp}
              label="Masse salariale nette"
              value={chargement ? '…' : tnd(totalNet)}
              sub={filtreMois !== 'tous' ? 'sur la période filtrée' : 'tous bulletins confondus'}
              fond="bg-brand-500/10"
              texte="text-brand-texte"
            />
            <StatCard
              icon={FileText}
              label="Masse salariale brute"
              value={chargement ? '…' : tnd(totalBrut)}
              sub="avant cotisations"
              fond="bg-purple-50"
              texte="text-purple-600"
            />
            <StatCard
              icon={ShieldCheck}
              label="Cotisations et impôts"
              value={chargement ? '…' : tnd(totalCotisations)}
              sub="CNSS, IRPP et solidarité"
              fond="bg-amber-50"
              texte="text-amber-600"
            />
            <StatCard
              icon={Users}
              label="Salariés actifs"
              value={chargement ? '…' : employes.length}
              sub="éligibles à la paie"
              fond="bg-blue-50"
              texte="text-blue-600"
            />
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
          ) : filtres.length === 0 ? (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 p-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-stone-300" />
              </div>
              <p className="text-sm font-bold text-stone-800 mb-1">
                {recherche || nbFiltres > 0 ? 'Aucun résultat' : 'Aucun bulletin émis'}
              </p>
              {!recherche && nbFiltres === 0 && (
                <button
                  onClick={() => setGeneration(true)}
                  className="text-sm font-bold text-brand-texte hover:underline mt-2"
                >
                  Générer le premier bulletin
                </button>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                                        <th className="text-start px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[23%]">
                      Salarié
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[13%]">
                      Période
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[15%]">
                      Référence
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Brut
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Retenues
                    </th>
                    <th className="text-start px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[12%]">
                      Net
                    </th>
                    <th className="text-center px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 w-[13%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageCourante.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => setDetail(f)}
                      className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: couleurDe(f.employeNom) }}
                          >
                            {initiales(f.employeNom)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-stone-800 truncate">
                              {f.employeNom}
                            </div>
                            <div className="text-[10px] text-stone-400 truncate">
                              {f.employePoste}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm font-medium text-stone-800 truncate block">
                          {f.moisLabel}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-[11px] font-mono font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded-lg truncate inline-block max-w-full">
                          {f.numero}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm text-stone-700">{tnd(f.totalBrut)}</span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm text-red-500">
                          -{tnd(f.cotisations?.total)}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-sm font-bold text-brand-texte">
                          {tnd(f.salaireNet)}
                        </span>
                      </td>

                                            <td className="px-5 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetail(f)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                            title="Voir le détail"
                          >
                            <Eye className="w-4 h-4 text-stone-400" />
                          </button>
                          <button
                            onClick={() => handlePdf(f)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                            title="Télécharger le PDF"
                          >
                            <Download className="w-4 h-4 text-stone-400 hover:text-blue-500" />
                          </button>
                          <button
                            onClick={() => setASupprimer(f)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                            title="Supprimer le bulletin"
                          >
                            <Trash2 className="w-4 h-4 text-stone-400 hover:text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pagination
                page={page}
                taillePage={PAR_PAGE}
                total={filtres.length}
                onPage={setPage}
                libelle="bulletin"
                accent={ACCENT}
              />
            </div>
          )}

          {/* ── Règles appliquées ── */}
          {/* Un bulletin sans règles affichées se vérifie mal : les
              rappeler ici évite de chercher dans le code. */}
          <div className="mt-4 bg-surface rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-brand-texte" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                Règles appliquées
              </h4>
            </div>

                        <div className="grid grid-cols-3 gap-x-10 gap-y-3 text-sm">
              {([
                ['CNSS salariale', '9,68 %'],
                ['IRPP', '8 tranches'],
                ['Frais professionnels', '10 %'],
                ['Abattements familiaux', '300 + 100 TND'],
                ['Heures supplémentaires', '+50 %'],
                ['Weekend et fériés', '+75 % et +100 %'],
              ] as [string, string][]).map(([label, valeur]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-3 items-baseline border-b border-stone-50 pb-2">
                  <span className="text-xs text-stone-500">{label}</span>
                  <span className="text-xs font-bold text-stone-700 tabular-nums">{valeur}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-stone-400 mt-3">
              Taux paramétrables dans le moteur de calcul. Les remboursements de frais
              s'ajoutent au net sans entrer dans l'assiette des cotisations.
            </p>
          </div>
        </div>

        {generation && (
          <ModalGeneration
            employes={employes}
            onClose={() => setGeneration(false)}
            onSuccess={(msg) => { setToast(msg); charger(); }}
          />
        )}
        {detail && (
          <ModalDetailFacture facture={detail} onClose={() => setDetail(null)} />
        )}
        {aSupprimer && (
          <ModalConfirmation
            titre="Supprimer ce bulletin ?"
            message={
              `Le bulletin ${aSupprimer.numero} de ${aSupprimer.employeNom} sera `
              + `définitivement supprimé. Il pourra être regénéré depuis les pointages.`
            }
            libelleAction="Supprimer"
            onConfirmer={() => handleSupprimer(aSupprimer)}
            onAnnuler={() => setASupprimer(null)}
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