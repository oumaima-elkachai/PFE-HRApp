import Layout from '@/components/layout/Layout';
import { Download, TrendingUp, Users, DollarSign, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const monthlyHire = [
  { month: 'Jan', hired: 5 }, { month: 'Feb', hired: 8 }, { month: 'Mar', hired: 12 },
  { month: 'Apr', hired: 6 }, { month: 'May', hired: 9 }, { month: 'Jun', hired: 11 },
  { month: 'Jul', hired: 7 }, { month: 'Aug', hired: 15 }, { month: 'Sep', hired: 8 },
  { month: 'Oct', hired: 11 }, { month: 'Nov', hired: 0 }, { month: 'Dec', hired: 0 },
];

const salaryTrend = [
  { month: 'May', amount: 132000 }, { month: 'Jun', amount: 135000 }, { month: 'Jul', amount: 137500 },
  { month: 'Aug', amount: 140000 }, { month: 'Sep', amount: 141200 }, { month: 'Oct', amount: 142850 },
];

const deptDist = [
  { name: 'Engineering', value: 68, color: '#2d6a4f' },
  { name: 'Sustainability', value: 52, color: '#52b788' },
  { name: 'Design', value: 35, color: '#95d5b2' },
  { name: 'HR', value: 28, color: '#b7e4c7' },
  { name: 'Operations', value: 64, color: '#d8f3dc' },
];

const reportCards = [
  { title: 'Total Employees', value: '247', change: '+12 this quarter', icon: Users, positive: true },
  { title: 'Avg Salary', value: '$87,400', change: '+3.2% YoY', icon: DollarSign, positive: true },
  { title: 'Turnover Rate', value: '6.2%', change: '-1.1% vs last year', icon: TrendingUp, positive: true },
  { title: 'Open Roles', value: '14', change: '+3 this month', icon: Briefcase, positive: false },
];

export default function ReportsPage() {
  return (
    <Layout>
    <div className="p-7">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Reports & Analytics</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Insights and metrics for data-driven decisions</p>
        </div>
        <button className="flex items-center gap-2 border border-[#e5e0d8] bg-white text-[#374151] text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-[#f5f0e8] transition-colors">
          <Download className="w-4 h-4" />
          Export All Reports
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {reportCards.map(card => (
          <div key={card.title} className="bg-white rounded-xl border border-[#e5e0d8] p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#d8f3dc] flex items-center justify-center">
                <card.icon className="w-5 h-5 text-[#2d6a4f]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#1a1a1a] mb-0.5">{card.value}</div>
            <div className="text-xs text-[#6b7280]">{card.title}</div>
            <div className={`text-[11px] mt-1 font-medium ${card.positive ? 'text-[#2d6a4f]' : 'text-[#e53e3e]'}`}>{card.change}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5 mb-5">
        {/* Monthly Hires */}
        <div className="col-span-2 bg-white rounded-2xl border border-[#e5e0d8] p-5">
          <h3 className="font-semibold text-[#1a1a1a] text-sm mb-1">Monthly Hiring Activity</h3>
          <p className="text-xs text-[#6b7280] mb-4">New hires per month – current year</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyHire} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e0d8', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="hired" fill="#2d6a4f" radius={[4, 4, 0, 0]} name="Hired" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-5">
          <h3 className="font-semibold text-[#1a1a1a] text-sm mb-1">Department Distribution</h3>
          <p className="text-xs text-[#6b7280] mb-4">Current headcount</p>
          <div className="flex justify-center">
            <PieChart width={160} height={160}>
              <Pie data={deptDist} cx={75} cy={75} innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                {deptDist.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </div>
          <div className="space-y-1.5 mt-2">
            {deptDist.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs text-[#374151]">{d.name}</span>
                </div>
                <span className="text-xs font-medium text-[#6b7280]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payroll Trend */}
      <div className="bg-white rounded-2xl border border-[#e5e0d8] p-5">
        <h3 className="font-semibold text-[#1a1a1a] text-sm mb-1">Payroll Trend</h3>
        <p className="text-xs text-[#6b7280] mb-4">Monthly payroll expenses over the last 6 months</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={salaryTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe0" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, 'Payroll']} contentStyle={{ background: '#fff', border: '1px solid #e5e0d8', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="amount" stroke="#2d6a4f" strokeWidth={2} dot={{ fill: '#2d6a4f', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
    </Layout>
  );
}
