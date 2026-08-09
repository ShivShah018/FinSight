import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Tags, 
  Wallet, 
  Target, 
  BarChart3, 
  Settings, 
  LogOut, 
  TrendingUp 
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();

  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/transactions', label: 'Transactions', icon: ArrowRightLeft },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/budgets', label: 'Budgets', icon: Wallet },
    { to: '/goals', label: 'Savings Goals', icon: Target },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen sticky top-0">
      <div className="flex flex-col flex-1 py-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 px-6 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            FinSight
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 px-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/10'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <link.icon className="w-5 h-5" />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Session Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-800/40 border border-slate-800/50 mb-2">
          <div className="flex items-center gap-3 truncate">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-semibold text-sm uppercase">
              {user?.name.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          aria-label="Logout"
          className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
