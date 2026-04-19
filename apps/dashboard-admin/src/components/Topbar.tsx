import React from 'react';
import { Search, Bell, Monitor, Zap, LogOut, User } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const Topbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-border-ghost bg-surface-section/50 backdrop-blur-md px-8 flex items-center justify-between z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-on-surface-muted uppercase tracking-wider">
          <span className="hover:text-primary cursor-pointer transition-colors">Infrastructure</span>
          <span className="text-border-ghost">/</span>
          <span className="text-on-surface">Mission Control</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* System Vitals */}
        <div className="hidden md:flex items-center gap-4 pr-6 border-r border-border-ghost">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-secondary fill-secondary/20" />
            <div className="text-right">
              <p className="text-[10px] text-on-surface-muted font-mono leading-none mb-1">LATENCY</p>
              <p className="text-xs font-bold leading-none">12ms</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary fill-primary/20" />
            <div className="text-right">
              <p className="text-[10px] text-on-surface-muted font-mono leading-none mb-1">UPTIME</p>
              <p className="text-xs font-bold leading-none">99.98%</p>
            </div>
          </div>
        </div>

        {/* User & Actions */}
        <div className="flex items-center gap-3">
          <button className="p-2 text-on-surface-muted hover:text-white transition-colors">
            <Search size={20} />
          </button>
          <button className="p-2 text-on-surface-muted hover:text-white transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-surface-section"></span>
          </button>
          
          <div className="h-8 w-[1px] bg-border-ghost mx-2"></div>
          
          <div className="flex items-center gap-3 pl-2">
            <div className="hidden lg:block text-right">
              <p className="text-xs font-bold leading-none text-on-surface">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-on-surface-muted font-mono uppercase mt-1">{user?.role || 'Owner'}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface-base border border-border-ghost flex items-center justify-center">
              <User size={16} className="text-on-surface-muted" />
            </div>
            <button 
              onClick={logout}
              className="p-2 text-on-surface-muted hover:text-error transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
