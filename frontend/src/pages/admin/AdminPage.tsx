import { Shield, Users, Settings, Bell, Database, Key, ChevronRight } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';

const adminSections = [
  {
    title: 'User Management',
    icon: Users,
    description: 'Manage roles, permissions and access levels',
    items: [
      { label: 'Super Admins', count: 2 },
      { label: 'HR Managers', count: 8 },
      { label: 'Employees', count: 237 },
    ],
  },
  {
    title: 'System Settings',
    icon: Settings,
    description: 'Configure platform behavior and integrations',
    items: [
      { label: 'AWS DynamoDB Connection', count: null, status: 'Connected' },
      { label: 'Email Service (SES)', count: null, status: 'Active' },
      { label: 'SSO Configuration', count: null, status: 'Enabled' },
    ],
  },
];

const notifications = [
  { label: 'System maintenance alerts', enabled: true },
  { label: 'New user registrations', enabled: true },
  { label: 'Failed login attempts', enabled: false },
  { label: 'Payroll processing status', enabled: true },
];

export default function AdminPage() {
  return (
    <div className="p-7">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Admin Panel</h1>
          <p className="text-sm text-stone-500 mt-0.5">Manage system settings, users, and configurations</p>
        </div>
        <div className="flex items-center gap-2 bg-brand-100 text-brand-texte px-3 py-2 rounded-xl text-sm font-medium">
          <Shield className="w-4 h-4" />
          Super Admin
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        {adminSections.map(section => (
          <div key={section.title} className="bg-surface rounded-2xl border border-stone-200 p-6">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
                <section.icon className="w-4.5 h-4.5 text-brand-texte" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 text-sm">{section.title}</h3>
                <p className="text-xs text-stone-500">{section.description}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {section.items.map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer hover:border-brand-600/30 transition-colors">
                  <span className="text-sm text-stone-700">{item.label}</span>
                  <div className="flex items-center gap-2">
                    {item.count !== null && item.count !== undefined
                      ? <span className="text-xs font-medium text-brand-texte bg-brand-100 px-2 py-0.5 rounded-full">{item.count}</span>
                      : <span className="text-xs font-medium text-brand-texte">{item.status}</span>
                    }
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Notifications */}
        <div className="bg-surface rounded-2xl border border-stone-200 p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 text-brand-texte" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">Admin Notifications</h3>
              <p className="text-xs text-stone-500">Control what alerts you receive</p>
            </div>
          </div>
          <div className="space-y-4">
            {notifications.map(n => (
              <div key={n.label} className="flex items-center justify-between">
                <span className="text-sm text-stone-700">{n.label}</span>
                <Toggle defaultChecked={n.enabled} />
              </div>
            ))}
          </div>
        </div>

        {/* Database & Security */}
        <div className="bg-surface rounded-2xl border border-stone-200 p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center">
              <Database className="w-4.5 h-4.5 text-brand-texte" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">Database & Security</h3>
              <p className="text-xs text-stone-500">AWS DynamoDB configuration</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Primary Region', value: 'us-east-1' },
              { label: 'Table Prefix', value: 'terraHR_' },
              { label: 'Backup Schedule', value: 'Daily 2:00 AM' },
              { label: 'Encryption', value: 'AES-256' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-stone-200 last:border-0">
                <span className="text-xs text-stone-500">{row.label}</span>
                <span className="text-xs font-mono font-medium text-stone-900">{row.value}</span>
              </div>
            ))}
            <button className="w-full mt-3 flex items-center justify-center gap-2 border border-brand-600 text-brand-texte text-sm font-medium py-2.5 rounded-xl hover:bg-brand-100 transition-colors">
              <Key className="w-4 h-4" />
              Rotate API Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
