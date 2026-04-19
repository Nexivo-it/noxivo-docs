import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Search
} from 'lucide-react';
import { api } from '../lib/api';

interface WorkerStats {
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;
}

const Workers: React.FC = () => {
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchStats = async () => {
    try {
      const res = await api.get('/workers/status');
      setStats(res.data);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Failed to fetch worker stats', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const queue = stats?.queues[0];
  
  const chartData = queue ? [
    { name: 'Active', value: queue.active, color: '#25D366' },
    { name: 'Waiting', value: queue.waiting, color: '#94a3b8' },
    { name: 'Delayed', value: queue.delayed, color: '#f59e0b' },
    { name: 'Completed', value: queue.completed, color: '#10b981' },
    { name: 'Failed', value: queue.failed, color: '#ef4444' },
  ] : [];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Worker Clusters</h1>
            {isLoading && <RefreshCw className="w-5 h-5 animate-spin text-primary" />}
          </div>
          <p className="text-on-surface-muted mt-1">Monitor background job processing and queue health.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-on-surface-muted font-mono uppercase">Last Sync: {lastRefreshed.toLocaleTimeString()}</p>
          <div className="mt-2 flex items-center gap-2 bg-surface-section px-3 py-1.5 rounded-lg border border-border-ghost">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            <span className="text-xs font-mono uppercase tracking-widest text-on-surface">Live Data</span>
          </div>
        </div>
      </div>

      {/* Queue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <QueueStatCard 
          label="Active" 
          value={queue?.active || 0} 
          icon={<Activity size={16} />} 
          color="text-primary" 
        />
        <QueueStatCard 
          label="Waiting" 
          value={queue?.waiting || 0} 
          icon={<Search size={16} />} 
          color="text-on-surface-muted" 
        />
        <QueueStatCard 
          label="Delayed" 
          value={queue?.delayed || 0} 
          icon={<Clock size={16} />} 
          color="text-warning" 
        />
        <QueueStatCard 
          label="Completed" 
          value={queue?.completed || 0} 
          icon={<CheckCircle2 size={16} />} 
          color="text-success" 
        />
        <QueueStatCard 
          label="Failed" 
          value={queue?.failed || 0} 
          icon={<XCircle size={16} />} 
          color="text-error" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart View */}
        <div className="lg:col-span-2 bg-surface-section border border-border-ghost rounded-3xl p-8 shadow-xl glass">
          <h3 className="text-lg font-bold mb-8">Queue Distribution</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#94a3b8" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ 
                    backgroundColor: '#0f1523', 
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    border: 'none'
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Status */}
        <div className="space-y-6">
          <div className="bg-surface-section border border-border-ghost rounded-3xl p-6 shadow-xl glass">
            <h3 className="text-sm font-mono uppercase tracking-widest text-on-surface-muted mb-6">Execution Log</h3>
            <div className="space-y-4">
              <LogItem 
                type="success" 
                message="Workflow DAG compilation successful" 
                time="2m ago" 
              />
              <LogItem 
                type="info" 
                message="BullMQ worker-01 heartbeat detected" 
                time="5s ago" 
              />
              <LogItem 
                type="warning" 
                message="Redis latency spike: 45ms" 
                time="15s ago" 
              />
              <LogItem 
                type="success" 
                message="Session binding synchronized" 
                time="1m ago" 
              />
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-3xl p-6 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all"></div>
            <h4 className="text-primary font-bold mb-1">Queue Intelligence</h4>
            <p className="text-xs text-on-surface-muted leading-relaxed">
              Auto-scaling is currently managed by the standalone engine. Cluster resources are optimized for high-concurrency DAG execution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const QueueStatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => {
  return (
    <div className="bg-surface-section border border-border-ghost p-4 rounded-xl flex items-center gap-4 hover:border-white/10 transition-colors glass">
      <div className={`p-2 rounded-lg bg-surface-base border border-border-ghost ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-mono text-on-surface-muted uppercase">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  );
};

const LogItem: React.FC<{ type: 'success' | 'warning' | 'error' | 'info'; message: string; time: string }> = ({ type, message, time }) => {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="mt-1">
        {type === 'success' && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(37,211,102,0.5)]"></div>}
        {type === 'warning' && <div className="w-1.5 h-1.5 rounded-full bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>}
        {type === 'error' && <div className="w-1.5 h-1.5 rounded-full bg-error shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>}
        {type === 'info' && <div className="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(147,51,234,0.5)]"></div>}
      </div>
      <div className="flex-1">
        <p className="text-on-surface leading-snug">{message}</p>
        <p className="text-[10px] text-on-surface-muted mt-0.5">{time}</p>
      </div>
    </div>
  );
};

export default Workers;
