import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RadioTower } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';

type MonitorEvent = {
  id: string;
  receivedAt: string;
  raw: unknown;
};

const MessagingProvider_WEBHOOK_EVENTS = [
  'session.status',
  'message',
  'message.reaction',
  'message.any',
  'message.ack',
  'message.ack.group',
  'message.revoked',
  'message.edited',
  'group.v2.join',
  'group.v2.leave',
  'group.v2.update',
  'group.v2.participants',
  'presence.update',
  'poll.vote',
  'poll.vote.failed',
  'chat.archive',
  'call.received',
  'call.accepted',
  'call.rejected',
  'label.upsert',
  'label.deleted',
  'label.chat.added',
  'label.chat.deleted',
  'event.response',
  'event.response.failed',
  'engine.event',
  'group.join',
  'group.leave',
  'state.change',
] as const;

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

const Webhooks: React.FC = () => {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedEventName, setSelectedEventName] = useState<string>(MessagingProvider_WEBHOOK_EVENTS[0]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  useEffect(() => {
    const stream = new EventSource(`${API_BASE_URL}/api/v1/admin/events/stream`, {
      withCredentials: true
    });

    stream.onopen = () => {
      setIsConnected(true);
    };

    stream.onmessage = (event) => {
      let payload: unknown = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch {
        // keep text payload
      }

      const entry: MonitorEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        receivedAt: new Date().toISOString(),
        raw: payload,
      };

      setEvents((current) => [entry, ...current].slice(0, 100));
    };

    stream.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      stream.close();
      setIsConnected(false);
    };
  }, []);

  const selectedLog = useMemo(
    () => events.find((event) => event.id === selectedLogId) ?? null,
    [events, selectedLogId]
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook Tools</h1>
          <p className="text-on-surface-muted mt-1">
            Monitor realtime admin event stream and keep a quick reference for supported MessagingProvider webhook event names.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
            isConnected
              ? 'bg-primary/10 border-primary/20 text-primary'
              : 'bg-warning/10 border-warning/20 text-warning'
          }`}>
            <RadioTower size={14} />
            <span className="text-xs font-mono uppercase">{isConnected ? 'SSE Connected' : 'SSE Reconnecting'}</span>
          </div>
          <button
            onClick={() => setEvents([])}
            className="p-2 bg-surface-section border border-border-ghost rounded-xl hover:text-primary transition-colors"
            title="Clear event log"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_1fr] gap-6">
        <section className="bg-surface-section border border-border-ghost rounded-2xl p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-on-surface-muted px-2">MessagingProvider Event Names</h2>
          {MessagingProvider_WEBHOOK_EVENTS.map((eventName) => (
            <button
              key={eventName}
              onClick={() => setSelectedEventName(eventName)}
              className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                selectedEventName === eventName
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border-ghost text-on-surface-muted hover:text-on-surface hover:bg-surface-base'
              }`}
            >
              <span className="text-sm font-mono">{eventName}</span>
            </button>
          ))}
        </section>

        <section className="bg-surface-section border border-border-ghost rounded-2xl p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-on-surface-muted px-2">Live Event Stream</h2>
          {events.length === 0 ? (
            <p className="text-sm text-on-surface-muted px-2 py-4">No events received yet.</p>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedLogId(event.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
                  selectedLogId === event.id
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-border-ghost hover:bg-surface-base'
                }`}
              >
                <p className="text-[10px] text-on-surface-muted font-mono uppercase">
                  {new Date(event.receivedAt).toLocaleTimeString()}
                </p>
                <p className="text-xs font-mono mt-1 truncate">
                  {typeof event.raw === 'object' && event.raw && 'type' in (event.raw as Record<string, unknown>)
                    ? String((event.raw as Record<string, unknown>).type)
                    : 'event'}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="bg-surface-section border border-border-ghost rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold">Selected Event</h2>
          <div className="bg-surface-base border border-border-ghost rounded-lg p-3">
            <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Event Name</p>
            <p className="text-sm font-mono mt-1">{selectedEventName}</p>
          </div>

          <div className="pt-2 border-t border-border-ghost space-y-2">
            <p className="text-[10px] text-on-surface-muted font-mono uppercase tracking-[0.2em]">Latest Payload</p>
            <pre className="bg-surface-base border border-border-ghost rounded-lg p-3 text-xs font-mono overflow-auto max-h-[420px]">
              {selectedLog ? stringifyPretty(selectedLog.raw) : 'Select a stream event to inspect payload'}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Webhooks;
