// src/pages/admin/InvoicingPage.tsx

import { useState, useEffect } from 'react';
import {
  Download, Play, TrendingUp, FileText,
  CheckCircle2, ShieldCheck, X, Trash2, Eye, AlertTriangle,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { facturesService } from '../../services/factures';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';
import api from '../../services/api';

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
  totalBrut: number;
  cotisations?: Cotisations;
  salaireNet: number;
  fiscal?: DetailFiscal;

  pdfKey?: string;
  statut: string;
  genereLe: string;
}

const tnd = (v?: number) => `${(v ?? 0).toFixed(3)} TND`;

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

// ── Carte statistique ──────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, iconBg = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e0d8] p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-[#6b7280]">{label}</p>
        <p className="text-2xl font-bold text-[#1a1a1a] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Détail d'un bulletin ───────────────────────────────────────────
function ModalDetailFacture({ facture, onClose }: { facture: Facture; onClose: () => void }) {
  const [erreur, setErreur] = useState('');

  const handlePDF = async () => {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0] sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-black text-lg text-[#1a1a1a]">{facture.numero}</h2>
            <p className="text-sm text-[#6b7280]">
              {facture.moisLabel} — {facture.employeNom}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {erreur}
            </div>
          )}

          <div className="bg-[#2d6a4f] rounded-xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70 mb-1">NET À PAYER</p>
                <p className="text-3xl font-black">{tnd(facture.salaireNet)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">Salaire brut</p>
                <p className="text-lg font-bold">{tnd(facture.totalBrut)}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/80 rounded-full" style={{ width: `${partNet}%` }} />
            </div>
            <p className="text-xs text-white/60 mt-1">
              {partNet.toFixed(1)} % du brut après cotisations et impôts
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#f8f6f2] rounded-xl p-4 border border-[#ede8df]">
              <p className="text-xs font-black text-[#6b7280] uppercase tracking-wider mb-3">
                Temps de travail
              </p>
              <div className="space-y-1.5">
                {tempsDeTravail.map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-[#6b7280]">{l}</span>
                    <span className="font-bold text-[#1a1a1a]">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#f8f6f2] rounded-xl p-4 border border-[#ede8df]">
              <p className="text-xs font-black text-[#6b7280] uppercase tracking-wider mb-3">
                Rémunération
              </p>

              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#6b7280]">Salaire de base</span>
                <span className="font-bold text-[#1a1a1a]">{tnd(facture.salaireBase)}</span>
              </div>
              {facture.tauxHoraire !== undefined && (
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9ca3af]">Taux horaire</span>
                  <span className="text-[#6b7280]">{facture.tauxHoraire.toFixed(3)} TND/h</span>
                </div>
              )}

              {facture.gains && Object.entries(facture.gains).some(([, v]) => v > 0) && (
                <div className="mt-3 pt-3 border-t border-[#e5e0d8]">
                  <p className="text-xs font-black text-[#2d6a4f] uppercase tracking-wider mb-2">Gains</p>
                  {Object.entries(facture.gains).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-[#6b7280]">{LIBELLES_GAIN[k] ?? k}</span>
                      <span className="font-bold text-[#2d6a4f]">+{tnd(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {facture.retenues && Object.entries(facture.retenues).some(([, v]) => v > 0) && (
                <div className="mt-3 pt-3 border-t border-[#e5e0d8]">
                  <p className="text-xs font-black text-red-600 uppercase tracking-wider mb-2">Retenues</p>
                  {Object.entries(facture.retenues).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-[#6b7280]">{LIBELLES_RETENUE[k] ?? k}</span>
                      <span className="font-bold text-red-600">-{tnd(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {facture.cotisations && (
                <div className="mt-3 pt-3 border-t border-[#e5e0d8]">
                  <p className="text-xs font-black text-red-600 uppercase tracking-wider mb-2">
                    Cotisations et impôts
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7280]">CNSS (9,68 %)</span>
                    <span className="font-bold text-red-600">-{tnd(facture.cotisations.cnss)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6b7280]">IRPP</span>
                    <span className="font-bold text-red-600">-{tnd(facture.cotisations.irpp)}</span>
                  </div>
                  {facture.cotisations.css > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6b7280]">Contribution de solidarité</span>
                      <span className="font-bold text-red-600">-{tnd(facture.cotisations.css)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Justification du calcul de l'impôt — ce qui distingue un
              bulletin crédible d'un simple affichage de montants */}
          {facture.fiscal && (
            <div className="bg-white rounded-xl p-4 border border-[#ede8df]">
              <p className="text-xs font-black text-[#6b7280] uppercase tracking-wider mb-3">
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
                    <span className="text-[#9ca3af]">{l}</span>
                    <span className="font-medium text-[#374151]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-[#9ca3af] border-t border-[#f0ebe0] pt-4">
            <span>
              Généré le {new Date(facture.genereLe).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span>{facture.statut}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={handlePDF}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />Télécharger le PDF
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
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeId: '',
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    primes: 0,
    deduireRetards: false,
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [conflit, setConflit] = useState(false);
  const [resultat, setResultat] = useState<Facture | null>(null);

  const employeSelectionne = employes.find(e => e.id === form.employeId) as any;

  const generer = async (regenerer: boolean) => {
    setLoading(true);
    setErreur('');
    setConflit(false);
    try {
      const res = await facturesService.generer({ ...form, regenerer }) as any;
      setResultat(res?.data?.facture ?? null);
      onSuccess();
    } catch (err: any) {
      const message = err?.erreur || err?.message || 'Erreur lors de la génération';
      // 409 : un bulletin existe déjà pour cette période
      if (/existe déjà/i.test(message)) setConflit(true);
      setErreur(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeId) { setErreur('Sélectionnez un employé'); return; }
    generer(false);
  };

  const champCls =
    'w-full px-3 py-2.5 text-sm bg-[#f8f6f2] border border-[#ede8df] rounded-xl focus:outline-none focus:border-[#2d6a4f]';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#f0ebe0]">
          <div>
            <h2 className="font-black text-lg text-[#1a1a1a]">Générer un bulletin</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Calcul à partir des pointages et congés enregistrés
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-xl">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        {resultat ? (
          <div className="p-6">
            <div className="bg-[#2d6a4f] rounded-xl p-5 text-center text-white mb-4">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-white/80" />
              <p className="text-sm text-white/70 mb-1">NET À PAYER</p>
              <p className="text-3xl font-black">{tnd(resultat.salaireNet)}</p>
              <p className="text-xs text-white/60 mt-1">{resultat.numero}</p>
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
                <div key={l} className="bg-[#f8f6f2] rounded-lg p-2.5 border border-[#ede8df]">
                  <div className="text-[#9ca3af] text-[10px]">{l}</div>
                  <div className="font-bold text-[#1a1a1a]">{v}</div>
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full bg-[#2d6a4f] text-white rounded-xl py-2.5 font-bold text-sm hover:bg-[#1b4332] transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {erreur && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
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
              <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-1.5">
                Employé
              </label>
              <select
                value={form.employeId}
                onChange={e => setForm({ ...form, employeId: e.target.value })}
                className={champCls}
              >
                <option value="">Sélectionner…</option>
                {employes.map(emp => (
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
              <div className="bg-[#f8f6f2] rounded-xl p-3 border border-[#ede8df] text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-[#6b7280]">Salaire brut mensuel</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {employeSelectionne.salaireBrutMensuel
                      ? `${employeSelectionne.salaireBrutMensuel} TND`
                      : 'non renseigné'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Situation familiale</span>
                  <span className="text-[#374151]">
                    {employeSelectionne.chefDeFamille ? 'Chef de famille' : 'Célibataire'}
                    {employeSelectionne.nbEnfants > 0 && `, ${employeSelectionne.nbEnfants} enfant(s)`}
                  </span>
                </div>
                {!employeSelectionne.salaireBrutMensuel && (
                  <p className="text-amber-700 mt-2">
                    Renseignez le salaire sur la fiche employé avant de générer.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-1.5">
                  Mois
                </label>
                <select
                  value={form.mois}
                  onChange={e => setForm({ ...form, mois: Number(e.target.value) })}
                  className={champCls}
                >
                  {MOIS_NOMS.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-1.5">
                  Année
                </label>
                <input
                  type="number"
                  value={form.annee}
                  onChange={e => setForm({ ...form, annee: Number(e.target.value) })}
                  className={champCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-[#374151] uppercase tracking-wider mb-1.5">
                Primes exceptionnelles (TND)
              </label>
              <input
                type="number" min="0" step="10"
                value={form.primes}
                onChange={e => setForm({ ...form, primes: Number(e.target.value) })}
                className={champCls}
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-[#6b7280]">
              <input
                type="checkbox"
                checked={form.deduireRetards}
                onChange={e => setForm({ ...form, deduireRetards: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                Retenir les retards sur le salaire
                <span className="block text-[#9ca3af]">
                  Doit être prévu par le règlement intérieur. Désactivé par défaut.
                </span>
              </span>
            </label>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-[#e5e0d8] rounded-xl py-2.5 text-sm font-medium hover:bg-[#f5f0e8] transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Play className="w-4 h-4" />}
                {loading ? 'Calcul…' : 'Générer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────
const ITEMS_PAGE = 10;

export default function InvoicingPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGeneration, setShowGeneration] = useState(false);
  const [factureSel, setFactureSel] = useState<Facture | null>(null);
  const [flash, setFlash] = useState('');
  const [page, setPage] = useState(1);

  const montrerFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  };

  const charger = async () => {
    try {
      setLoading(true);
      const [facRes, empRes] = await Promise.all([
        facturesService.lister() as any,
        employesService.lister() as any,
      ]);
      setFactures(facRes?.data?.factures ?? []);

      // Le statut a été normalisé en majuscules, mais des données
      // migrées peuvent encore porter l'ancienne valeur.
      const emps: Employe[] = empRes?.data?.employes ?? [];
      setEmployes(emps.filter(e => String(e.statut).toUpperCase() === 'ACTIF'));
    } catch (e) {
      console.error('Chargement de la paie :', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const handleSupprimer = async (f: Facture) => {
    if (!confirm(`Supprimer le bulletin ${f.numero} ?`)) return;
    try {
      await (facturesService as any).supprimer(f.id);
      montrerFlash('Bulletin supprimé');
      charger();
    } catch (e) {
      console.error(e);
      montrerFlash('Suppression impossible');
    }
  };

  const handlePDF = async (f: Facture) => {
    try {
      await telechargerPdf(f);
    } catch (e: any) {
      montrerFlash(e.message);
    }
  };

  const totalNet = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);
  const totalCotisations = factures.reduce((s, f) => s + (f.cotisations?.total || 0), 0);
  const totalPages = Math.max(1, Math.ceil(factures.length / ITEMS_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const paginees = factures.slice((pageClamped - 1) * ITEMS_PAGE, pageClamped * ITEMS_PAGE);

  return (
    <Layout searchPlaceholder="Rechercher un bulletin…">
      <div>
        {flash && (
          <div className="fixed top-20 right-6 z-50 bg-[#2d6a4f] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
            {flash}
          </div>
        )}

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-[#1a1a1a] tracking-tight">Paie</h1>
            <p className="text-[#6b7280] mt-1">
              Bulletins de salaire calculés à partir des pointages réels
            </p>
          </div>
          <button
            onClick={() => setShowGeneration(true)}
            className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Play className="w-4 h-4" />Générer un bulletin
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={TrendingUp}
            label="Masse salariale nette"
            value={loading ? '…' : tnd(totalNet)}
            sub={`${factures.length} bulletin${factures.length > 1 ? 's' : ''}`}
          />
          <StatCard
            icon={FileText}
            label="Cotisations et impôts"
            value={loading ? '…' : tnd(totalCotisations)}
            sub="CNSS, IRPP et solidarité"
            iconBg="bg-[#fef9c3]"
            iconColor="text-[#ca8a04]"
          />
          <StatCard
            icon={ShieldCheck}
            label="Employés actifs"
            value={loading ? '…' : employes.length}
            sub="éligibles à la paie"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
        </div>

        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <h3 className="font-black text-lg text-[#1a1a1a]">Bulletins émis</h3>
            <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2.5 py-1 rounded-full">
              {factures.length}
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Employé', 'Période', 'Référence', 'Brut', 'Retenues', 'Net à payer', 'Actions'].map(h => (
                  <th
                    key={h}
                    className={`text-left ${h === 'Employé' ? 'px-6' : 'px-4'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[1, 2, 3, 4, 5, 6, 7].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-[#f0ebe0] rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="text-5xl mb-4">💰</div>
                    <p className="text-base font-bold text-[#1a1a1a] mb-2">Aucun bulletin émis</p>
                    <button
                      onClick={() => setShowGeneration(true)}
                      className="text-sm font-bold text-[#2d6a4f] hover:underline"
                    >
                      Générer le premier bulletin
                    </button>
                  </td>
                </tr>
              ) : (
                paginees.map(f => (
                  <tr key={f.id} className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#faf9f7] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#2d6a4f] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {f.employeNom?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-[#1a1a1a]">{f.employeNom}</div>
                          <div className="text-xs text-[#9ca3af]">{f.employePoste}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#374151] font-medium">{f.moisLabel}</td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono font-bold text-[#6b7280] bg-[#f0ebe0] px-2 py-1 rounded-lg">
                        {f.numero}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#374151]">{tnd(f.totalBrut)}</td>
                    <td className="px-4 py-4 text-sm text-red-600">
                      -{tnd(f.cotisations?.total)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-black text-sm text-[#2d6a4f]">{tnd(f.salaireNet)}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setFactureSel(f)}
                          className="p-1.5 hover:bg-[#f0ebe0] rounded-lg transition-colors"
                          title="Voir le détail"
                        >
                          <Eye className="w-4 h-4 text-[#6b7280]" />
                        </button>
                        <button
                          onClick={() => handlePDF(f)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Télécharger le PDF"
                        >
                          <Download className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => handleSupprimer(f)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-[#9ca3af] hover:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-[#f0ebe0] bg-[#faf9f7] flex items-center justify-between">
              <span className="text-xs text-[#6b7280]">
                Page <strong>{pageClamped}</strong> sur <strong>{totalPages}</strong>
              </span>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs font-bold rounded-lg border transition-colors ${
                      pageClamped === p
                        ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                        : 'border-[#e5e0d8] hover:bg-[#f0ebe0]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rappel des règles appliquées — utile en démonstration */}
        <div className="bg-white rounded-xl border border-[#e5e0d8] p-6 shadow-sm mt-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-[#2d6a4f]" />
            <h4 className="font-black text-[#1a1a1a]">Règles appliquées</h4>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-[#6b7280]">
            <div className="flex justify-between">
              <span>CNSS salariale</span>
              <span className="font-medium text-[#374151]">9,68 %, plafond 5 000 TND</span>
            </div>
            <div className="flex justify-between">
              <span>IRPP</span>
              <span className="font-medium text-[#374151]">barème progressif, 8 tranches</span>
            </div>
            <div className="flex justify-between">
              <span>Frais professionnels</span>
              <span className="font-medium text-[#374151]">10 %, plafond 2 000 TND/an</span>
            </div>
            <div className="flex justify-between">
              <span>Abattements familiaux</span>
              <span className="font-medium text-[#374151]">300 TND + 100 TND/enfant</span>
            </div>
            <div className="flex justify-between">
              <span>Heures supplémentaires</span>
              <span className="font-medium text-[#374151]">+75 %</span>
            </div>
            <div className="flex justify-between">
              <span>Weekend et jours fériés</span>
              <span className="font-medium text-[#374151]">+100 %</span>
            </div>
          </div>
          <p className="text-xs text-[#9ca3af] mt-3">
            Taux paramétrables dans le moteur de calcul. Les majorations d'heures
            supplémentaires peuvent être relevées par convention collective.
          </p>
        </div>
      </div>

      {showGeneration && (
        <ModalGeneration
          employes={employes}
          onClose={() => setShowGeneration(false)}
          onSuccess={charger}
        />
      )}
      {factureSel && (
        <ModalDetailFacture facture={factureSel} onClose={() => setFactureSel(null)} />
      )}
    </Layout>
  );
}