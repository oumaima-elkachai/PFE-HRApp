import { useState, useEffect } from 'react';
import {
  Download, Play, TrendingUp, Zap, MoreHorizontal,
  SlidersHorizontal, FileText, User, Building2,
  CheckCircle2, Sparkles, ShieldCheck, X,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { facturesService } from '../../services/factures';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';

type FilterTab = 'All Transactions' | 'Salary' | 'Invoices';

// ── Types locaux ──────────────────────────────
interface Transaction {
  id: string;
  beneficiary: string;
  role: string;
  type: 'Salary Payment' | 'Vendor Invoice';
  reference: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Pending';
  isVendor: boolean;
}

// ── Badge statut ──────────────────────────────
function StatusBadge({ status }: { status: 'Paid' | 'Pending' }) {
  if (status === 'Paid') return (
    <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-texte text-xs px-2.5 py-1 rounded-full font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />Paid
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 bg-amber-100 text-[#92400e] text-xs px-2.5 py-1 rounded-full font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-[#92400e]" />Pending
    </span>
  );
}

function ModalGenererFacture({ employes, onClose, onSuccess }: {
  employes: Employe[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeId:     '',
    mois:          new Date().getMonth() + 1,
    annee:         new Date().getFullYear(),
    tauxHoraire:   15,   // TND/heure
    heuresContrat: 8,    // heures/jour
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur]   = useState('');
  const [preview, setPreview] = useState<any>(null);

  const moisNoms = ['','Janvier','Février','Mars','Avril','Mai','Juin',
                    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeId) { setErreur('Sélectionner un employé'); return; }
    setLoading(true);
    setErreur('');
    try {
      const res = await facturesService.generer({
        employeId:     form.employeId,
        mois:          form.mois,
        annee:         form.annee,
        tauxHoraire:   Number(form.tauxHoraire),
        heuresContrat: Number(form.heuresContrat),
      }) as any;
      setPreview(res?.data?.facture ?? null);
      onSuccess();
      if (!res?.data?.facture) onClose();
    } catch (err: any) {
      setErreur(err?.erreur || 'Erreur génération');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 className="font-bold text-lg">Générer une fiche de paie</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-stone-500" /></button>
        </div>

        {preview ? (
          // Résumé après génération
          <div className="p-6">
            <div className="bg-brand-100 rounded-xl p-4 mb-4 text-center">
              <div className="text-2xl font-black text-brand-texte">{preview.salaireNet?.toFixed(3)} TND</div>
              <div className="text-sm text-brand-texte font-medium">Net à payer</div>
              <div className="text-xs text-stone-500 mt-1">{preview.numero}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              {[
                ['Jours présents', `${preview.joursPresents}j`],
                ['Jours absents',  `${preview.joursAbsents}j`],
                ['Heures normales',`${preview.heuresNormales}h`],
                ['Heures supp',    `${preview.heuresSupp}h`],
                ['Total brut',     `${preview.totalBrut?.toFixed(3)} TND`],
                ['CNSS + IRPP',    `-${((preview.deductions?.cnss || 0) + (preview.deductions?.irpp || 0)).toFixed(3)} TND`],
              ].map(([l, v]) => (
                <div key={l} className="bg-stone-100 rounded-lg p-2">
                  <div className="text-stone-400">{l}</div>
                  <div className="font-bold text-stone-900">{v}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full bg-brand-600 text-white rounded-xl py-2.5 font-bold">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {erreur && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">❌ {erreur}</div>}

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Employé *</label>
              <select value={form.employeId} onChange={e => setForm({...form, employeId: e.target.value})}
                className="w-full px-3 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-600">
                <option value="">Sélectionner...</option>
                {employes.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom} — {emp.poste}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Mois</label>
                <select value={form.mois} onChange={e => setForm({...form, mois: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-600">
                  {moisNoms.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Année</label>
                <input type="number" value={form.annee} onChange={e => setForm({...form, annee: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-600" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Taux horaire (TND/h)</label>
                <input type="number" step="0.5" value={form.tauxHoraire}
                  onChange={e => setForm({...form, tauxHoraire: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-600" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Heures/jour (contrat)</label>
                <input type="number" step="0.5" value={form.heuresContrat}
                  onChange={e => setForm({...form, heuresContrat: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-sm bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:border-brand-600" />
              </div>
            </div>

            {/* Preview calcul */}
            <div className="bg-stone-100 rounded-xl p-3 text-xs text-stone-500">
              <div className="font-bold text-stone-700 mb-1">📊 Estimation</div>
              <div>Salaire base : {(form.tauxHoraire * form.heuresContrat * 22).toFixed(0)} TND/mois</div>
              <div>Basé sur les pointages réels de {moisNoms[form.mois]}</div>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium hover:bg-stone-100 transition-colors">
                Annuler
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-brand-600 hover:bg-brand-800 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60">
                {loading ? 'Calcul en cours...' : 'Générer la fiche'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function InvoicingPage() {
  const [activeTab, setActiveTab]       = useState<FilterTab>('All Transactions');
  const [factures, setFactures]         = useState<any[]>([]);
  const [employes, setEmployes]         = useState<Employe[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  //const [totalNet, setTotalNet]         = useState('0');
  const tabs: FilterTab[]               = ['All Transactions', 'Salary', 'Invoices'];

  const charger = async () => {
    try {
      setLoading(true);
      const [facRes, empRes] = await Promise.all([
        facturesService.lister() as any,
        employesService.lister() as any,
      ]);
      const f = facRes?.data?.factures ?? facRes?.factures ?? [];
      setFactures(f);
      //setTotalNet(facRes?.data?.totalNet ?? '0');
      const e = empRes?.data?.employes ?? empRes?.employes ?? [];
      setEmployes(e.filter((emp: Employe) => emp.statut === 'actif'));
    } catch (err) {
      console.error('Erreur chargement invoicing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  // Convertir factures → transactions
  const transactions: Transaction[] = factures.map(f => ({
    id:          f.id,
    beneficiary: f.employeNom,
    role:        f.employePoste || 'Employé',
    type:        'Salary Payment',
    reference:   f.numero,
    amount:      f.salaireNet,
    date:        new Date(f.genereLe).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
    status:      'Paid',
    isVendor:    false,
  }));

  const filtered = transactions.filter(tx => {
    if (activeTab === 'Salary')   return tx.type === 'Salary Payment';
    if (activeTab === 'Invoices') return tx.type === 'Vendor Invoice';
    return true;
  });

  const totalMensuel = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);

  return (
    <Layout searchPlaceholder="Search invoices...">
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-stone-400 mb-4">
          <span>Organization</span>
          <span></span>
          <span className="text-brand-texte font-medium">Billing & Payroll</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Financial Overview</h1>
            <p className="text-sm text-stone-500 mt-0.5">Manage all monthly transactions, salaries, and operating expenses.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 border border-stone-200 bg-surface text-stone-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-stone-100 transition-colors">
              <Download className="w-4 h-4" />
              Export Report
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <Play className="w-4 h-4" />
              Run Payroll
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          <div className="bg-surface rounded-2xl border border-stone-200 p-5">
            <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2">Total Monthly Expenses</div>
            {loading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse w-40" />
            ) : (
              <>
                <div className="text-3xl font-bold text-stone-900">{totalMensuel.toFixed(2)} TND</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-brand-texte">
                    <TrendingUp className="w-3 h-3" />
                    {factures.length} fiches générées
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="bg-surface rounded-2xl border border-stone-200 p-5">
            <div className="text-sm font-medium text-stone-500 mb-2">Pending Invoices</div>
            <div className="text-2xl font-bold text-stone-900 mb-2">0 TND</div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <div className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center">
                <span className="text-brand-texte font-bold text-[8px]">✓</span>
              </div>
              All invoices processed
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stone-200 p-5">
            <div className="text-sm font-medium text-stone-500 mb-2">Automation Status</div>
            <div className="text-2xl font-bold text-stone-900 mb-2">Active</div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              DynamoDB Local synced
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-surface rounded-2xl border border-stone-200 mb-5">
          <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-stone-900 text-lg">Monthly Transactions</h3>
              <div className="flex bg-stone-100 rounded-lg p-0.5">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeTab === tab ? 'bg-surface text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1.5 hover:bg-stone-100 rounded-lg">
                <SlidersHorizontal className="w-4 h-4 text-stone-500" />
              </button>
              <button className="p-1.5 hover:bg-stone-100 rounded-lg">
                <MoreHorizontal className="w-4 h-4 text-stone-500" />
              </button>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200">
                {['Beneficiary / Vendor','Transaction Type','Reference','Amount','Date','Status','Action'].map(h => (
                  <th key={h} className={`text-start ${h==='Beneficiary / Vendor'?'px-6':'px-4'} py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-wider`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-stone-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-28 animate-pulse" />
                          <div className="h-2.5 bg-gray-100 rounded w-20 animate-pulse" />
                        </div>
                      </div>
                    </td>
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded w-16 animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="text-4xl mb-3">💰</div>
                    <p className="text-sm text-stone-500">
                      No transactions yet. Click "Run Payroll" to generate payslips.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(tx => (
                  <tr key={tx.id} className="border-b border-stone-200 last:border-0 hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${tx.isVendor ? 'bg-stone-500' : 'bg-brand-600'}`}>
                          {tx.isVendor
                            ? <Building2 className="w-4 h-4" />
                            : tx.beneficiary.split(' ').map((n: string) => n[0]).join('').slice(0,2)
                          }
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-stone-900">{tx.beneficiary}</div>
                          <div className="text-xs text-stone-400">{tx.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        {tx.isVendor ? <FileText className="w-3.5 h-3.5 text-stone-500" /> : <User className="w-3.5 h-3.5 text-stone-500" />}
                        <span className="text-sm text-stone-700">{tx.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-stone-500 font-mono">{tx.reference}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-stone-900">{tx.amount.toFixed(2)} TND</td>
                    <td className="px-4 py-4 text-sm text-stone-500">{tx.date}</td>
                    <td className="px-4 py-4"><StatusBadge status={tx.status} /></td>
                    <td className="px-4 py-4">
                      <button className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors">
                        <FileText className="w-4 h-4 text-stone-500" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-stone-200">
              <span className="text-sm text-stone-500">
                Showing <strong>{filtered.length}</strong> transactions
              </span>
            </div>
          )}
        </div>

        {/* Bottom Cards */}
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-surface rounded-2xl border border-stone-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-brand-texte" />
              <h4 className="font-bold text-stone-900">Smart Reconciliation</h4>
            </div>
            <p className="text-sm text-stone-500 mb-4">
              AI engine has automatically matched{' '}
              <span className="text-brand-texte font-semibold">92%</span>{' '}
              of this month's receipts to bank statements.
            </p>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full" style={{ width: '92%' }} />
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stone-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-brand-texte" />
              <h4 className="font-bold text-stone-900">Compliance Check</h4>
            </div>
            <p className="text-sm text-stone-500 mb-4">
              Tax regulations for <span className="text-brand-texte font-semibold">2026</span>{' '}
              are verified and payroll logic updated for Tunisia.
            </p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-texte" />
              <span className="text-xs font-semibold text-brand-texte uppercase tracking-wider">No Anomalies Detected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <ModalGenererFacture
          employes={employes}
          onClose={() => setShowModal(false)}
          onSuccess={charger}
        />
      )}
    </Layout>
  );
}