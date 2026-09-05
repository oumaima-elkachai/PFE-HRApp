// src/components/layout/Sidebar.tsx
import { NavLink, useNavigate } from 'react-router-dom';
import {
  GitBranch, Briefcase, Clock, FileText,
  Users, Shield, HelpCircle, LogOut, Plus, Leaf,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';


const NAV_CONFIG = {
  RH: [
    { label: 'Pipeline',      icon: GitBranch, path: '/pipeline' },
    { label: 'Job Offers',    icon: Briefcase, path: '/job-offers' },
    { label: 'Time Tracking', icon: Clock,     path: '/time-tracking' },
    //{ label: 'Invoicing',     icon: FileText,  path: '/invoicing' },
    { label: 'Employees',     icon: Users,     path: '/allemployees' },
    { label: 'Payroll',         icon: FileText,  path: '/payroll' },
    { label: 'Admin Dashboard', icon: Shield,    path: '/admin' },
    { label: 'Congés', icon: Calendar, path: '/admin/conges'
}
  ],
  EMPLOYE: [
    { label: 'My Dashboard',  icon: GitBranch, path: '/employe' },
    //{ label: 'My Timesheets',  icon: Clock,     path: '/employe/time-tracking' },
    { label: 'My Invoices',      icon: FileText, path: '/employe/factures' },
    { label: 'Historique Pointage',      icon: FileText, path: '/employe/historique-pointage' },

    { label: 'My Profile',    icon: Users,     path: '/employe/profile' },

  ],
  CANDIDAT: [
    { label: 'Job Offers',      icon: Briefcase, path: '/candidat/offres' },
    { label: 'Quiz',            icon: Briefcase, path: '/candidat/quizzes' }, 
    { label: 'My Applications', icon: FileText,  path: '/candidat/mes-candidatures' },
    { label: 'My Profile',      icon: Users,     path: '/candidat/profile' },
  ],
};


export default function Sidebar() {
  const navigate = useNavigate();
  const { deconnexion } = useAuth();
  const { role, isRH } = usePermissions();

  const navItems = NAV_CONFIG[role] || NAV_CONFIG.CANDIDAT;

  const handleLogout = () => {
    deconnexion();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 flex flex-col bg-[#f5f0e8] border-r border-[#e5e0d8] z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#e5e0d8]">
        <NavLink to={isRH ? '/admin' : `/${role.toLowerCase()}`} className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#2d6a4f] flex items-center justify-center">
            <Leaf className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[#2d6a4f] font-bold text-sm leading-tight">Terra HR</div>
            <div className="text-[#8b7355] text-[10px] leading-tight">
              {isRH ? 'Management Portal' : role === 'EMPLOYE' ? 'Employee Portal' : 'Career Portal'}
            </div>
          </div>
        </NavLink>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map(({ label, icon: Icon, path }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#2d6a4f] text-white shadow-sm'
                      : 'text-[#4a5568] hover:bg-[#ede8df] hover:text-[#2d6a4f]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Post New Job - RH seulement */}
      {isRH && (
        <div className="px-4 py-3">
          <button
            onClick={() => navigate('/job-offers')}
            className="w-full flex items-center justify-center gap-2 bg-[#2d6a4f] hover:bg-[#1b4332] text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Post New Job
          </button>
        </div>
      )}

     

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-[#e5e0d8] space-y-0.5">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7280] hover:bg-[#ede8df] hover:text-[#2d6a4f] transition-all">
          <HelpCircle className="w-4 h-4" />
          Help Center
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6b7280] hover:bg-[#ede8df] hover:text-red-500 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}