'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { buildAuthPath } from '../lib/auth/paths';
import { loginWithWorkflowEngine } from '../lib/api/dashboard-auth-client';
import Image from 'next/image';
import { NoxivoLogo } from './noxivo-logo';

interface LoginFormProps {
  brandName?: string;
  brandPrimaryColor?: string | null;
  supportEmail?: string | null;
  authBasePath?: string;
}

export function LoginForm({
  brandName = 'Noxivo',
  brandPrimaryColor = null,
  supportEmail = null,
  authBasePath = '/auth'
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const formPanelStyle = {
    backgroundColor: 'color-mix(in srgb, var(--surface-section) 40%, transparent)'
  };

  const inputSurfaceStyle = {
    backgroundColor: 'color-mix(in srgb, var(--surface-base) 50%, transparent)'
  };

  const errorBannerStyle = {
    backgroundColor: 'var(--color-error-subtle)',
    borderColor: 'color-mix(in srgb, var(--color-error) 20%, transparent)'
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await loginWithWorkflowEngine({ email, password });

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error && error.message.length > 0 ? error.message : 'Unable to sign in');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-bg-primary overflow-hidden">
      {/* Visual Side - Hidden on small screens */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 z-0 opacity-60">
          <Image
            src="/images/login-visual.png"
            alt="Noxivo Connectivity"
            fill
            className="object-cover"
            priority
          />
        </div>
        
        {/* Overlay Gradient */}
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        
        <div className="relative z-20 flex flex-col justify-between p-16 w-full">
          <div>
            <div className="mb-8 flex items-center gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_0_20px_rgba(99,102,241,0.18)] backdrop-blur-md">
                <NoxivoLogo alt={brandName ? `${brandName} logo` : 'Noxivo logo'} height={36} priority variant="light" width={132} />
              </div>
            </div>
            
            <h2 className="text-5xl font-extrabold text-white leading-tight mb-6 max-w-xl">
              Connect your enterprise with <span className="text-brand-400">intelligent</span> WhatsApp workflows.
            </h2>
            <p className="text-xl text-slate-300 max-w-lg leading-relaxed">
              The next generation of WhatsApp automation for modern agencies and enterprises.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 max-w-lg">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-brand-400 font-semibold">
                <ShieldCheck className="h-5 w-5" />
                <span>Secure</span>
              </div>
              <p className="text-sm text-slate-400">Enterprise-grade encryption and session management.</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-brand-400 font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                <span>Scale</span>
              </div>
              <p className="text-sm text-slate-400">Built to handle thousands of concurrent conversations.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-24 lg:px-16 mesh-gradient relative">
        {/* Decorative elements */}
        <div
          className="absolute top-20 right-20 h-64 w-64 rounded-full blur-[100px]"
          style={{ backgroundColor: 'var(--color-primary-subtle)' }}
        />
        <div
          className="absolute bottom-20 left-20 h-64 w-64 rounded-full blur-[100px]"
          style={{ backgroundColor: 'var(--color-secondary-subtle)' }}
        />

        <div className="w-full max-w-md mx-auto relative z-10">
          <div className="lg:hidden mb-12 flex items-center">
            <div className="rounded-2xl border border-border-ghost bg-surface-card px-4 py-3 shadow-ambient backdrop-blur-md">
              <NoxivoLogo alt={brandName ? `${brandName} logo` : 'Noxivo logo'} height={32} priority variant="auto" width={118} />
            </div>
          </div>

          <div className="mb-10">
            <h3 className="text-3xl font-bold text-text-primary tracking-tight mb-3">Welcome back</h3>
            <p className="text-text-muted text-lg">Sign in to manage your WhatsApp workspace.</p>
          </div>

          <div className="glass-card rounded-2xl p-1 shadow-2xl overflow-hidden">
            <div className="rounded-[calc(1rem-1px)] p-10" style={formPanelStyle}>
              {error ? (
                <div
                  className="mb-6 rounded-xl border p-4 text-sm text-status-error animate-in fade-in slide-in-from-top-2 duration-300"
                  style={errorBannerStyle}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-text-muted ml-1 capitalize">
                    Email address
                  </label>
                  <div className="group relative transition-all duration-300">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-400 text-text-muted">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="block w-full rounded-xl border border-border-input py-4 pl-12 pr-4 text-text-primary placeholder:text-on-surface-subtle transition-all duration-300 hover:border-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                      placeholder="you@agency.com"
                      required
                      style={inputSurfaceStyle}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label htmlFor="password" className="block text-sm font-medium text-text-muted capitalize">
                      Password
                    </label>
                    <a href="#" className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium">Forgot?</a>
                  </div>
                  <div className="group relative transition-all duration-300">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-400 text-text-muted">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="block w-full rounded-xl border border-border-input py-4 pl-12 pr-4 text-text-primary placeholder:text-on-surface-subtle transition-all duration-300 hover:border-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                      placeholder="••••••••"
                      required
                      style={inputSurfaceStyle}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={brandPrimaryColor ? { backgroundColor: brandPrimaryColor } : undefined}
                  className="w-full relative group flex items-center justify-center gap-3 py-4 px-6 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </>
                  ) : (
                    <>
                      <span>Sign in to workspace</span>
                      <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 text-center">
                <p className="text-sm text-text-muted">
                  Don&apos;t have an account?{' '}
                  <a 
                    href={buildAuthPath(authBasePath, 'signup')} 
                    className="text-brand-400 hover:text-brand-300 font-bold transition-colors underline-offset-4 hover:underline"
                  >
                    Start Free Trial
                  </a>
                </p>
              </div>
            </div>
          </div>

          {supportEmail ? (
            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-text-muted opacity-60">
              <CheckCircle2 className="h-3 w-3 text-status-success" />
              <span>Verified Enterprise Node</span>
              <span className="mx-1">•</span>
              <span>Support: {supportEmail}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
