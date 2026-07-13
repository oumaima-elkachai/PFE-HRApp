import { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Calendar, AlertCircle, ChevronLeft } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { facturesService } from '../../services/factures';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';


interface Facture {
  id: string;
  numero: string;
  mois: number;
  annee: number;
  moisLabel: string;
  salaireBase: number;
  salaireNet: number;
  statut: string;
  genereLe: string;
  employeNom?: string;
}

const MOIS = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function StatCard({ icon: Icon, label, value, iconBg = 'bg-[#d8f3dc]', iconColor = 'text-[#2d6a4f]' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e0d8] p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm text-[#6b7280]">{label}</p>
        <p className="text-2xl font-bold text-[#1a1a1a] leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function MesFacturesPage() {
  const { user }                  = useAuth();
  const navigate = useNavigate();
  
  const [factures, setFactures]   = useState<Facture[]>([]);
  const [loading, setLoading]     = useState(true);
  const [erreur, setErreur]       = useState('');
  const [anneeFiltre, setAnneeFiltre] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState<string | null>(null);

  const charger = async () => {
    try {
      setLoading(true);
      setErreur('');

      const res = await facturesService.lister() as any;
      console.log('Réponse factures:', res);

      const data = res?.data?.factures ?? res?.factures ?? res?.data ?? [];

      if (!Array.isArray(data)) {
        setErreur('Format de réponse invalide');
        setFactures([]);
        return;
      }

      setFactures(data);
    } catch (e: any) {
      console.error('Erreur factures:', e);
      setErreur(e?.erreur || e?.message || 'Erreur de chargement');
      setFactures([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const handleTelechargement = async (facture: Facture) => {
    setDownloading(facture.id);
    try {
      // Tenter d'abord via la route PDF
      const response = await fetch(`/api/factures/pdf/${facture.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${facture.numero}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        console.error('PDF non disponible');
      }
    } catch (e) {
      console.error('Erreur téléchargement:', e);
    } finally {
      setDownloading(null);
    }
  };

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const facturesFiltrees = factures.filter(f => f.annee === anneeFiltre);
  const totalNet = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);
  const annees   = [...new Set(factures.map(f => f.annee))].sort((a, b) => b - a);
  if (annees.length === 0) annees.push(new Date().getFullYear());

  // Années disponibles
  const anneesDisponibles = factures.length > 0
    ? [...new Set(factures.map(f => f.annee))].sort((a, b) => b - a)
    : [new Date().getFullYear()];
  return (
    <Layout>
      <div className="max-w-5xl">
        {/* Bouton retour */}
        <button
          onClick={() => navigate('/employe')}
          className="flex items-center gap-2 text-[#6b7280] hover:text-[#1a1a1a] mb-6 text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour au dashboard
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#1a1a1a] mb-2">
              Mes fiches de paie
            </h1>
            <p className="text-[#6b7280]">
              Consultez et téléchargez l'historique complet de vos bulletins de salaire
            </p>
            
          </div>

          {/* Filtre année */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex gap-2">
            {annees.map(a => (
              <button key={a} onClick={() => setAnneeFiltre(a)}
                className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all ${
                  anneeFiltre === a
                    ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]'
                    : 'bg-white text-[#6b7280] border-[#e5e0d8] hover:border-[#2d6a4f]'
                }`}>
                {a}
              </button>
            ))}
          </div>
        </div>

        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={FileText}
            label="Total fiches de paie"
            value={loading ? '...' : factures.length}
            iconBg="bg-[#dbeafe]"
            iconColor="text-[#3b82f6]"
          />
          <StatCard
            icon={TrendingUp}
            label="Total net perçu"
            value={loading ? '...' : `${totalNet.toFixed(0)} TND`}
          />
          <StatCard
            icon={Calendar}
            label="Cette année"
            value={loading ? '...' : facturesFiltrees.length}
            iconBg="bg-[#fef9c3]"
            iconColor="text-[#ca8a04]"
          />
        </div>

        

        {/* Erreur */}
        {erreur && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">Erreur de chargement</p>
              <p className="text-xs text-red-600">{erreur}</p>
              <button onClick={charger} className="text-xs text-red-700 font-bold underline mt-1">
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Table des factures */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0ebe0] bg-[#faf9f7]">
            <h3 className="font-black text-lg text-[#1a1a1a]">
              Historique détaillé
            </h3>
            <span className="text-xs font-bold bg-[#ede8df] text-[#6b7280] px-2 py-0.5 rounded-full">
              {loading ? '...' : `${facturesFiltrees.length} fiche${facturesFiltrees.length > 1 ? 's' : ''}`}
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0]">
                {['Période','Référence','Salaire brut','Salaire net','Statut','PDF'].map(h => (
                  <th key={h} className={`text-left ${h==='Période'?'px-6':'px-4'} py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-widest`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-[#f0ebe0] rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : facturesFiltrees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="text-5xl mb-4">📄</div>
                    <p className="text-base font-bold text-[#1a1a1a] mb-2">
                      {factures.length === 0
                        ? 'Aucune fiche de paie disponible'
                        : `Aucune fiche pour ${anneeFiltre}`}
                    </p>
                    <p className="text-sm text-[#6b7280]">
                      {factures.length === 0
                        ? 'Vos fiches de paie apparaîtront ici une fois générées par le RH'
                        : 'Essayez une autre année'}
                    </p>
                    {factures.length === 0 && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl inline-block text-left">
                        <p className="text-xs font-bold text-amber-700 mb-1">💡 Debug info</p>
                        <p className="text-xs text-amber-600">
                          Email: {user?.email}<br />
                          Les fiches doivent être générées avec votre ID employé
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                facturesFiltrees.map(f => (
                  <tr key={f.id} className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#faf9f7] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm text-[#1a1a1a]">
                        {f.moisLabel || MOIS[f.mois] || `Mois ${f.mois}`} {f.annee}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono font-bold text-[#6b7280] bg-[#f0ebe0] px-2 py-1 rounded-lg">
                        {f.numero}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-[#374151]">
                      {f.salaireBase?.toFixed(3)} TND
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-bold text-sm text-[#2d6a4f]">
                        {f.salaireNet?.toFixed(3)} TND
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#16a34a]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                        {f.statut === 'genere' ? 'Payé' : f.statut}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleTelechargement(f)}
                        disabled={downloading === f.id}
                        className="flex items-center gap-1.5 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {downloading === f.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Note debug si 0 factures mais employé existe */}
        {!loading && !erreur && factures.length === 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
            <p className="font-bold text-amber-800 mb-2">💡 Note technique</p>
            <p className="text-amber-700">
              Si vous avez des fiches de paie générées mais qu'elles n'apparaissent pas,
              demandez à votre RH de régénérer une fiche avec votre compte actuel.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}