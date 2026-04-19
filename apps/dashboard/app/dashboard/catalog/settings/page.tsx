'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Settings, ArrowLeft, Save, Globe, Palette, DollarSign, Clock } from 'lucide-react';
import Link from 'next/link';

export default function CatalogSettings() {
  const [settings, setSettings] = useState({
    currency: 'USD',
    timezone: 'America/New_York',
    businessName: '',
    accentColor: '#4F46E5',
    defaultDuration: 30,
  });
  const [saving, setSaving] = useState(false);

  const updateSetting = (key: string, value: string | number) => {
    setSettings({ ...settings, [key]: value });
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Save to localStorage for now
      localStorage.setItem('catalog-settings', JSON.stringify(settings));
      toast.success('Settings saved!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/catalog" style={{ display: 'flex', color: 'var(--foreground)', textDecoration: 'none' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Catalog Settings</h1>
      </header>

      <div style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Globe size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Business Info</h2>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Business Name</label>
              <input 
                type="text" 
                value={settings.businessName}
                onChange={(e) => updateSetting('businessName', e.target.value)}
                placeholder="My Business"
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
              />
            </div>
          </div>

          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <DollarSign size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Currency & Pricing</h2>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Currency</label>
              <select 
                value={settings.currency}
                onChange={(e) => updateSetting('currency', e.target.value)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="VND">VND (₫)</option>
                <option value="AUD">AUD ($)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Clock size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Default Duration</h2>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Default service duration (minutes)</label>
              <input 
                type="number" 
                value={settings.defaultDuration}
                onChange={(e) => updateSetting('defaultDuration', parseInt(e.target.value) || 30)}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
              />
            </div>
          </div>

          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Palette size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Appearance</h2>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Accent Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input 
                  type="color" 
                  value={settings.accentColor}
                  onChange={(e) => updateSetting('accentColor', e.target.value)}
                  style={{ width: 48, height: 48, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                />
                <input 
                  type="text" 
                  value={settings.accentColor}
                  onChange={(e) => updateSetting('accentColor', e.target.value)}
                  style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
                />
              </div>
            </div>
          </div>

          <button onClick={saveSettings} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '1rem', fontWeight: 500 }}>
            <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}