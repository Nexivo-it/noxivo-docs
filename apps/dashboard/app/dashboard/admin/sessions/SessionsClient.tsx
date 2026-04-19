'use client';

import React, { useState, useMemo } from 'react';
import { 
  Play, 
  Square, 
  LogOut, 
  QrCode, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown, 
  Plus,
  Server,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  X
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { runSession, stopSession, logoutSession, getSessionQr, bootstrapSession } from './actions';
import { toast } from 'sonner';

interface MessagingCluster {
  _id: string;
  name: string;
  baseUrl: string;
  region: string;
  status: string;
  activeSessionCount: number;
}

interface MessagingSession {
  _id: string;
  sessionName: string;
  messagingSessionName: string;
  status: 'pending' | 'active' | 'failed' | 'stopped' | 'WORKING' | 'CONNECTED' | 'STARTING' | 'INITIALIZING' | 'SCAN_QR_CODE';
  tenantId: string;
  agencyId: string;
  clusterId: string;
  accountName?: string;
  createdAt: string;
}

interface SessionsClientProps {
  initialSessions: MessagingSession[];
  clusters: MessagingCluster[];
}

export function SessionsClient({ initialSessions, clusters }: SessionsClientProps) {
  const [sessions, setSessions] = useState<MessagingSession[]>(initialSessions);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    clusters.forEach(c => initial[c._id] = true);
    return initial;
  });
  const [qrModal, setQrModal] = useState<{ id: string; qr: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bootstrapModal, setBootstrapModal] = useState<{ agencyId: string; tenantId: string; accountName: string } | null>(null);

  // Grouping logic
  const groupedSessions = useMemo(() => {
    const groups: Record<string, MessagingSession[]> = {};
    
    // Filter by search
    const filtered = sessions.filter(s => 
      s.sessionName.toLowerCase().includes(search.toLowerCase()) ||
      s.messagingSessionName.toLowerCase().includes(search.toLowerCase()) ||
      s.tenantId.toLowerCase().includes(search.toLowerCase())
    );

    filtered.forEach(s => {
      if (!s.clusterId) return; // Ignore unassigned sessions
      const gId = s.clusterId;
      if (!groups[gId]) groups[gId] = [];
      groups[gId].push(s);
    });

    return groups;
  }, [sessions, search]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    clusters.forEach(c => all[c._id] = true);
    setExpandedGroups(all);
  };

  const collapseAll = () => {
    setExpandedGroups({});
  };

  const handleAction = async (action: (id: string) => Promise<{ success: boolean; error?: string }>, id: string, name: string) => {
    const res = await action(id);
    if (res.success) {
      toast.success(`${name} success`);
    } else {
      toast.error(`${name} failed: ${res.error}`);
    }
  };

  const handleShowQr = async (id: string) => {
    const res = await getSessionQr(id);
    if (res.success) {
      setQrModal({ id, qr: res.qr || '' });
      if (!res.qr) {
        toast.info('Session is already connected');
      }
    } else {
      toast.error(`Failed to fetch QR: ${res.error}`);
    }
  };

  const handleBootstrap = async () => {
    if (!bootstrapModal) return;
    const res = await bootstrapSession(bootstrapModal.agencyId, bootstrapModal.tenantId, bootstrapModal.accountName);
    if (res.success) {
      toast.success('Bootstrap initiated');
      setBootstrapModal(null);
    } else {
      toast.error(`Bootstrap failed: ${res.error}`);
    }
  };

  return (
    <div className="space-y-6 animate-float-in">
      {/* Search and Global Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between glass-panel p-4 rounded-xl shadow-ambient">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-subtle group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search sessions, tenants, or names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-low border border-border-ghost rounded-md py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <button 
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-semibold bg-surface-card hover:bg-surface-low border border-border-ghost rounded-md transition-all whitespace-nowrap"
          >
            Open All
          </button>
          <button 
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-semibold bg-surface-card hover:bg-surface-low border border-border-ghost rounded-md transition-all whitespace-nowrap"
          >
            Close All
          </button>
          <div className="w-px h-6 bg-border-ghost mx-2 hidden md:block" />
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-surface-card hover:bg-surface-low border border-border-ghost rounded-md transition-all whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={() => setBootstrapModal({ agencyId: '', tenantId: '', accountName: '' })}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>
      </div>

      {/* Cluster Groups */}
      <div className="space-y-6 pb-20">
        {[...clusters].map(cluster => {
          const clusterSessions = groupedSessions[cluster._id] || [];
          if (clusterSessions.length === 0) return null;

          const isExpanded = expandedGroups[cluster._id];

          return (
            <div key={cluster._id} className="space-y-3">
              <button 
                onClick={() => toggleGroup(cluster._id)}
                className="flex items-center gap-3 w-full group"
              >
                <div className={`p-1 rounded-md transition-colors ${isExpanded ? 'bg-primary/20 text-primary' : 'bg-surface-card text-on-surface-subtle group-hover:text-on-surface'}`}>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-on-surface-subtle" />
                  <h2 className="text-xl font-bold tracking-tight">{cluster.name}</h2>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-low border border-border-ghost text-on-surface-subtle">
                    {cluster.baseUrl}
                  </span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-border-ghost to-transparent ml-4" />
                <div className="text-sm font-medium text-on-surface-muted">
                  {clusterSessions.length} {clusterSessions.length === 1 ? 'Session' : 'Sessions'}
                </div>
              </button>

              {isExpanded && (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4 pl-8">
                  {clusterSessions.map(session => (
                    <div 
                      key={session._id} 
                      className="glass-panel hover-float p-5 rounded-xl border border-border-ghost group relative overflow-hidden"
                    >
                      {/* Status Glow */}
                      <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 blur-3xl opacity-20 pointer-events-none transition-all ${
                        session.status === 'active' ? 'bg-primary' : 
                        session.status === 'pending' ? 'bg-yellow-500' : 
                        session.status === 'failed' ? 'bg-error' : 'bg-on-surface-subtle'
                      }`} />

                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-lg ${
                              session.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-surface-low text-on-surface-subtle'
                            }`}>
                              <Smartphone className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                                {session.sessionName}
                              </h3>
                              <p className="text-xs font-mono text-on-surface-subtle truncate max-w-[200px]">
                                {session.messagingSessionName}
                              </p>
                            </div>
                          </div>
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            session.status === 'active' || session.status === 'WORKING' || session.status === 'CONNECTED' ? 'bg-primary/20 text-primary shadow-emerald-glow' : 
                            session.status === 'pending' || session.status === 'STARTING' || session.status === 'INITIALIZING' ? 'bg-yellow-500/20 text-yellow-500 shadow-yellow-glow' : 
                            session.status === 'failed' ? 'bg-error/20 text-error shadow-rose-glow' : 
                            'bg-surface-low text-on-surface-subtle'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              session.status === 'active' || session.status === 'WORKING' || session.status === 'CONNECTED' ? 'bg-primary animate-pulse' : 
                              session.status === 'pending' || session.status === 'STARTING' || session.status === 'INITIALIZING' ? 'bg-yellow-500 animate-pulse' : 
                              session.status === 'failed' ? 'bg-error' : 'bg-on-surface-subtle'
                            }`} />
                            {session.status}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <span className="text-on-surface-subtle block uppercase text-[9px] tracking-widest font-bold">Tenant Instance</span>
                            <span className="font-mono bg-surface-low px-1.5 py-0.5 rounded border border-border-ghost truncate block">
                              {session.tenantId}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-on-surface-subtle block uppercase text-[9px] tracking-widest font-bold">Registration</span>
                            <span className="block italic text-on-surface-muted">
                              {new Date(session.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border-ghost">
                          {session.status === 'stopped' || session.status === 'failed' ? (
                            <button 
                              onClick={() => handleAction(runSession, session.messagingSessionName, 'Start')}
                              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              Run
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleAction(stopSession, session.messagingSessionName, 'Stop')}
                              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold bg-error/10 hover:bg-error/20 text-error rounded-lg transition-all"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              Stop
                            </button>
                          )}
                          <button 
                            onClick={() => handleShowQr(session.messagingSessionName)}
                            className="flex items-center justify-center p-2 text-on-surface-muted hover:text-primary bg-surface-low hover:bg-surface-card border border-border-ghost rounded-lg transition-all"
                            title="Show Pairing QR"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          {session.status === 'active' && (
                            <button 
                              onClick={() => handleAction(logoutSession, session.messagingSessionName, 'Logout')}
                              className="flex items-center justify-center p-2 text-on-surface-muted hover:text-error bg-surface-low hover:bg-surface-card border border-border-ghost rounded-lg transition-all"
                              title="Logout Device"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-surface-base/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-md p-8 rounded-3xl animate-float-in relative">
            <button 
              onClick={() => setQrModal(null)}
              className="absolute top-4 right-4 p-2 text-on-surface-subtle hover:text-on-surface transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                <QrCode className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight">Pairing Authority</h3>
                <p className="text-on-surface-muted text-sm mt-1">Scan this code with WhatsApp to connect {qrModal.id}</p>
              </div>

              <div className="p-6 bg-white rounded-3xl shadow-float border-4 border-primary/20">
                {qrModal.qr ? (
                  <QRCodeCanvas 
                    value={qrModal.qr} 
                    size={240}
                    level="H"
                    includeMargin
                    imageSettings={{
                      src: 'https://wa.me/favicon.ico',
                      height: 40,
                      width: 40,
                      excavate: true,
                    }}
                  />
                ) : (
                  <div className="w-[240px] h-[240px] flex flex-col items-center justify-center text-on-surface-muted gap-4">
                    <ShieldCheck className="w-16 h-16 text-primary/40" />
                    <div className="space-y-1">
                      <p className="font-bold text-on-surface text-base">Already Authenticated</p>
                      <p className="text-xs">No QR code needed for this session.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 p-4 bg-surface-low rounded-2xl border border-border-ghost text-xs text-on-surface-muted">
                <ShieldCheck className="w-4 h-4 text-primary" />
                This code expires in 60 seconds. Keep the screen active.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bootstrap Modal */}
      {bootstrapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-base/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-lg p-8 rounded-3xl animate-float-in relative">
            <button 
              onClick={() => setBootstrapModal(null)}
              className="absolute top-4 right-4 p-2 text-on-surface-subtle hover:text-on-surface transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <h3 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-3">
              <Plus className="w-6 h-6 text-primary" />
              Initialize New Session
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Agency ID</label>
                <input 
                  type="text" 
                  value={bootstrapModal.agencyId}
                  onChange={e => setBootstrapModal({...bootstrapModal, agencyId: e.target.value})}
                  className="w-full bg-surface-low border border-border-ghost rounded-xl p-3 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. 64de..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Tenant ID</label>
                <input 
                  type="text" 
                  value={bootstrapModal.tenantId}
                  onChange={e => setBootstrapModal({...bootstrapModal, tenantId: e.target.value})}
                  className="w-full bg-surface-low border border-border-ghost rounded-xl p-3 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. 64de..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">Account Name (Optional)</label>
                <input 
                  type="text" 
                  value={bootstrapModal.accountName}
                  onChange={e => setBootstrapModal({...bootstrapModal, accountName: e.target.value})}
                  className="w-full bg-surface-low border border-border-ghost rounded-xl p-3 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. Sales Team"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setBootstrapModal(null)}
                  className="flex-1 px-4 py-3 bg-surface-low hover:bg-surface-card border border-border-ghost rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBootstrap}
                  className="flex-1 px-4 py-3 btn-primary font-bold transition-all"
                  disabled={!bootstrapModal.agencyId || !bootstrapModal.tenantId}
                >
                  Create Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
