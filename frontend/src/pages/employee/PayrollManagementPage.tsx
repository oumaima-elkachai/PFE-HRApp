// src/pages/admin/PayrollManagementPage.tsx
import { useState, useEffect } from 'react';
import {
  Download, FileText, Users, TrendingUp, Calendar,
  Search, Filter, ChevronDown, Eye, Trash2, Plus,
  AlertCircle, CheckCircle2, Clock, X,
} from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { facturesService } from '../../services/factures';
import { employesService } from '../../services/employes';
import type { Employe } from '../../types';

interface Facture {
  id: string;
  numero: string;
  employeId: string;
  employeNom: string;
  employePoste: string;
  employeDept: string;
  moisLabel: string;
  mois: number;
  annee: number;
  salaireBase: number;
  salaireNet: number;
  genereLe: string;
  pdfBase64?: string;
  statut: string;
}

// ── Modal Générer Fiche ───────────────────────
function ModalGenererFiche({ employes, onClose, onSuccess }: {
  employes: Employe[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    employeId: '',
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear(),
    salaireBase: 2500,
  });
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeId) {
      setErreur('Veuillez sélectionner un employé');
      return;
    }

    setLoading(true);
    setErreur('');

    try {
      await facturesService.generer({
        employeId: form.employeId,
        mois: form.mois,
        annee: form.annee,
        salaireBase: Number(form.salaireBase),
        primes: [],
        deductions: [
          { libelle: 'CNSS (5.5%)', montant: Number(form.salaireBase) * 0.055 },
        ],
        heuresSupplementaires: 0,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erreur génération:', err);
      setErreur(err?.erreur || 'Erreur lors de la génération de la fiche');
    } finally {
      setLoading(false);
    }
  };

  const moisNoms = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];

  const employeSelectionne = employes.find(e => e.id === form.employeId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[#e5e0d8]">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#1a1a1a]">
              Générer une fiche de paie
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1">
              Création automatique avec calcul CNSS (5.5%)
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {erreur && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {erreur}
            </div>
          )}

          {/* Sélection employé */}
          <div>
            <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2">
              Employé *
            </label>
            <select
              value={form.employeId}
              onChange={e => setForm({ ...form, employeId: e.target.value })}
              className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
            >
              <option value="">-- Sélectionner un employé --</option>
              {employes.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.prenom} {emp.nom} — {emp.poste} ({emp.departement})
                </option>
              ))}
            </select>
          </div>

          {/* Aperçu employé sélectionné */}
          {employeSelectionne && (
            <div className="bg-[#d8f3dc] border border-[#2d6a4f]/20 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#2d6a4f] text-white flex items-center justify-center font-bold">
                  {employeSelectionne.prenom[0]}{employeSelectionne.nom[0]}
                </div>
                <div>
                  <div className="font-semibold text-sm text-[#1a1a1a]">
                    {employeSelectionne.prenom} {employeSelectionne.nom}
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    {employeSelectionne.poste} · {employeSelectionne.departement}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Période */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2">
                Mois *
              </label>
              <select
                value={form.mois}
                onChange={e => setForm({ ...form, mois: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
              >
                {moisNoms.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2">
                Année *
              </label>
              <input
                type="number"
                value={form.annee}
                onChange={e => setForm({ ...form, annee: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
              />
            </div>
          </div>

          {/* Salaire de base */}
          <div>
            <label className="text-xs font-bold text-[#1a1a1a] uppercase tracking-wider block mb-2">
              Salaire de base (TND) *
            </label>
            <input
              type="number"
              step="0.01"
              value={form.salaireBase}
              onChange={e => setForm({ ...form, salaireBase: Number(e.target.value) })}
              className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
            />
            <p className="text-xs text-[#9ca3af] mt-2">
              Déduction CNSS : {(form.salaireBase * 0.055).toFixed(2)} TND
            </p>
            <p className="text-xs font-semibold text-[#2d6a4f] mt-1">
              Salaire net estimé : {(form.salaireBase - form.salaireBase * 0.055).toFixed(2)} TND
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-2 border-[#e5e0d8] bg-white text-[#374151] rounded-xl py-3 text-sm font-semibold hover:bg-[#f5f0e8] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !form.employeId}
              className="flex-1 bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Générer la fiche
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────
export default function PayrollManagementPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all');
  const [filterEmploye, setFilterEmploye] = useState<string>('all');

  const charger = async () => {
    try {
      setLoading(true);
      const [facRes, empRes] = await Promise.all([
        facturesService.lister() as any,
        employesService.lister() as any,
      ]);

      const allFactures = facRes?.data?.factures ?? [];
      setFactures(allFactures);

      const allEmployes = empRes?.data?.employes ?? [];
      setEmployes(allEmployes.filter((e: Employe) => e.statut === 'actif'));
    } catch (e) {
      console.error('Erreur chargement:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const handleDownload = (facture: Facture) => {
    if (!facture.pdfBase64) {
      alert('PDF non disponible');
      return;
    }
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${facture.pdfBase64}`;
    link.download = `${facture.numero}.pdf`;
    link.click();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette fiche de paie ?')) return;
    // TODO: Implémenter la suppression
    alert('Fonctionnalité de suppression à implémenter');
  };

  // Filtrage
  const facturesFiltrees = factures.filter(f => {
    const matchSearch = f.employeNom.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        f.numero.toLowerCase().includes(searchQuery.toLowerCase());
    const matchYear = f.annee === filterYear;
    const matchMonth = filterMonth === 'all' || f.mois === filterMonth;
    const matchEmploye = filterEmploye === 'all' || f.employeId === filterEmploye;

    return matchSearch && matchYear && matchMonth && matchEmploye;
  });

  // Stats
  const totalFiches = factures.length;
  const totalMontant = factures.reduce((sum, f) => sum + (f.salaireNet || 0), 0);
  const fichesMoisActuel = factures.filter(f => 
    f.mois === new Date().getMonth() + 1 && f.annee === new Date().getFullYear()
  ).length;

  const anneesDisponibles = [...new Set(factures.map(f => f.annee))].sort((a, b) => b - a);

  const moisNoms = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ];

  return (
    <Layout searchPlaceholder="Search payslips...">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#1a1a1a] mb-2">
              Gestion des Fiches de Paie
            </h1>
            <p className="text-[#6b7280]">
              Vue d'ensemble de toutes les fiches de paie générées
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white px-6 py-3 rounded-xl font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-5 h-5" />
            Générer une fiche
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#d8f3dc] rounded-xl">
                <FileText className="w-6 h-6 text-[#2d6a4f]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                  Total Fiches
                </div>
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {totalFiches}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                  Montant Total Versé
                </div>
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {totalMontant.toFixed(2)} TND
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-xl">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                  Fiches Mois Actuel
                </div>
                <div className="text-2xl font-bold text-[#1a1a1a]">
                  {fichesMoisActuel}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white border border-[#e5e0d8] rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Recherche */}
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9ca3af]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou numéro..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
                />
              </div>
            </div>

            {/* Filtre année */}
            <select
              value={filterYear}
              onChange={e => setFilterYear(Number(e.target.value))}
              className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
            >
              {anneesDisponibles.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Filtre mois */}
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
            >
              <option value="all">Tous les mois</option>
              {moisNoms.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>

            {/* Filtre employé */}
            <select
              value={filterEmploye}
              onChange={e => setFilterEmploye(e.target.value)}
              className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e5e0d8] rounded-xl focus:outline-none focus:border-[#2d6a4f] text-sm"
            >
              <option value="all">Tous les employés</option>
              {employes.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.prenom} {emp.nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tableau */}
        <div className="bg-white border border-[#e5e0d8] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0] bg-[#fafaf8]">
                {['Employé', 'Période', 'N° Bulletin', 'Salaire Base', 'Salaire Net', 'Généré le', 'Actions'].map(h => (
                  <th key={h} className="text-left px-6 py-4 text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : facturesFiltrees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="text-4xl mb-3">📄</div>
                    <p className="text-[#6b7280]">
                      {searchQuery || filterMonth !== 'all' || filterEmploye !== 'all'
                        ? 'Aucune fiche ne correspond aux filtres'
                        : 'Aucune fiche de paie générée'}
                    </p>
                  </td>
                </tr>
              ) : (
                facturesFiltrees
                  .sort((a, b) => new Date(b.genereLe).getTime() - new Date(a.genereLe).getTime())
                  .map(facture => (
                    <tr key={facture.id} className="border-b border-[#f0ebe0] hover:bg-[#fafaf8] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-sm text-[#1a1a1a]">
                          {facture.employeNom}
                        </div>
                        <div className="text-xs text-[#9ca3af]">
                          {facture.employePoste} · {facture.employeDept}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-[#374151]">
                          {facture.moisLabel}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-[#6b7280]">
                          {facture.numero}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#374151]">
                        {facture.salaireBase?.toFixed(2)} TND
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-[#2d6a4f]">
                          {facture.salaireNet?.toFixed(2)} TND
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6b7280]">
                        {new Date(facture.genereLe).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(facture)}
                            disabled={!facture.pdfBase64}
                            className="p-2 border border-[#e5e0d8] rounded-lg hover:bg-[#d8f3dc] hover:border-[#2d6a4f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Télécharger PDF"
                          >
                            <Download className="w-4 h-4 text-[#2d6a4f]" />
                          </button>
                          <button
                            onClick={() => handleDelete(facture.id)}
                            className="p-2 border border-[#e5e0d8] rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>

          {!loading && facturesFiltrees.length > 0 && (
            <div className="px-6 py-4 border-t border-[#e5e0d8] bg-[#fafaf8]">
              <p className="text-sm text-[#6b7280]">
                Affichage de <strong>{facturesFiltrees.length}</strong> fiche(s) sur {factures.length} au total
              </p>
            </div>
          )}
        </div>
      

      {/* Modal */}
      {showModal && (
        <ModalGenererFiche
          employes={employes}
          onClose={() => setShowModal(false)}
          onSuccess={charger}
        />
      )}
    </Layout>
  );
}