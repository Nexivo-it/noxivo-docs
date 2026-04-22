import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { Users, Check, X, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface PendingUser {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  role: string;
}

const PendingUsers: React.FC = () => {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const response = await api.get('/users/pending');
      setUsers(response.data.users);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch pending users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.patch(`/users/${id}/approve`);
      toast.success('User approved successfully');
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Approval failed');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-on-surface-muted animate-pulse">Scanning registry...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">Developer Access Registry</h1>
        </div>
        <p className="text-on-surface-muted text-sm">Review and approve internal developer accounts.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-500">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        {users.length === 0 ? (
          <div className="bg-surface-section border border-border-ghost rounded-2xl p-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-base border border-border-ghost mb-2">
              <Check className="w-6 h-6 text-on-surface-muted" />
            </div>
            <h3 className="text-lg font-medium text-on-surface">Registry Clean</h3>
            <p className="text-on-surface-muted max-w-xs mx-auto text-sm leading-relaxed">
              No pending developer access requests found in the system.
            </p>
          </div>
        ) : (
          users.map((user) => (
            <div 
              key={user.id} 
              className="bg-surface-section border border-border-ghost p-6 rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all duration-300 glass shadow-sm hover:shadow-primary/5"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-base flex items-center justify-center font-bold text-lg text-primary border border-border-ghost group-hover:bg-primary/5 transition-colors">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-on-surface text-lg">{user.fullName}</h3>
                  <div className="flex items-center gap-3 text-sm text-on-surface-muted">
                    <span className="flex items-center gap-1.5 font-mono text-xs bg-surface-base px-2 py-0.5 rounded border border-border-ghost">
                      {user.email}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApprove(user.id)}
                  className="flex items-center gap-2 bg-primary/10 hover:bg-primary text-primary hover:text-white px-4 py-2 rounded-xl transition-all duration-200 text-sm font-semibold border border-primary/20 hover:shadow-[0_0_15px_rgba(37,211,102,0.3)]"
                >
                  <Check className="w-4 h-4" />
                  Approve Access
                </button>
                <button
                  className="p-2 text-on-surface-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                  title="Reject"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PendingUsers;
