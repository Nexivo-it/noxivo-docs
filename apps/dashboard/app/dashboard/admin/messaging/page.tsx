'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Play, Square, RotateCcw, Trash2, QrCode, Phone, User, Settings, Eye, EyeOff } from 'lucide-react';

interface MessagingSession {
  name: string;
  status: string;
  config: Record<string, unknown>;
  me: { id: string; pushName: string } | null;
  engine: { engine: string };
}

interface MessagingQR {
  value?: string;
}

export default function MessagingDashboardPage() {
  const [sessions, setSessions] = useState<MessagingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string>('');
  const [error, setError] = useState<string>('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messaging-proxy/default/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const doAction = async (sessionName: string, action: string, method: string = 'POST') => {
    setAction(`${sessionName}:${action}`);
    setError('');
    try {
      const res = await fetch(`/api/messaging-proxy/${sessionName}/${action}`, { method });
      if (!res.ok) {
        const err = await res.text();
        setError(`Failed: ${err}`);
      } else {
        await fetchSessions();
      }
    } catch (e: any) {
      setError(e.message);
    }
    setAction(null);
  };

  const getQR = async (sessionName: string) => {
    setShowQR(sessionName);
    try {
      const res = await fetch(`/api/messaging-proxy/${sessionName}/auth/qr?format=raw`);
      if (res.ok) {
        const data = await res.json() as MessagingQR;
        setQrData(data.value || '');
      }
    } catch (e) {
      console.error('Failed to get QR:', e);
    }
  };

  const getMe = async (sessionName: string) => {
    try {
      const res = await fetch(`/api/messaging-proxy/${sessionName}/me`);
      if (res.ok) {
        const data = await res.json();
        alert(`Logged in as: ${JSON.stringify(data, null, 2)}`);
      }
    } catch (e) {
      console.error('Failed to get me:', e);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'WORKING': return 'bg-green-500/20 text-green-500 border-green-500';
      case 'STARTING': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500';
      case 'SCAN_QR_CODE': return 'bg-blue-500/20 text-blue-500 border-blue-500';
      case 'FAILED': return 'bg-red-500/20 text-red-500 border-red-500';
      case 'STOPPED': return 'bg-gray-500/20 text-gray-500 border-gray-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">MessagingProvider Dashboard</h1>
        <button onClick={fetchSessions} disabled={loading} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-500">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sessions.map((session) => (
          <div key={session.name} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono font-medium truncate">{session.name}</span>
              <span className={`px-2 py-0.5 rounded text-xs border ${statusColor(session.status)}`}>
                {session.status}
              </span>
            </div>

            <div className="text-sm text-muted-foreground mb-3">
              {session.me ? (
                <div>👤 {session.me.pushName || session.me.id}</div>
              ) : (
                <div className="text-muted-foreground italic">Not authenticated</div>
              )}
              <div className="text-xs mt-1">Engine: {session.engine?.engine || 'WEBJS'}</div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {session.status !== 'WORKING' && session.status !== 'STARTING' && (
                <button onClick={() => doAction(session.name, 'start')} disabled={!!action} className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded text-green-500" title="Start">
                  <Play className="w-4 h-4" />
                </button>
              )}
              {session.status === 'WORKING' && (
                <button onClick={() => doAction(session.name, 'stop')} disabled={!!action} className="p-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-500" title="Stop">
                  <Square className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => doAction(session.name, 'restart')} disabled={!!action} className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-500" title="Restart">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => doAction(session.name, 'logout', 'POST')} disabled={!!action} className="p-2 bg-orange-500/20 hover:bg-orange-500/30 rounded text-orange-500" title="Logout">
                <EyeOff className="w-4 h-4" />
              </button>
              <button onClick={() => getQR(session.name)} className="p-2 bg-purple-500/20 hover:bg-purple-500/30 rounded text-purple-500" title="Get QR">
                <QrCode className="w-4 h-4" />
              </button>
              <button onClick={() => getMe(session.name)} className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded text-cyan-500" title="Get Me">
                <User className="w-4 h-4" />
              </button>
              <button onClick={() => { if (confirm('Delete session?')) doAction(session.name, '', 'DELETE') }} disabled={!!action} className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded text-red-500" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {action?.startsWith(session.name) && (
              <div className="mt-2 text-xs text-muted-foreground">Processing...</div>
            )}
          </div>
        ))}

        {sessions.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No sessions found. Create one to get started.
          </div>
        )}
      </div>

      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQR(null)}>
          <div className="bg-card p-6 rounded-lg max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-4">QR Code: {showQR}</h3>
            {qrData ? (
              <div className="bg-white p-4 rounded">
                <textarea readOnly value={qrData} className="w-full h-32 text-xs font-mono bg-transparent" />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">Loading QR...</div>
            )}
            <button onClick={() => setShowQR(null)} className="mt-4 w-full py-2 bg-muted rounded">Close</button>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Quick Links</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/api/messaging-proxy/default/sessions" target="_blank" className="px-3 py-1 bg-card rounded text-sm hover:bg-accent">All Sessions (JSON)</a>
          <a href="/api/settings/qr" target="_blank" className="px-3 py-1 bg-card rounded text-sm hover:bg-accent">Get QR (Current)</a>
        </div>
      </div>
    </div>
  );
}
