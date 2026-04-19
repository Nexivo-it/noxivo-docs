import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown,
  Globe,
  Building2,
  Smartphone,
  Play,
  Square,
  LogOut,
  QrCode,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';

/**
 * Technical status mapping for MessagingProvider sessions
 * @see https://messaging.dev/docs/how-to/sessions/#session-status
 */
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; pulse: boolean; description: string }> = {
  'WORKING': { label: 'Live', color: 'text-primary', pulse: true, icon: Smartphone, description: 'Session is active and connected.' },
  'CONNECTED': { label: 'Live', color: 'text-primary', pulse: true, icon: Smartphone, description: 'Session is active and connected.' },
  'SCAN_QR': { label: 'Needs Pairing', color: 'text-warning', pulse: false, icon: QrCode, description: 'Waiting for QR code scan.' },
  'STARTING': { label: 'Starting', color: 'text-warning', pulse: true, icon: RefreshCw, description: 'Instance is initializing...' },
  'STOPPED': { label: 'Paused', color: 'text-on-surface-muted', pulse: false, icon: Square, description: 'Session is manually stopped.' },
  'OFFLINE': { label: 'Offline', color: 'text-on-surface-muted', pulse: false, icon: Square, description: 'Session is offline.' },
  'DISCONNECTED': { label: 'Disconnected', color: 'text-error', pulse: false, icon: LogOut, description: 'Disconnected from WhatsApp.' },
  'FAILED': { label: 'Failed', color: 'text-error', pulse: false, icon: X, description: 'Session failed to start.' },
};

const getStatusConfig = (status: string) => STATUS_CONFIG[status] || { 
  label: status, 
  color: 'text-on-surface-muted', 
  pulse: false, 
  icon: Smartphone, 
  description: 'Unknown status' 
};

interface Session {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  accountName: string;
  platform: string;
  server: string;
}

interface Client {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  sessions: Session[];
}

interface Agency {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  clients: Client[];
}

