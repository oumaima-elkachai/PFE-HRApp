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
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Admin Panel</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage system settings, users, and configurations</p>
        </div>
        <div className="flex items-center gap-2 bg-[#d8f3dc] text-[#2d6a4f] px-3 py-2 rounded-xl text-sm font-medium">
          <Shield className="w-4 h-4" />
          Super Admin
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        {adminSections.map(section => (
          <div key={section.title} className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-lg bg-[#d8f3dc] flex items-center justify-center">
                <section.icon className="w-4.5 h-4.5 text-[#2d6a4f]" />
              </div>
              <div>
                <h3 className="font-semibold text-[#1a1a1a] text-sm">{section.title}</h3>
                <p className="text-xs text-[#6b7280]">{section.description}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {section.items.map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-xl bg-[#fafaf8] border border-[#f0ebe0] cursor-pointer hover:border-[#2d6a4f]/30 transition-colors">
                  <span className="text-sm text-[#374151]">{item.label}</span>
                  <div className="flex items-center gap-2">
                    {item.count !== null && item.count !== undefined
                      ? <span className="text-xs font-medium text-[#2d6a4f] bg-[#d8f3dc] px-2 py-0.5 rounded-full">{item.count}</span>
                      : <span className="text-xs font-medium text-[#2d6a4f]">{item.status}</span>
                    }
                    <ChevronRight className="w-3.5 h-3.5 text-[#9ca3af]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Notifications */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-lg bg-[#d8f3dc] flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 text-[#2d6a4f]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#1a1a1a] text-sm">Admin Notifications</h3>
              <p className="text-xs text-[#6b7280]">Control what alerts you receive</p>
            </div>
          </div>
          <div className="space-y-4">
            {notifications.map(n => (
              <div key={n.label} className="flex items-center justify-between">
                <span className="text-sm text-[#374151]">{n.label}</span>
                <Toggle defaultChecked={n.enabled} />
              </div>
            ))}
          </div>
        </div>

        {/* Database & Security */}
        <div className="bg-white rounded-2xl border border-[#e5e0d8] p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-lg bg-[#d8f3dc] flex items-center justify-center">
              <Database className="w-4.5 h-4.5 text-[#2d6a4f]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#1a1a1a] text-sm">Database & Security</h3>
              <p className="text-xs text-[#6b7280]">AWS DynamoDB configuration</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Primary Region', value: 'us-east-1' },
              { label: 'Table Prefix', value: 'terraHR_' },
              { label: 'Backup Schedule', value: 'Daily 2:00 AM' },
              { label: 'Encryption', value: 'AES-256' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-[#f0ebe0] last:border-0">
                <span className="text-xs text-[#6b7280]">{row.label}</span>
                <span className="text-xs font-mono font-medium text-[#1a1a1a]">{row.value}</span>
              </div>
            ))}
            <button className="w-full mt-3 flex items-center justify-center gap-2 border border-[#2d6a4f] text-[#2d6a4f] text-sm font-medium py-2.5 rounded-xl hover:bg-[#d8f3dc] transition-colors">
              <Key className="w-4 h-4" />
              Rotate API Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
