'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock, User, Building2, ArrowRight, Check } from 'lucide-react';
import { buildAuthPath } from '../lib/auth/paths';

interface SignupFormProps {
  brandName?: string;
  brandPrimaryColor?: string | null;
  supportEmail?: string | null;
  authBasePath?: string;
  invitationToken?: string | null;
}

export function SignupForm({
  brandName = 'Noxivo',
  brandPrimaryColor = null,
  supportEmail = null,
  authBasePath = '/auth',
  invitationToken = null
}: SignupFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    agencyName: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function passwordStrength() {
    if (!formData.password) {
      return 0;
    }

    let strength = 0;

    if (formData.password.length >= 8) strength += 1;
    if (/[A-Z]/.test(formData.password)) strength += 1;
    if (/[0-9]/.test(formData.password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(formData.password)) strength += 1;

    return strength;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          agencyName: invitationToken ? undefined : formData.agencyName,
          invitationToken: invitationToken ?? undefined
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(typeof payload.error === 'string' ? payload.error : 'Unable to create account');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to create account');
    } finally {
      setIsLoading(false);
    }
  }

  const strengthColors = ['bg-status-error', 'bg-orange-500', 'bg-yellow-500', 'bg-brand-400', 'bg-status-success'];
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-text-primary mb-2 tracking-tight">{brandName}</h1>
          <p className="text-text-muted">{invitationToken ? 'Join your agency team' : 'Create your agency account'}</p>
          {invitationToken ? <p className="text-sm text-brand-400 mt-2">You are signing up from an invitation link.</p> : null}
          {supportEmail ? <p className="text-xs text-text-muted mt-2">Support: {supportEmail}</p> : null}
        </div>

        <div className="bg-bg-surface border border-border-default rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-text-primary mb-6">Get started</h2>

          {error ? (
            <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-sm">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-text-muted mb-2">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-text-muted" />
                </div>
                <input id="fullName" type="text" value={formData.fullName} onChange={(event) => handleChange('fullName', event.target.value)} className="block w-full pl-10 pr-3 py-3 bg-bg-primary border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" placeholder="John Doe" required />
              </div>
            </div>

            {invitationToken ? null : (
              <div>
                <label htmlFor="agencyName" className="block text-sm font-medium text-text-muted mb-2">Agency Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-text-muted" />
                  </div>
                  <input id="agencyName" type="text" value={formData.agencyName} onChange={(event) => handleChange('agencyName', event.target.value)} className="block w-full pl-10 pr-3 py-3 bg-bg-primary border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" placeholder="Acme Inc." required />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-muted mb-2">Work Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-text-muted" />
                </div>
                <input id="email" type="email" value={formData.email} onChange={(event) => handleChange('email', event.target.value)} className="block w-full pl-10 pr-3 py-3 bg-bg-primary border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" placeholder="you@agency.com" required />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-muted mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-muted" />
                </div>
                <input id="password" type="password" value={formData.password} onChange={(event) => handleChange('password', event.target.value)} className="block w-full pl-10 pr-3 py-3 bg-bg-primary border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" placeholder="••••••••" required />
              </div>
              {formData.password ? (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index} className={`h-1 flex-1 rounded-full ${index < passwordStrength() ? strengthColors[passwordStrength()] : 'bg-border-default'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">{strengthLabels[passwordStrength()] || 'Enter a password'}</p>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-muted mb-2">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-muted" />
                </div>
                <input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={(event) => handleChange('confirmPassword', event.target.value)} className="block w-full pl-10 pr-3 py-3 bg-bg-primary border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" placeholder="••••••••" required />
                {formData.confirmPassword && formData.password === formData.confirmPassword ? (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <Check className="h-5 w-5 text-status-success" />
                  </div>
                ) : null}
              </div>
            </div>

            <button type="submit" disabled={isLoading} style={brandPrimaryColor ? { backgroundColor: brandPrimaryColor } : undefined} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-text-muted">
              Already have an account?{' '}
              <a href={buildAuthPath(authBasePath, 'login')} className="text-brand-400 hover:text-brand-300 font-medium transition-colors">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
