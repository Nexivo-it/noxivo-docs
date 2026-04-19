import React, { useEffect, useState } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Activity, 
  Network, 
  TrendingUp, 
  Database,
  Server,
  RefreshCw,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { api } from '../lib/api';
import axios from 'axios';
import { API_BASE_URL } from '../lib/api';

interface HealthStatus {
  service: string;
  timestamp: string;
  checks: {
    mongodb: string;
    redis: string;
  };
}

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

const data = [
  { name: '00:00', requests: 400, sessions: 240 },
  { name: '04:00', requests: 300, sessions: 139 },
  { name: '08:00', requests: 200, sessions: 980 },
  { name: '12:00', requests: 278, sessions: 390 },
  { name: '16:00', requests: 189, sessions: 480 },
  { name: '20:00', requests: 239, sessions: 380 },
  { name: '23:59', requests: 349, sessions: 430 },
];

const Overview: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchData = async () => {
    try {
      // /health is at root, not /api/v1/admin
      const healthRes = await axios.get(`${API_BASE_URL}/health`);
      setHealth(healthRes.data);

      const statsRes = await api.get('/workers/status');
      setWorkerStats(statsRes.data);
      
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Failed to fetch overview data', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalJobs = workerStats?.queues.reduce((acc, q) => acc + q.active + q.waiting + q.failed + q.completed + q.delayed, 0) || 0;
  const activeJobs = workerStats?.queues.reduce((acc, q) => acc + q.active, 0) || 0;
  const failedJobs = workerStats?.queues.reduce((acc, q) => acc + q.failed, 0) || 0;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">System Infrastructure</h1>
            {isLoading && <RefreshCw className="w-5 h-5 animate-spin text-primary" />}
          </div>
          <p className="text-on-surface-muted mt-1">Real-time performance metrics and cluster status.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 bg-surface-section px-4 py-2 rounded-xl border border-border-ghost">
            <Database size={16} className={health?.checks.mongodb === 'healthy' ? 'text-primary' : 'text-error'} />
            <span className="text-xs font-mono uppercase tracking-wider">
              DB: {health?.checks.mongodb || 'Checking...'}
            </span>
          </div>
          <p className="text-[10px] text-on-surface-muted font-mono uppercase">Last Update: {lastRefreshed.toLocaleTimeString()}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Engine Status" 
          value={health ? 'ONLINE' : 'OFFLINE'} 
          trend="Healthy" 
          icon={<Server className={health ? 'text-primary' : 'text-error'} />} 
          status={health ? 'success' : 'error'}
        />
        <StatCard 
          title="Active Jobs" 
          value={activeJobs.toString()} 
          trend="Processing" 
          icon={<Activity className="text-secondary" />} 
          status="info"
        />
        <StatCard 
          title="Total Tasks" 
          value={totalJobs.toLocaleString()} 
          trend="+5.4k" 
          icon={<TrendingUp className="text-indigo-400" />} 
          status="info"
        />
        <StatCard 
          title="Redis Cache" 
          value={health?.checks.redis === 'healthy' ? 'CONNECTED' : 'DISCONNECTED'} 
          trend="Stable" 
          icon={<Network className={health?.checks.redis === 'healthy' ? 'text-primary' : 'text-error'} />} 
          status={health?.checks.redis === 'healthy' ? 'success' : 'error'}
        />
      </div>

      {/* Status Detailed Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-section border border-border-ghost rounded-3xl p-8 shadow-xl relative overflow-hidden glass">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold">Infrastructure Performance</h3>
              <p className="text-sm text-on-surface-muted">Average request latency across all clusters</p>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}ms`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f1523', 
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: 'none',
                    backdropFilter: 'blur(10px)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="#25D366" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorReq)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface-section border border-border-ghost rounded-3xl p-8 shadow-xl glass space-y-6">
          <h3 className="text-lg font-bold">Node Health</h3>
          
          <div className="space-y-4">
            <HealthItem 
              label="Core Engine" 
              status={health ? 'healthy' : 'failed'} 
              description="Fastify server & plugin registry"
            />
            <HealthItem 
              label="MongoDB" 
              status={health?.checks.mongodb === 'healthy' ? 'healthy' : 'failed'} 
              description="Primary persistent datastore"
            />
            <HealthItem 
              label="Redis Cluster" 
              status={health?.checks.redis === 'healthy' ? 'healthy' : 'failed'} 
              description="Message broker & rate limits"
            />
            <HealthItem 
              label="BullMQ Workers" 
              status={workerStats ? 'healthy' : 'checking'} 
              description="Background job processing"
            />
          </div>

          {failedJobs > 0 && (
            <div className="mt-8 bg-error-subtle border border-error/20 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-error shrink-0" />
              <div>
                <p className="text-sm font-bold text-error">Queue Alert</p>
                <p className="text-xs text-error/80 mt-1">{failedJobs} jobs have failed in the last window. Check Workers for details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const HealthItem: React.FC<{ label: string; status: 'healthy' | 'failed' | 'checking'; description: string }> = ({ label, status, description }) => {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-base transition-colors border border-transparent hover:border-border-ghost">
      {status === 'healthy' ? (
        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
      ) : status === 'failed' ? (
        <AlertCircle className="w-5 h-5 text-error mt-0.5" />
      ) : (
        <RefreshCw className="w-5 h-5 text-on-surface-subtle animate-spin mt-0.5" />
      )}
      <div>
        <p className="text-sm font-bold leading-none">{label}</p>
        <p className="text-[10px] text-on-surface-muted mt-1">{description}</p>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  icon: React.ReactNode;
  status?: 'success' | 'error' | 'info' | 'warning';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, trend, icon, status = 'info' }) => {
  return (
    <div className="bg-surface-section border border-border-ghost p-6 rounded-2xl relative group hover:border-primary/30 transition-colors glass">
      <div className="flex items-start justify-between">
        <div className="p-3 bg-surface-base rounded-xl border border-border-ghost group-hover:border-primary/20 transition-colors">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          status === 'success' ? 'text-primary bg-primary/10' :
          status === 'error' ? 'text-error bg-error/10' :
          status === 'warning' ? 'text-warning bg-warning/10' :
          'text-secondary bg-secondary/10'
        }`}>
          {trend}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-mono text-on-surface-muted uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
      </div>
    </div>
  );
};

export default Overview;
