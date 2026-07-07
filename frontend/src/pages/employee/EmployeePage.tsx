// src/pages/employee/EmployeeDashboard.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Briefcase, Eye, Clock, FileText } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { employesService } from '@/services/employes';
import type { Employe } from '@/types';

const DEPARTMENTS = ['All', 'Informatique', 'RH', 'Finance', 'Marketing', 'R&D'];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');

  // Charger les données
  const charger = async () => {
    try {
      setLoading(true);
      const res = await employesService.lister() as any;
      const data: Employe[] = res?.data?.employes ?? res?.employes ?? [];
      setEmployes(data.filter((e: Employe) => e.statut === 'actif'));
    } catch (e) {
      console.error('Erreur chargement employés:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  // Filtrer
  const filtered = employes.filter(emp => {
    const name = `${emp.prenom} ${emp.nom}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase()) || 
      emp.poste?.toLowerCase().includes(search.toLowerCase());
    const matchDept = selectedDept === 'All' || emp.departement === selectedDept;
    return matchSearch && matchDept;
  });

  // Statistiques
  const stats = {
    total: filtered.length,
    actifs: filtered.filter(e => e.statut === 'actif').length,
    departments: [...new Set(employes.map(e => e.departement))].length,
  };

  const statusVariant = (s: string) => {
    if (s === 'actif') return 'green' as const;
    if (s === 'conge') return 'amber' as const;
    return 'gray' as const;
  };

  const statusLabel = (s: string) => {
    if (s === 'actif') return 'Active';
    if (s === 'conge') return 'On Leave';
    return 'Inactive';
  };

  return (
    <Layout searchPlaceholder="Search employees...">
      <div className="max-w-7xl">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">My Team</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            {loading ? 'Loading...' : `${stats.actifs} active team members across ${stats.departments} departments`}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#d8f3dc] rounded-xl flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-[#2d6a4f]" />
              </div>
              <div>
                <p className="text-xs text-[#9ca3af] font-medium">Total Employees</p>
                <p className="text-2xl font-bold text-[#1a1a1a]">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[#9ca3af] font-medium">Active Today</p>
                <p className="text-2xl font-bold text-[#1a1a1a]">{stats.actifs}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e0d8] rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-[#9ca3af] font-medium">Departments</p>
                <p className="text-2xl font-bold text-[#1a1a1a]">{stats.departments}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[#e5e0d8] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-[#e5e0d8] rounded-xl p-1">
            {DEPARTMENTS.map(dept => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedDept === dept
                    ? 'bg-[#2d6a4f] text-white'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0ebe0] bg-[#fafaf8]">
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Position</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Joined</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Loading skeleton
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-[#f0ebe0]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded w-28 animate-pulse" />
                          <div className="h-2.5 bg-gray-100 rounded w-20 animate-pulse" />
                        </div>
                      </div>
                    </td>
                    {[1,2,3,4,5].map(j => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-gray-100 rounded w-20 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="text-sm text-[#6b7280]">
                      {search ? `No results for "${search}"` : 'No employees found.'}
                    </p>
                  </td>
                </tr>
              ) : (
                // Data rows
                filtered.map(emp => (
                  <tr
                    key={emp.id}
                    className="border-b border-[#f0ebe0] last:border-0 hover:bg-[#fafaf8] transition-colors cursor-pointer"
                    onClick={() => navigate(`/employe/colleagues/${emp.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${emp.prenom} ${emp.nom}`} />
                        <div>
                          <div className="font-semibold text-sm text-[#1a1a1a]">
                            {emp.prenom} {emp.nom}
                          </div>
                          <div className="text-xs text-[#9ca3af]">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-[#374151]">
                        <Briefcase className="w-3.5 h-3.5 text-[#9ca3af]" />
                        {emp.departement}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#374151]">
                      {emp.poste}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(emp.statut)}>
                        {statusLabel(emp.statut)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#6b7280]">
                      {new Date(emp.creeLe).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/employe/colleagues/${emp.id}`)}
                        className="flex items-center gap-1.5 text-xs text-[#2d6a4f] font-medium hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-[#f0ebe0] bg-[#fafaf8]">
              <span className="text-xs text-[#6b7280]">
                Showing <strong>{filtered.length}</strong> of <strong>{employes.length}</strong> employees
              </span>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}