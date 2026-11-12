// src/pages/employee/PayslipsPage.tsx
import { useState, useEffect } from 'react';
import { Download, FileText, Calendar, TrendingUp, ChevronLeft, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

interface Facture {
  id: string;
  numero: string;
  employeId: string;
  employeNom: string;
  employePoste: string;
  moisLabel: string;
  mois: number;
  annee: number;
  salaireBase: number;
  salaireNet: number;
  totalPrimes: number;
  totalDeductions: number;
  genereLe: string;
  pdfBase64?: string;
}

export default function PayslipsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
  const charger = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('🔍 Chargement fiches pour employé:', user?.sub);

      // ✅ Appel API
      const response = await api.get('/factures');

      console.log('📊 Réponse API complète:', response);
      console.log('📊 response.data:', response.data);

      // ✅ CORRECTION : Adapter au format backend
      if (response.data && response.data.succes) {
        // ✅ Les factures sont dans response.data.data.factures
        const allFactures = response.data.data?.factures || [];
        
        console.log(`✅ Total factures reçues: ${allFactures.length}`);
        console.log('📊 Première fiche:', allFactures[0]);

        // ✅ Vérification : le backend filtre déjà pour les employés
        // Mais on peut doubler la vérification côté frontend
        const mesFactures = allFactures.filter((f: any) => {
          const match =  f.employeId === user?.sub;
          console.log(`Fiche ${f.numero}: employeId=${f.employeId}, user.id=${user?.sub}, match=${match}`);
          return match;
        });

        console.log(`✅ Fiches filtrées pour cet employé: ${mesFactures.length}`);
        setFactures(mesFactures);

        if (mesFactures.length === 0 && allFactures.length > 0) {
          console.warn('⚠️ Aucune fiche ne correspond à user.id:', user?.sub);
          setError(`Aucune fiche trouvée pour votre compte (ID: ${user?.sub})`);
        }
      } else {
        throw new Error('Format de réponse invalide');
      }
    } catch (e: any) {
      console.error('❌ Erreur chargement fiches:', e);
      console.error('❌ e.response:', e.response);
      setError(e.response?.data?.erreur || e.message || 'Impossible de charger vos fiches de paie');
    } finally {
      setLoading(false);
    }
  };

  charger();
}, [ user?.sub]);

  const handleDownload = (facture: Facture) => {
    if (!facture.pdfBase64) {
      alert('PDF non disponible pour cette fiche');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${facture.pdfBase64}`;
      link.download = `${facture.numero}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log(`✅ Téléchargement PDF: ${facture.numero}`);
    } catch (e) {
      console.error('❌ Erreur téléchargement:', e);
      alert('Erreur lors du téléchargement du PDF');
    }
  };

  // Filtrer par année
  const facturesFiltrees = factures.filter(f => f.annee === selectedYear);

  // Calculer total annuel
  const totalAnnuel = facturesFiltrees.reduce((sum, f) => sum + (f.salaireNet || 0), 0);

  // Années disponibles
  const anneesDisponibles = factures.length > 0
    ? [...new Set(factures.map(f => f.annee))].sort((a, b) => b - a)
    : [new Date().getFullYear()];

  return (
    <Layout searchPlaceholder="Search payslips...">
      <div className="max-w-6xl mx-auto p-6">
        {/* Bouton retour */}
        <button
          onClick={() => navigate('/employe')}
          className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour au dashboard
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">
              Mes fiches de paie
            </h1>
            <p className="text-stone-500">
              Consultez et téléchargez l'historique complet de vos bulletins de salaire
            </p>
            {/* Debug info */}
            <p className="text-xs text-stone-400 mt-2">
              ID utilisateur: {user?.sub || 'non défini'}
            </p>
          </div>

          {/* Filtre année */}
          {anneesDisponibles.length > 0 && (
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2.5 bg-surface border border-stone-200 rounded-xl text-sm font-medium focus:outline-none focus:border-brand-600 shadow-sm"
            >
              {anneesDisponibles.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Erreur de chargement</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Stats annuelles */}
        {!loading && factures.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div className="bg-surface border border-stone-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-brand-100 rounded-xl">
                  <FileText className="w-5 h-5 text-brand-texte" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Fiches {selectedYear}
                  </div>
                  <div className="text-2xl font-bold text-stone-900">
                    {facturesFiltrees.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-stone-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Total perçu {selectedYear}
                  </div>
                  <div className="text-2xl font-bold text-stone-900">
                    {totalAnnuel.toFixed(2)} TND
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-stone-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-amber-50 rounded-xl">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Moyenne mensuelle
                  </div>
                  <div className="text-2xl font-bold text-stone-900">
                    {facturesFiltrees.length > 0
                      ? (totalAnnuel / facturesFiltrees.length).toFixed(2)
                      : '0.00'
                    } TND
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tableau des fiches */}
        <div className="bg-surface border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-stone-200 bg-stone-50">
            <h3 className="font-bold text-stone-900 text-lg">Historique détaillé</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  {['Période', 'N° Bulletin', 'Salaire de base', 'Primes', 'Déductions', 'Salaire net', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-start px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="border-b border-stone-200">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-6 py-4">
                          <div className="h-4 bg-gray-100 rounded w-20 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : facturesFiltrees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="text-5xl mb-4">📄</div>
                      <p className="text-lg font-medium text-stone-900 mb-2">
                        {factures.length === 0
                          ? 'Aucune fiche de paie disponible'
                          : `Aucune fiche pour l'année ${selectedYear}`
                        }
                      </p>
                      <p className="text-sm text-stone-400">
                        {factures.length === 0
                          ? 'Vos bulletins de salaire apparaîtront ici une fois générés par le département RH'
                          : 'Sélectionnez une autre année pour voir vos fiches'
                        }
                      </p>
                    </td>
                  </tr>
                ) : (
                  facturesFiltrees
                    .sort((a, b) => {
                      if (b.annee !== a.annee) return b.annee - a.annee;
                      return b.mois - a.mois;
                    })
                    .map(facture => (
                      <tr key={facture.id} className="border-b border-stone-200 hover:bg-stone-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-sm text-stone-900">
                            {facture.moisLabel}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-stone-500">
                            {facture.numero}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-700">
                          {facture.salaireBase?.toFixed(2)} TND
                        </td>
                        <td className="px-6 py-4 text-sm text-green-600">
                          +{facture.totalPrimes?.toFixed(2) || '0.00'} TND
                        </td>
                        <td className="px-6 py-4 text-sm text-red-600">
                          -{facture.totalDeductions?.toFixed(2) || '0.00'} TND
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-brand-texte">
                            {facture.salaireNet?.toFixed(2)} TND
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-500">
                          {new Date(facture.genereLe).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDownload(facture)}
                            disabled={!facture.pdfBase64}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={facture.pdfBase64 ? 'Télécharger PDF' : 'PDF non disponible'}
                          >
                            <Download className="w-4 h-4" />
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && facturesFiltrees.length > 0 && (
            <div className="px-6 py-4 border-t border-stone-200 bg-stone-50">
              <p className="text-sm text-stone-500">
                Affichage de <strong>{facturesFiltrees.length}</strong> fiche(s) pour l'année {selectedYear}
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}