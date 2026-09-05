// src/pages/admin/DashboardPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Users, Briefcase, Clock, DollarSign, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { employesService } from '@/services/employes';
import { useAuth } from '@/context/AuthContext';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  loading?: boolean;
}

function StatCard({ title, value, change, positive, icon: Icon, onClick, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl p-5 border border-[#e5e0d8] animate-pulse">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100" />
          <div className="h-4 w-12 bg-gray-100 rounded" />
        </div>
        <div className="h-8 w-20 bg-gray-100 rounded mb-2" />
        <div className="h-3 w-24 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-5 border border-[#e5e0d8] ${onClick ? 'cursor-pointer hover:shadow-sm' : ''} transition-shadow`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#d8f3dc] flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#2d6a4f]" />
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium ${positive ? 'text-[#2d6a4f]' : 'text-[#e53e3e]'}`}>
          {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {change}
        </span>
      </div>
      <div className="text-2xl font-bold text-[#1a1a1a] mb-0.5">{value}</div>
      <div className="text-xs text-[#6b7280]">{title}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    openPositions: 0,
    pendingLeaves: 0,
    monthlyPayroll: 0,
  });
  const [headcountData, setHeadcountData] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  // Charger les données
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Récupérer tous les employés
        const response = await employesService.lister();

const parsed = typeof response.data === "string"
  ? JSON.parse(response.data)
  : response.data;

const employes = parsed?.employes ?? [];


        const actifs = employes.filter((e: any) => e.statut === 'actif');

        // Calculer les stats
        setStats({
          totalEmployees: actifs.length,
          openPositions: 14, // À remplacer par API des offres
          pendingLeaves: 8,  // À remplacer par API des congés
          monthlyPayroll: actifs.reduce((sum: number, e: any) => sum + (e.salaire || 0), 0),
        });

        // Générer headcount data (6 derniers mois)
        const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
        const headcount = months.map((month, i) => ({
          month,
          count: actifs.length - (5 - i) * 3, // Simulation croissance
        }));
        setHeadcountData(headcount);

        // Calculer distribution par département
        const deptCounts = actifs.reduce((acc: any, emp: any) => {
          acc[emp.departement] = (acc[emp.departement] || 0) + 1;
          return acc;
        }, {});

        const deptData = Object.entries(deptCounts).map(([name, count]: any) => ({
          name,
          count,
          pct: Math.round((count / actifs.length) * 100),
        }));
        setDepartments(deptData.slice(0, 5)); // Top 5

        // Activités récentes (simulées - à remplacer par vraie API)
        setRecentActivities([
          { 
            action: 'New employee onboarded', 
            detail: `${actifs[0]?.prenom} ${actifs[0]?.nom} – ${actifs[0]?.poste}`,
            time: '2h ago',
            color: 'bg-[#d8f3dc]',
            textColor: 'text-[#2d6a4f]'
          },
          {
            action: 'Department updated',
            detail: `${actifs[1]?.departement} team restructured`,
            time: '5h ago',
            color: 'bg-[#dbeafe]',
            textColor: 'text-[#1e40af]'
          },
          {
            action: 'Payroll processed',
            detail: `€${(stats.monthlyPayroll / 1000).toFixed(1)}K for current month`,
            time: '1d ago',
            color: 'bg-[#fef3c7]',
            textColor: 'text-[#92400e]'
          },
        ]);

      } catch (error) {
        console.error('Erreur chargement dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Données graphiques (hiringData simulé - à remplacer)
  const hiringData = [
    { month: 'May', hired: 8, left: 3 },
    { month: 'Jun', hired: 12, left: 5 },
    { month: 'Jul', hired: 9, left: 4 },
    { month: 'Aug', hired: 15, left: 6 },
    { month: 'Sep', hired: 7, left: 2 },
    { month: 'Oct', hired: 11, left: 3 },
  ];

  return (
    <Layout searchPlaceholder="Search dashboard...">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Dashboard</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Welcome back, {user?.prenom}. Here's what's happening today.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Employees"
          value={stats.totalEmployees.toString()}
          change="+4.2%"
          positive={true}
          icon={Users}
          onClick={() => navigate('/allemployees')}
          loading={loading}
        />
        <StatCard
          title="Open Positions"
          value={stats.openPositions.toString()}
          change="+2 new"
          positive={true}
          icon={Briefcase}
          onClick={() => navigate('/job-offers')}
          loading={loading}
        />
        <StatCard
          title="Pending Leaves"
          value={stats.pendingLeaves.toString()}
          change="-1 this week"
          positive={false}
          icon={Clock}
          loading={loading}
        />
        <StatCard
          title="Monthly Payroll"
          value={`€${(stats.monthlyPayroll / 1000).toFixed(1)}K`}
          change="+4.2%"
          positive={true}
          icon={DollarSign}
          onClick={() => navigate('/invoicing')}
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Headcount chart */}
        <div className="col-span-2 bg-white rounded-xl p-5 border border-[#e5e0d8]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[#1a1a1a] text-sm">Headcount Growth</h3>
              <p className="text-xs text-[#6b7280]">Total employees over the last 6 months</p>
            </div>
          </div>
          {loading ? (
            <div className="h-45 bg-gray-50 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={headcountData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d6a4f" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2d6a4f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e0d8', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="#2d6a4f" strokeWidth={2} fill="url(#colorCount)" dot={{ fill: '#2d6a4f', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Departments */}
        <div className="bg-white rounded-xl p-5 border border-[#e5e0d8]">
          <h3 className="font-semibold text-[#1a1a1a] text-sm mb-1">By Department</h3>
          <p className="text-xs text-[#6b7280] mb-4">Employee distribution</p>
          <div className="space-y-3">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-gray-100 rounded mb-2" />
                  <div className="h-1.5 bg-gray-100 rounded" />
                </div>
              ))
            ) : (
              departments.map(dept => (
                <div key={dept.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#374151]">{dept.name}</span>
                    <span className="text-xs font-medium text-[#6b7280]">{dept.count}</span>
                  </div>
                  <div className="h-1.5 bg-[#f0ebe0] rounded-full overflow-hidden">
                    <div className="h-full bg-[#2d6a4f] rounded-full" style={{ width: `${dept.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Hiring Activity */}
        <div className="col-span-2 bg-white rounded-xl p-5 border border-[#e5e0d8]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[#1a1a1a] text-sm">Hiring Activity</h3>
              <p className="text-xs text-[#6b7280]">Hired vs departures per month</p>
            </div>
            <button onClick={() => navigate('/pipeline')} className="text-xs text-[#2d6a4f] font-medium flex items-center gap-1 hover:underline">
              View Pipeline <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={hiringData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e0d8', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="hired" fill="#2d6a4f" radius={[3, 3, 0, 0]} name="Hired" />
              <Bar dataKey="left" fill="#d8f3dc" radius={[3, 3, 0, 0]} name="Departures" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-5 border border-[#e5e0d8]">
          <h3 className="font-semibold text-[#1a1a1a] text-sm mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start gap-2.5 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-gray-100 mt-1.5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-2 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))
            ) : (
              recentActivities.map((act, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${act.color} border-2 border-current ${act.textColor}`} />
                  <div>
                    <div className="text-xs font-medium text-[#1a1a1a]">{act.action}</div>
                    <div className="text-[11px] text-[#6b7280]">{act.detail}</div>
                    <div className="text-[10px] text-[#9ca3af] mt-0.5">{act.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}