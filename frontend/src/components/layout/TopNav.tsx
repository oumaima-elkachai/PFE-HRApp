import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Settings, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const topNavItems = [
  { label: 'Dashboard',   path: '/admin' },
  { label: 'Calendar',    path: '/calendar' },
  { label: 'Recruitment', path: '/job-offers' },
  { label: 'Reports',     path: '/reports' },
];

export default function TopNav({ searchPlaceholder = 'Search...' }: { searchPlaceholder?: string }) {
  const [searchValue, setSearchValue] = useState('');
  const { user, deconnexion }         = useAuth();
  const navigate                      = useNavigate();

  const initials = user
    ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase()
    : 'RH';

  const handleLogout = () => {
    deconnexion();
    navigate('/login');
  };

  return (
    <header className="fixed top-0 left-52 right-0 h-14 bg-white border-b border-[#e5e0d8] flex items-center px-6 gap-4 z-30">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          className="pl-9 pr-4 py-2 bg-[#f5f0e8] border border-[#e5e0d8] rounded-full text-sm text-[#374151] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 w-52"
        />
      </div>

      {/* Nav Links */}
      <nav className="flex items-center gap-1 flex-1">
        {topNavItems.map(({ label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-[#2d6a4f] border-b-2 border-[#2d6a4f]'
                  : 'text-[#6b7280] hover:text-[#374151]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg hover:bg-[#f5f0e8] transition-colors">
          <Bell className="w-5 h-5 text-[#6b7280]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <button className="p-2 rounded-lg hover:bg-[#f5f0e8] transition-colors">
          <Settings className="w-5 h-5 text-[#6b7280]" />
        </button>

        {/* User info — clique pour déconnecter */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full hover:bg-[#f5f0e8] transition-colors"
          title="Cliquer pour déconnecter"
        >
          <div className="w-8 h-8 rounded-full bg-[#2d6a4f] flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-[#1a1a1a] leading-tight">
              {user ? `${user.prenom} ${user.nom}` : 'Utilisateur'}
            </div>
            <div className="text-[10px] text-[#8b7355] leading-tight">
                {user?.role === 'RH' ? 'Ressources humaines'
                : user?.role === 'EMPLOYE' ? (user?.departement || 'Employé')
                : 'Candidat'}
            </div>
          </div>
        </button>
      </div>
    </header>
  );
}