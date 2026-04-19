import React, { useEffect, useState, useRef } from 'react';
import {
  Terminal,
  Trash2, 
  Pause, 
  Play, 
  Wifi, 
  WifiOff,
  Cpu,
  History,
  RefreshCw
} from 'lucide-react';
import { API_BASE_URL } from '../lib/api';

interface SystemEvent {
  type: string;
  message?: string;
  timestamp: string;
  payload?: any;
}

const Events: React.FC = () => {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (isPaused) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        setStatus('closed');
      }
      return;
    }

    const connect = () => {
      setStatus('connecting');
      // EventSource with credentials requires a library or manual fetch-then-connect 
      // because native EventSource doesn't support headers except with some tricks.
      // However, for this admin dashboard, the session is in a cookie, which IS sent.
      const es = new EventSource(`${API_BASE_URL}/api/v1/admin/events/stream`, {
        withCredentials: true
      });

      es.onopen = () => setStatus('open');
      es.onerror = () => {
        setStatus('closed');
        es.close();
        // Retry after 5s
        setTimeout(connect, 5000);
      };

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const newEvent: SystemEvent = {
          type: data.type || 'info',
          message: data.message || (typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload)),
          timestamp: data.timestamp || new Date().toISOString(),
          payload: data.payload
        };

        setEvents(prev => [...prev.slice(-99), newEvent]);
      };

      eventSourceRef.current = es;
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [isPaused]);

  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isPaused]);

  const clearLogs = () => setEvents([]);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mission Control Stream</h1>
          <p className="text-on-surface-muted mt-1">Real-time system heartbeats and workflow execution logs.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            status === 'open' ? 'bg-primary/10 border-primary/20 text-primary' : 
            status === 'connecting' ? 'bg-warning/10 border-warning/20 text-warning' : 
            'bg-error/10 border-error/20 text-error'
          }`}>
            {status === 'open' ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="text-xs font-mono uppercase tracking-widest font-bold">
              {status}
            </span>
          </div>
          
          <div className="h-8 w-[1px] bg-border-ghost mx-2"></div>

          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-2 bg-surface-section border border-border-ghost px-4 py-2 rounded-xl text-sm font-bold hover:text-primary transition-all"
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          
          <button 
            onClick={clearLogs}
            className="p-2 bg-surface-section border border-border-ghost rounded-xl hover:text-error transition-colors"
            title="Clear Logs"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-1 bg-[#05070a] border border-border-ghost rounded-3xl overflow-hidden shadow-2xl flex flex-col glass relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0"></div>
        
        {/* Terminal Header */}
        <div className="px-6 py-3 border-b border-border-ghost flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-on-surface-muted" />
            <span className="text-[10px] font-mono text-on-surface-muted uppercase tracking-[0.2em]">Live Process Logs</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={12} className="text-primary" />
              <span className="text-[10px] font-mono text-primary">Node: active-01</span>
            </div>
            <div className="flex items-center gap-2">
              <History size={12} className="text-on-surface-muted" />
              <span className="text-[10px] font-mono text-on-surface-muted">Buffer: {events.length}/100</span>
            </div>
          </div>
        </div>

        {/* Log Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-1 selection:bg-primary/30 scroll-smooth"
        >
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-subtle opacity-50">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p className="uppercase tracking-widest">Waiting for stream data...</p>
            </div>
          ) : (
            events.map((event, i) => (
              <div key={i} className="flex gap-4 py-0.5 group hover:bg-white/5 px-2 -mx-2 rounded transition-colors">
                <span className="text-on-surface-subtle shrink-0">
                  [{new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                </span>
                <span className={`font-bold shrink-0 w-20 ${
                  event.type === 'error' ? 'text-error' : 
                  event.type === 'warning' ? 'text-warning' : 
                  event.type === 'heartbeat' ? 'text-on-surface-subtle' :
                  'text-primary'
                }`}>
                  {event.type.toUpperCase()}
                </span>
                <span className="text-on-surface break-all opacity-90 group-hover:opacity-100">
                  {event.message}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Bottom Bar */}
        <div className="px-6 py-2 border-t border-border-ghost bg-white/5 flex items-center justify-between">
          <p className="text-[10px] text-on-surface-subtle">SSE Stream: {API_BASE_URL}/api/v1/admin/events/stream</p>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${status === 'open' ? 'bg-primary shadow-[0_0_8px_rgba(37,211,102,0.8)]' : 'bg-on-surface-subtle'}`}></div>
            <span className="text-[10px] text-on-surface-subtle uppercase">Secure Connection</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Events;