const Sessions: React.FC = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());
  const [qrModal, setQrModal] = useState<{ 
    isOpen: boolean; 
    sessionId: string | null; 
    qrData: string | null;
    isAlreadyConnected?: boolean;
    session?: Session;
  }>({
    isOpen: false,
    sessionId: null,
    qrData: null
  });
  const [screenshotModal, setScreenshotModal] = useState<{ isOpen: boolean; sessionId: string | null; imageUrl: string | null }>({
    isOpen: false,
    sessionId: null,
    imageUrl: null
  });
  const [isBootstrapOpen, setIsBootstrapOpen] = useState(false);
  const [bootstrapData, setBootstrapData] = useState({ agencyId: '', tenantId: '', accountName: '' });
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await api.get('/sessions');
      setAgencies(res.data);
      // Expand all by default for now
      if (expandedAgencies.size === 0) {
        setExpandedAgencies(new Set(res.data.map((a: Agency) => a.agencyId)));
      }
    } catch (error) {
      console.error('Failed to fetch sessions', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    
    // Poll for status updates every 10s while on this page
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleAgency = (id: string) => {
    const next = new Set(expandedAgencies);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedAgencies(next);
  };

  const handleAction = async (id: string, action: 'start' | 'stop' | 'logout') => {
    const promise = api.post(`/sessions/${id}/${action}`);
    toast.promise(promise, {
      loading: `${action.charAt(0).toUpperCase() + action.slice(1)}ing session...`,
      success: `Session ${action}ed successfully`,
      error: `Failed to ${action} session`,
    });

    try {
      await promise;
      fetchSessions();
    } catch (error) {
      console.error(`Failed to ${action} session`, error);
    }
  };

  const showScreenshot = async (id: string, name: string) => {
    setScreenshotModal({ isOpen: true, sessionId: id, imageUrl: null });
    try {
      // Use the generic MessagingProvider request proxy to get a screenshot
      const res = await api.post('/messaging/request', {
        method: 'GET',
        path: `/api/screenshot?session=${name}`
      });
      
      // MessagingProvider returns binary for screenshot, but the proxy might be returning base64 if it's JSON
      // Let's check how the proxy handles it.
      if (res.data?.body) {
        setScreenshotModal(prev => ({ ...prev, imageUrl: res.data.body }));
      } else {
        setScreenshotModal(prev => ({ ...prev, imageUrl: res.data }));
      }
    } catch (error) {
      console.error('Failed to fetch screenshot', error);
      toast.error('Failed to capture session screenshot');
    }
  };

  const showQR = async (s: Session) => {
    setQrModal({ isOpen: true, sessionId: s.id, qrData: null, session: s, isAlreadyConnected: false });
    
    const pollQR = async () => {
      if (!qrModal.isOpen && !s.id) return;
      try {
        const res = await api.get(`/sessions/${s.id}/qr`);
        
        // Handle "already connected" case from backend
        if (res.data.message === 'Session already connected' || (!res.data.code && res.data.message)) {
          setQrModal(prev => ({ ...prev, qrData: '', isAlreadyConnected: true }));
          return;
        }

        const newQrData = res.data.code || res.data;
        setQrModal(prev => ({ ...prev, qrData: newQrData, isAlreadyConnected: false }));
        
        // If we got a QR, keep polling every 10s until modal closes
        if (newQrData) {
          setTimeout(() => {
            if (window.location.pathname.includes('/sessions')) pollQR();
          }, 10000);
        }
      } catch (error: any) {
        console.error('Failed to fetch QR', error);
        if (error.response?.status === 422 || error.response?.data?.message?.includes('already connected')) {
          setQrModal(prev => ({ ...prev, qrData: '', isAlreadyConnected: true }));
        }
      }
    };

    pollQR();
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBootstrapping(true);
    try {
      await api.post('/sessions/bootstrap', bootstrapData);
      toast.success('Session bootstrapped successfully');
      setIsBootstrapOpen(false);
      setBootstrapData({ agencyId: '', tenantId: '', accountName: '' });
      fetchSessions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to bootstrap session');
    } finally {
      setIsBootstrapping(false);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Session Hierarchy</h1>
          <p className="text-on-surface-muted mt-1">Global view of all WhatsApp sessions across agencies.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-muted" />
            <input 
              type="text" 
              placeholder="Search agencies or sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface-section border border-border-ghost rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary w-64 transition-all"
            />
          </div>
          <button 
            onClick={() => fetchSessions()}
            className="p-2 bg-surface-section border border-border-ghost rounded-xl hover:text-primary transition-colors"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setIsBootstrapOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Hierarchy List */}
      <div className="space-y-6">
        {agencies.map(agency => (
          <div key={agency.agencyId} className="bg-surface-section/30 border border-border-ghost rounded-3xl overflow-hidden glass">
            {/* Agency Header */}
            <div 
              onClick={() => toggleAgency(agency.agencyId)}
              className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-base border border-border-ghost flex items-center justify-center text-primary">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{agency.agencyName}</h3>
                  <p className="text-xs text-on-surface-muted font-mono uppercase tracking-wider">{agency.agencySlug}.noxivo.ai</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right hidden md:block">
                  <p className="text-[10px] text-on-surface-muted font-mono uppercase">Clients</p>
                  <p className="text-sm font-bold">{agency.clients.length}</p>
                </div>
                {expandedAgencies.has(agency.agencyId) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </div>

            {/* Agency Content (Clients) */}
            {expandedAgencies.has(agency.agencyId) && (
              <div className="border-t border-border-ghost bg-surface-base/50 p-6 space-y-6">
                {agency.clients.map(client => (
                  <div key={client.tenantId} className="space-y-3">
                    <div className="flex items-center gap-2 text-on-surface-muted mb-4 ml-1">
                      <Building2 size={14} />
                      <span className="text-xs font-bold uppercase tracking-widest">{client.tenantName}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {client.sessions.map(session => (
                        <SessionCard 
                          key={session.id} 
                          session={session} 
                          onAction={handleAction} 
                          onShowQR={() => showQR(session)}
                          onShowScreenshot={showScreenshot}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* QR Modal */}
      {qrModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm" onClick={() => setQrModal({ ...qrModal, isOpen: false })}></div>
          <div className="relative bg-surface-card border border-border-ghost rounded-3xl p-8 max-w-sm w-full shadow-2xl glass animate-in zoom-in duration-200">
            <button 
              onClick={() => setQrModal({ ...qrModal, isOpen: false })}
              className="absolute top-4 right-4 p-2 text-on-surface-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="text-center">
              <div className="bg-surface-base p-6 rounded-3xl aspect-square flex items-center justify-center border border-border-ghost shadow-[inset_0_0_40px_rgba(0,0,0,0.2)] overflow-hidden relative group">
                {qrModal.isAlreadyConnected ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4 w-full animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse"></div>
                      <div className="w-20 h-20 bg-primary/10 border-2 border-primary/20 rounded-full flex items-center justify-center relative text-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]">
                        <Smartphone size={40} />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full border-4 border-surface-card flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
                      </div>
                    </div>
                    
                    <h4 className="text-xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent mb-1">Authenticated</h4>
                    <p className="text-xs text-primary font-bold uppercase tracking-[0.2em] mb-8">Linked</p>
                    
                    <div className="w-full space-y-3 pt-6 border-t border-border-ghost/50">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-on-surface-muted font-bold uppercase tracking-widest pl-1">Platform</span>
                        <div className="w-full bg-surface-section/50 border border-border-ghost rounded-xl px-3 py-2 text-left">
                          <span className="text-xs font-mono font-bold text-on-surface">{qrModal.session?.platform || 'WEBJS (2026.3.4 PLUS)'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] text-on-surface-muted font-bold uppercase tracking-widest pl-1">Engine</span>
                        <div className="w-full bg-surface-section/50 border border-border-ghost rounded-xl px-3 py-2 text-left">
                          <span className="text-xs font-mono font-bold text-on-surface">MessagingProvider</span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-0 right-0 text-[8px] text-on-surface-muted font-mono uppercase tracking-widest opacity-40">
                      Secure Node: {qrModal.session?.server?.split('.')[0] || 'Cluster-A'}
                    </div>
                  </div>
                ) : qrModal.qrData ? (
                  <div className="bg-white p-4 rounded-2xl w-full h-full flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500">
                    <img src={`data:image/png;base64,${qrModal.qrData}`} alt="WhatsApp QR Code" className="w-full h-full" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-on-surface-muted">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150 animate-pulse"></div>
                      <RefreshCw className="w-10 h-10 animate-spin text-primary relative" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Generating QR...</p>
                  </div>
                )}
              </div>

              <p className="mt-8 text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Session ID: {qrModal.sessionId?.slice(-8)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Modal */}
      {screenshotModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm" onClick={() => setScreenshotModal({ ...screenshotModal, isOpen: false })}></div>
          <div className="relative bg-surface-card border border-border-ghost rounded-3xl p-8 max-w-lg w-full shadow-2xl glass animate-in zoom-in duration-200">
            <button 
              onClick={() => setScreenshotModal({ ...screenshotModal, isOpen: false })}
              className="absolute top-4 right-4 p-2 text-on-surface-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
                <Smartphone size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Remote Screenshot</h3>
              <p className="text-sm text-on-surface-muted mb-8">View the current state of the WhatsApp instance.</p>
              
              <div className="bg-surface-base rounded-2xl overflow-hidden border border-border-ghost flex items-center justify-center min-h-[300px]">
                {screenshotModal.imageUrl ? (
                  <img 
                    src={screenshotModal.imageUrl.startsWith('data:') ? screenshotModal.imageUrl : `data:image/png;base64,${screenshotModal.imageUrl}`} 
                    alt="WhatsApp Screenshot" 
                    className="max-w-full h-auto" 
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-on-surface-muted">
                    <RefreshCw className="w-8 h-8 animate-spin" />
                    <p className="text-xs font-bold uppercase">Capturing...</p>
                  </div>
                )}
              </div>
              <p className="mt-8 text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Live from Cluster</p>
            </div>
          </div>
        </div>
      )}

      {/* Bootstrap Modal */}
      {isBootstrapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-sm" onClick={() => setIsBootstrapOpen(false)}></div>
          <div className="relative bg-surface-card border border-border-ghost rounded-3xl p-8 max-w-md w-full shadow-2xl glass animate-in zoom-in duration-200">
            <button 
              onClick={() => setIsBootstrapOpen(false)}
              className="absolute top-4 right-4 p-2 text-on-surface-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="mb-6">
              <h3 className="text-xl font-bold">Bootstrap New Session</h3>
              <p className="text-sm text-on-surface-muted mt-1">Initialize a new WhatsApp instance for an agency/tenant.</p>
            </div>

            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-muted ml-1">Agency ID</label>
                <input 
                  required
                  type="text" 
                  value={bootstrapData.agencyId}
                  onChange={(e) => setBootstrapData({...bootstrapData, agencyId: e.target.value})}
                  placeholder="e.g. agency_123"
                  className="w-full bg-surface-base border border-border-ghost rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-muted ml-1">Tenant ID</label>
                <input 
                  required
                  type="text" 
                  value={bootstrapData.tenantId}
                  onChange={(e) => setBootstrapData({...bootstrapData, tenantId: e.target.value})}
                  placeholder="e.g. tenant_456"
                  className="w-full bg-surface-base border border-border-ghost rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-muted ml-1">Account Name (Optional)</label>
                <input 
                  type="text" 
                  value={bootstrapData.accountName}
                  onChange={(e) => setBootstrapData({...bootstrapData, accountName: e.target.value})}
                  placeholder="e.g. Primary Sales"
                  className="w-full bg-surface-base border border-border-ghost rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <button 
                type="submit"
                disabled={isBootstrapping}
                className="w-full mt-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                {isBootstrapping ? <RefreshCw className="animate-spin" size={18} /> : <span>Start Connection</span>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

interface SessionCardProps {
  session: Session;
  onAction: (id: string, action: 'start' | 'stop' | 'logout') => void;
  onShowQR: () => void;
  onShowScreenshot: (id: string, name: string) => void;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, onAction, onShowQR, onShowScreenshot }) => {
  const config = getStatusConfig(session.status);
  const isWorking = session.status === 'WORKING' || session.status === 'CONNECTED';
  const isOffline = session.status === 'OFFLINE' || session.status === 'DISCONNECTED' || session.status === 'STOPPED';
  const needsPairing = session.status === 'SCAN_QR' || (isOffline && !session.phone);

  return (
    <div className={`bg-surface-section border rounded-2xl p-5 transition-all group relative overflow-hidden ${
      isWorking ? 'border-primary/40 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' : 'border-border-ghost hover:border-on-surface-muted/30'
    }`}>
      {/* Background Flow */}
      <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-20 rounded-full -mr-12 -mt-12 transition-colors ${
        isWorking ? 'bg-primary' : needsPairing ? 'bg-warning' : 'bg-on-surface-muted/50'
      }`}></div>
      
      {/* Glow Pulse for Live Sessions */}
      {isWorking && (
        <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary animate-ping"></div>
      )}

      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-surface-base border border-border-ghost shadow-inner transition-all ${
            isWorking ? 'text-primary border-primary/20 bg-primary/5' : 'text-on-surface-muted'
          }`}>
            <config.icon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm leading-none">{session.name}</h4>
              {isWorking && <span className="bg-primary/20 text-primary text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">Live</span>}
            </div>
            <p className="text-[10px] text-on-surface-muted font-mono uppercase mt-2">{session.phone || 'No Phone Linked'}</p>
          </div>
        </div>
        
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${
          isWorking ? 'bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/10' : 
          needsPairing ? 'bg-warning/10 text-warning border border-warning/20' :
          'bg-on-surface-subtle/10 text-on-surface-muted border border-border-ghost'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.pulse ? 'animate-pulse' : ''} ${
            isWorking ? 'bg-primary' : needsPairing ? 'bg-warning' : 'bg-on-surface-muted'
          }`}></span>
          {config.label}
        </div>
      </div>

      <div className="mt-6 space-y-4 relative">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-on-surface-muted font-mono uppercase tracking-widest">Platform</span>
          <span className="font-bold bg-surface-base px-2 py-0.5 rounded border border-border-ghost">{session.platform}</span>
        </div>
        
        {needsPairing && (
          <div className="bg-warning/5 border border-warning/10 rounded-xl p-3 flex flex-col gap-2">
            <p className="text-[10px] text-warning/80 font-medium leading-tight italic">Device is not linked. Scan the QR code to start sending messages.</p>
            <button 
              onClick={() => onShowQR()}
              className="flex items-center justify-center gap-2 bg-warning/20 text-warning border border-warning/30 px-3 py-2 rounded-lg text-xs font-bold hover:bg-warning/30 transition-all active:scale-95"
            >
              <QrCode size={14} />
              Pair Device Now
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-border-ghost flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {isOffline || session.status === 'STOPPED' || session.status === 'FAILED' ? (
              <button 
                onClick={() => onAction(session.id, 'start')}
                className="p-2 text-on-surface-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                title="Start Session"
              >
                <Play size={16} />
              </button>
            ) : (
              <button 
                onClick={() => onAction(session.id, 'stop')}
                className="p-2 text-on-surface-muted hover:text-warning hover:bg-warning/10 rounded-lg transition-all"
                title="Stop Session"
              >
                <Square size={16} />
              </button>
            )}
            {session.phone && (
              <button 
                onClick={() => onAction(session.id, 'logout')}
                className="p-2 text-on-surface-muted hover:text-error hover:bg-error/10 rounded-lg transition-all"
                title="Logout / Disconnect"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
          
          {isWorking && (
            <button 
              onClick={() => onShowScreenshot(session.id, session.name)}
              className="flex items-center gap-2 bg-surface-base text-on-surface-muted border border-border-ghost px-3 py-1.5 rounded-lg text-xs font-bold hover:text-white hover:border-on-surface-muted transition-all"
            >
              <Smartphone size={14} />
              Screen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sessions;
