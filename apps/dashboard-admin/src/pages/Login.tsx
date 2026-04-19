import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { LogIn, ShieldCheck, AlertCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to authenticate');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-surface-base to-surface-base">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20 shadow-[0_0_20px_rgba(37,211,102,0.15)]">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">Noxivo</h1>
          <p className="text-on-surface-muted font-mono text-sm tracking-wider uppercase">Engine Administration</p>
        </div>

        <form 
          onSubmit={handleSubmit}
          className="bg-surface-section border border-border-ghost p-8 rounded-3xl shadow-2xl relative overflow-hidden group glass"
        >
          {/* Accent glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0" />
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-mono text-on-surface-muted uppercase mb-2 ml-1">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-base border border-border-ghost rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-on-surface-subtle"
                placeholder="admin@noxivo.ai"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-on-surface-muted uppercase mb-2 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-surface-base border border-border-ghost rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-hover disabled:bg-on-surface-subtle text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(37,211,102,0.3)] hover:shadow-[0_0_25px_rgba(37,211,102,0.5)] flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate Session</span>
                </>
              )}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-xs text-on-surface-muted font-mono uppercase tracking-[0.2em]">
          Restricted Access Level 4.0
        </p>
      </div>
    </div>
  );
};

export default Login;
