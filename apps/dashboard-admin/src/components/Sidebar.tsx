import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Cpu, 
  Activity, 
  ShieldCheck,
  Code2,
  Webhook,
  BookOpen,
  Users,
  Map
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  return (
    <aside className="w-64 bg-surface-section border-r border-border-ghost flex flex-col h-full z-20">
      {/* Brand Header */}
      <div className="p-8 pb-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl shadow-[0_0_15px_rgba(37,211,102,0.3)]">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-lg leading-tight tracking-tight">Noxivo</h2>
          <span className="text-[10px] font-mono text-primary uppercase tracking-[0.2em]">Engine v4.0</span>
        </div>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 px-4 py-8 space-y-8 overflow-y-auto">
        <div className="space-y-1">
          <p className="px-4 mb-2 text-[10px] font-mono text-on-surface-muted uppercase tracking-[0.2em]">Infrastructure</p>
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavItem to="/sessions" icon={<MessageSquare size={18} />} label="MessagingProvider Sessions" />
          <NavItem to="/workers" icon={<Cpu size={18} />} label="Queue Clusters" />
        </div>

        <div className="space-y-1">
          <p className="px-4 mb-2 text-[10px] font-mono text-on-surface-muted uppercase tracking-[0.2em]">Diagnostics</p>
          <NavItem to="/events" icon={<Activity size={18} />} label="Event Monitor" />
          <NavItem to="/explorer" icon={<Code2 size={18} />} label="MessagingProvider Explorer" />
          <NavItem to="/webhooks" icon={<Webhook size={18} />} label="Webhook Tools" />
        </div>

        <div className="space-y-1">
          <p className="px-4 mb-2 text-[10px] font-mono text-on-surface-muted uppercase tracking-[0.2em]">Resources</p>
          <NavItem to="/docs" icon={<BookOpen size={18} />} label="Engine API Docs" />
          <NavItem to="/guides" icon={<Map size={18} />} label="Architecture Guides" />
        </div>

        {isOwner && (
          <div className="space-y-1">
            <p className="px-4 mb-2 text-[10px] font-mono text-on-surface-muted uppercase tracking-[0.2em]">System Admin</p>
            <NavItem to="/admin/users" icon={<Users size={18} />} label="User Registry" />
          </div>
        )}
      </nav>

      {/* Footer Profile */}
      <div className="p-4 mt-auto border-t border-border-ghost bg-white/[0.02]">
        <div className="flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold border border-white/10 tracking-tighter">
            {user?.name.split(' ').map(n => n[0]).join('').toUpperCase() || '??'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{user?.name || 'Unknown User'}</p>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isOwner ? 'bg-primary animate-pulse' : 'bg-blue-400'}`}></span>
              <p className="text-[10px] text-on-surface-muted uppercase font-mono truncate">
                {user?.role === 'owner' ? 'System Owner' : 'Internal Dev'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

const NavItem: React.FC<{ to: string, icon: React.ReactNode, label: string }> = ({ to, icon, label }) => {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
        ${isActive 
          ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(37,211,102,0.05)]' 
          : 'text-on-surface-muted hover:text-white hover:bg-white/[0.02] border border-transparent'}
      `}
    >
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </NavLink>
  );
};

export default Sidebar;
