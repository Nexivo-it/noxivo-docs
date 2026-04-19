'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Sparkles, Upload, Palette, DollarSign } from 'lucide-react';
import Link from 'next/link';

export default function CatalogOnboarding() {
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');

  const steps = [
    { title: 'Welcome', subtitle: 'Get started with your service catalog' },
    { title: 'Business Info', subtitle: 'Tell us about your business' },
    { title: 'First Services', subtitle: 'Add your first services' },
    { title: 'Ready!', subtitle: 'Start managing your catalog' },
  ];

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
  };

  const skipOnboarding = () => {
    window.location.href = '/dashboard/catalog';
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-base)' }}>
      <div style={{ maxWidth: 500, width: '100%', padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <div key={i} style={{ width: 40, height: 4, borderRadius: 2, background: i <= step ? 'var(--primary)' : 'var(--border)' }} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <Sparkles size={64} style={{ margin: '0 auto 1.5rem', color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Welcome to Service Catalog</h1>
            <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>Create beautiful service listings, manage bundles, and preview how customers see your menu.</p>
            <button onClick={next} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto', padding: '0.75rem 1.5rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '1rem' }}>
              Get Started <ArrowRight size={18} />
            </button>
            <button onClick={skipOnboarding} style={{ display: 'block', margin: '1rem auto 0', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem' }}>
              Skip for now
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Tell us about your business</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Business Name</label>
              <input 
                type="text" 
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="My Beauty Studio"
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Business Type</label>
              <select 
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
              >
                <option value="">Select type...</option>
                <option value="salon">Salon</option>
                <option value="spa">Spa</option>
                <option value="clinic">Clinic</option>
                <option value="nails">Nails</option>
                <option value="makeup">Makeup</option>
                <option value="barbershop">Barbershop</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={skipOnboarding} style={{ flex: 1, padding: '0.75rem', background: 'var(--surface-section)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Skip</button>
              <button onClick={next} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Add your first services</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>You can add services manually or import from a photo of your existing menu.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button onClick={next} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', cursor: 'pointer', textAlign: 'left' }}>
                <Upload size={24} style={{ color: 'var(--primary)' }} />
                <div>
                  <div style={{ fontWeight: 500 }}>Import from photo/PDF</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Upload a photo of your menu</div>
                </div>
              </button>
              <Link href="/dashboard/catalog" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', textDecoration: 'none', color: 'var(--foreground)' }}>
                <Palette size={24} style={{ color: 'var(--primary)' }} />
                <div>
                  <div style={{ fontWeight: 500 }}>Add manually</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Create services one by one</div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Check size={40} style={{ color: '#166534' }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>You're all set!</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>Your catalog is ready. Start adding services and create your first bundle.</p>
            <Link href="/dashboard/catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: '1rem' }}>
              Go to Catalog
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}