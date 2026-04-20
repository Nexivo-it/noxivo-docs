'use client';

import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  Save, 
  Image as ImageIcon, 
  Settings2, 
  Globe, 
  Palette, 
  Clock, 
  DollarSign,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ImageKitWrapper, IKUpload } from '@/components/media/imagekit-provider';

interface CatalogSettings {
  currency: string;
  timezone: string;
  businessName: string;
  accentColor: string;
  logoUrl: string;
  defaultDuration: number;
}

interface StorageInfo {
  provider: string;
  isActive: boolean;
  publicBaseUrl: string;
  publicConfig: Record<string, any>;
  secretConfig: Record<string, string>;
  pathPrefix: string;
}

export default function CatalogSettingsPage() {
  const router = useRouter();
  
  const [settings, setSettings] = useState<CatalogSettings>({
    currency: 'USD',
    timezone: 'UTC',
    businessName: '',
    accentColor: '#4F46E5',
    logoUrl: '',
    defaultDuration: 30,
  });

  const [storage, setStorage] = useState<StorageInfo>({
    provider: 'local',
    isActive: true,
    publicBaseUrl: '',
    publicConfig: {},
    secretConfig: {},
    pathPrefix: '',
  });

  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isEditingStorage, setIsEditingStorage] = useState(false);

  useEffect(() => {
    fetchSettings();
    
    // Safety exit: if still loading after 15s, force stop
    const safetyTimer = setTimeout(() => {
      if (loading) {
        console.warn('[DEBUG] Safety timeout reached. Forcing loading to false.');
        setLoading(false);
        setHasError(true);
        toast.error('The request is taking too long. Please try refreshing.');
      }
    }, 15000);

    return () => clearTimeout(safetyTimer);
  }, []);

  const fetchSettings = async () => {
    console.log('[DEBUG] fetchSettings started');
    setLoading(true);
    setHasError(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[DEBUG] Fetch timeout reached, aborting');
      controller.abort();
    }, 10000);

    try {
      const response = await fetch('/api/catalog/settings', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }
      const data = await response.json();
      
      if (data.settings) setSettings(data.settings);
      if (data.storage) setStorage(data.storage);
      if (data.storeUrl) setStoreUrl(data.storeUrl);
    } catch (error) {
      console.error('[DEBUG] Fetch error:', error);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const message = isAbort ? 'Connection timed out. The server might be hanging.' : (error instanceof Error ? error.message : 'Failed to load settings');
      
      toast.error(message);
      setHasError(true);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...settings,
        storage: isEditingStorage ? storage : undefined
      };

      const response = await fetch('/api/catalog/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save settings');
      
      const data = await response.json();
      if (data.storage) setStorage(data.storage);
      
      setIsEditingStorage(false);
      toast.success('Settings synchronized');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const openStore = () => {
    if (storeUrl) {
      window.open(storeUrl, '_blank');
    } else {
      toast.error('Storefront URL not resolved. Please check your slug.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl opacity-20 bg-[var(--color-primary)] rounded-full animate-pulse" />
            <Loader2 className="animate-spin text-[var(--color-primary)] relative z-10" size={48} />
          </div>
          <p className="text-[var(--on-surface-subtle)] font-medium animate-pulse tracking-wide">Syncing Config...</p>
        </div>
      </div>
    );
  }

  if (hasError && !settings.businessName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] p-6">
        <div className="max-w-md w-full bg-[var(--surface-card)] rounded-3xl p-8 border border-[var(--glass-border)] shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="text-red-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-white">Connection Issue</h2>
          <p className="text-[var(--on-surface-subtle)] mb-8">We couldn't sync your catalog settings. Please check your connection or try again.</p>
          <button 
            onClick={fetchSettings}
            className="w-full py-4 bg-[var(--color-primary)] text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all hover:brightness-110"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--on-surface-base)] p-4 md:p-8 pb-24">
      {/* Header Section */}
      <div className="max-w-5xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="p-3 bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-2xl text-[var(--on-surface-subtle)] hover:text-[var(--on-surface-base)] hover:bg-[var(--surface-section)] active:scale-95 transition-all shadow-xl"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent tracking-tight">
              Catalog Config
            </h1>
            <p className="text-[var(--on-surface-subtle)] font-medium flex items-center gap-2">
              <Settings2 size={14} className="text-[var(--color-primary)]" /> Global store defaults and branding
            </p>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={saving}
          className="group relative px-8 py-4 bg-[var(--color-primary)] text-white rounded-2xl font-bold shadow-2xl shadow-emerald-500/30 overflow-hidden active:scale-95 transition-all disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors" />
          <div className="relative flex items-center justify-center gap-2">
            {saving ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Save size={20} className="group-hover:rotate-6 transition-transform" />
            )}
            {saving ? 'Preserving...' : 'Flush Changes'}
          </div>
        </button>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Settings Column */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Identity & Branding Card */}
          <section className="bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <Palette size={120} />
            </div>
            
            <header className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center">
                <Palette className="text-[var(--color-primary)]" size={24} />
              </div>
              <h2 className="text-xl font-bold">Identity & Branding</h2>
            </header>

            <div className="grid grid-cols-1 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Business Name</label>
                <input 
                  type="text" 
                  value={settings.businessName}
                  onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                  placeholder="e.g. Acme Services"
                  className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-2xl p-4 text-lg font-medium focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] outline-none transition-all placeholder:text-[var(--on-surface-subtle)]/30 text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Accent Color</label>
                  <div className="flex gap-4">
                    <div 
                      className="w-16 h-16 rounded-2xl border-4 border-white/10 shadow-2xl flex-shrink-0 relative overflow-hidden" 
                      style={{ backgroundColor: settings.accentColor }}
                    >
                      <input 
                        type="color" 
                        value={settings.accentColor}
                        onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-[200%] h-[200%] -top-[50%] -left-[50%]"
                      />
                    </div>
                    <div className="flex-grow">
                      <input 
                        type="text" 
                        value={settings.accentColor}
                        onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                        className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-2xl p-4 font-mono uppercase tracking-tighter focus:ring-2 focus:ring-[var(--color-primary)]/50 outline-none transition-all text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Default Duration</label>
                  <div className="flex items-center gap-4 bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-2xl p-4">
                    <Clock size={20} className="text-[var(--on-surface-subtle)]" />
                    <input 
                      type="number" 
                      value={settings.defaultDuration}
                      onChange={(e) => setSettings({ ...settings, defaultDuration: parseInt(e.target.value) || 0 })}
                      className="w-full bg-transparent border-none p-0 focus:ring-0 text-lg font-medium outline-none text-white"
                    />
                    <span className="text-xs font-black uppercase text-[var(--on-surface-subtle)] whitespace-nowrap">Mins</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Catalog Logo</label>
                
                <ImageKitWrapper 
                  publicKey={storage.publicConfig.publicKey}
                  urlEndpoint={storage.publicBaseUrl || storage.publicConfig.urlEndpoint}
                >
                  <div className="bg-[var(--surface-section)] border-2 border-dashed border-[var(--glass-border)] rounded-[2rem] p-8 flex flex-col items-center justify-center group/logo hover:border-[var(--color-primary)]/50 transition-colors relative overflow-hidden">
                    {settings.logoUrl ? (
                      <div className="relative group/image">
                        <img 
                          src={settings.logoUrl} 
                          alt="Logo" 
                          className="max-h-24 object-contain rounded-xl drop-shadow-2xl transition-transform group-hover/image:scale-105" 
                        />
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            setSettings({...settings, logoUrl: ''});
                          }}
                          className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all opacity-0 group-hover/image:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="text-center group-hover/logo:scale-105 transition-transform">
                        <div className="w-16 h-16 bg-[var(--surface-card)] rounded-full flex items-center justify-center border border-[var(--glass-border)] mb-4 mx-auto shadow-inner">
                          <ImageIcon className="text-[var(--on-surface-subtle)]" size={32} />
                        </div>
                        <p className="text-sm font-bold text-[var(--on-surface-base)] mb-1">Upload Brand Logo</p>
                        <p className="text-xs text-[var(--on-surface-subtle)] opacity-50">SVG, PNG or WebP</p>
                      </div>
                    )}
                    
                    <div className="mt-6 w-full max-w-xs">
                      <IKUpload 
                        folder="/catalog/branding"
                        fileName={`logo-${Date.now()}`}
                        onSuccess={(res: any) => {
                          setSettings({ ...settings, logoUrl: res.url });
                          toast.success('Logo uploaded successfully');
                        }}
                        onError={(err: any) => {
                          console.error('Upload error:', err);
                          toast.error('Failed to upload logo');
                        }}
                        className="w-full opacity-0 absolute inset-0 cursor-pointer"
                      />
                      {!settings.logoUrl && (
                        <div className="w-full py-3 bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-xl text-center text-xs font-bold text-[var(--on-surface-subtle)] group-hover/logo:bg-[var(--surface-section)] transition-colors pointer-events-none">
                          Click or drag to upload
                        </div>
                      )}
                    </div>
                  </div>
                </ImageKitWrapper>

                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1 opacity-50">Direct URL (Fallback)</p>
                  <input 
                    type="text" 
                    placeholder="Enter external image URL..."
                    value={settings.logoUrl}
                    onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                    className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-xl p-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)]/50 outline-none text-white opacity-60 hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Regional Settings Card */}
          <section className="bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-[2rem] p-8 shadow-2xl">
            <header className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center">
                <Globe className="text-[var(--color-primary)]" size={24} />
              </div>
              <h2 className="text-xl font-bold">Localization</h2>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Currency</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--on-surface-subtle)] group-focus-within:text-[var(--color-primary)] transition-colors">
                    <DollarSign size={20} />
                  </div>
                  <select 
                    value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-2xl p-4 pl-12 text-lg font-medium outline-none appearance-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all cursor-pointer shadow-lg active:scale-[0.99] text-white"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="VND">VND - Vietnam Dong</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)] ml-1">Timezone</label>
                <div className="relative">
                  <select 
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                    className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-2xl p-4 text-lg font-medium outline-none appearance-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all cursor-pointer shadow-lg active:scale-[0.99] text-white"
                  >
                    <option value="UTC">UTC (Universal)</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                    <option value="Asia/Ho_Chi_Minh">Vietnam (ICT)</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Status Column */}
        <div className="space-y-8">
          <section className="bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-[2rem] p-8 shadow-2xl overflow-hidden relative group">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-[var(--color-primary)]/5 blur-3xl rounded-full" />
            
            <header className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Zap className="text-[var(--color-primary)]" size={24} />
                <h2 className="text-lg font-bold">Infrastructure</h2>
              </div>
              {!isEditingStorage && (
                <button 
                  onClick={() => setIsEditingStorage(true)}
                  className="text-xs font-black text-[var(--color-primary)] hover:brightness-125 transition-all"
                >
                  EDIT CONFIG
                </button>
              )}
            </header>

            <div className="space-y-6">
              {isEditingStorage ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--on-surface-subtle)]">Storage Provider</label>
                    <select 
                      value={storage.provider}
                      onChange={(e) => setStorage({ ...storage, provider: e.target.value })}
                      className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-xl p-3 text-sm font-bold text-white outline-none"
                    >
                      <option value="local">Local (Development Only)</option>
                      <option value="s3">AWS S3 / Compatible</option>
                      <option value="bunny">Bunny CDN</option>
                      <option value="cloudflare_r2">Cloudflare R2</option>
                      <option value="cloudinary">Cloudinary</option>
                      <option value="imagekit">ImageKit</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--on-surface-subtle)]">Public Base URL</label>
                    <input 
                      type="text"
                      value={storage.publicBaseUrl}
                      onChange={(e) => setStorage({ ...storage, publicBaseUrl: e.target.value })}
                      placeholder="https://cdn.example.com"
                      className="w-full bg-[var(--surface-section)] border border-[var(--glass-border)] rounded-xl p-3 text-sm text-white outline-none"
                    />
                  </div>

                  {/* Provider Specific Configuration */}
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                    <p className="text-[10px] font-black text-[var(--on-surface-subtle)] uppercase tracking-wide">Credentials & Secrets</p>
                    
                    {storage.provider === 'bunny' && (
                      <>
                        <input 
                          type="text"
                          placeholder="Storage Zone Name"
                          value={storage.publicConfig.storageZoneName || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, storageZoneName: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="password"
                          placeholder="Access Key (API Key)"
                          value={storage.secretConfig.accessKey || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, accessKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                      </>
                    )}

                    {storage.provider === 'cloudflare_r2' && (
                      <>
                        <input 
                          type="text"
                          placeholder="Bucket Name"
                          value={storage.publicConfig.bucket || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, bucket: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                         <input 
                          type="text"
                          placeholder="Account ID"
                          value={storage.publicConfig.accountId || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, accountId: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="text"
                          placeholder="Access Key ID"
                          value={storage.secretConfig.accessKeyId || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, accessKeyId: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="password"
                          placeholder="Secret Access Key"
                          value={storage.secretConfig.secretAccessKey || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, secretAccessKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                      </>
                    )}

                    {storage.provider === 's3' && (
                      <>
                        <input 
                          type="text"
                          placeholder="Bucket"
                          value={storage.publicConfig.bucket || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, bucket: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                         <input 
                          type="text"
                          placeholder="Region"
                          value={storage.publicConfig.region || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, region: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="text"
                          placeholder="Access Key ID"
                          value={storage.secretConfig.accessKeyId || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, accessKeyId: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="password"
                          placeholder="Secret Access Key"
                          value={storage.secretConfig.secretAccessKey || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, secretAccessKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                      </>
                    )}

                    {storage.provider === 'cloudinary' && (
                      <>
                        <input 
                          type="text"
                          placeholder="Cloud Name"
                          value={storage.publicConfig.cloudName || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, cloudName: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="text"
                          placeholder="API Key"
                          value={storage.publicConfig.apiKey || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, apiKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="password"
                          placeholder="API Secret"
                          value={storage.secretConfig.apiSecret || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, apiSecret: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                      </>
                    )}

                    {storage.provider === 'imagekit' && (
                      <>
                        <input 
                          type="text"
                          placeholder="Public Key"
                          value={storage.publicConfig.publicKey || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, publicKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="text"
                          placeholder="URL Endpoint"
                          value={storage.publicConfig.urlEndpoint || ''}
                          onChange={(e) => setStorage({ ...storage, publicConfig: { ...storage.publicConfig, urlEndpoint: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                        <input 
                          type="password"
                          placeholder="Private Key"
                          value={storage.secretConfig.privateKey || ''}
                          onChange={(e) => setStorage({ ...storage, secretConfig: { ...storage.secretConfig, privateKey: e.target.value } })}
                          className="w-full bg-[var(--surface-card)] border border-[var(--glass-border)] rounded-lg p-2 text-xs text-white"
                        />
                      </>
                    )}

                    {storage.provider === 'local' && (
                      <p className="text-[10px] text-[var(--on-surface-subtle)] italic">No configuration required for local storage.</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleSave}
                      className="flex-1 bg-[var(--color-primary)] text-white text-xs font-black py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all"
                    >
                      SYNC INFRA
                    </button>
                    <button 
                      onClick={() => setIsEditingStorage(false)}
                      className="px-4 bg-white/5 text-[var(--on-surface-subtle)] text-xs font-black py-2 rounded-lg hover:bg-white/10 transition-all"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5 bg-[var(--surface-section)] rounded-2xl border border-[var(--glass-border)] group-hover:border-[var(--color-primary)]/30 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--on-surface-subtle)]">Media Provider</span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${storage.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {storage.isActive ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center font-black text-xs text-white border border-white/5">
                      {storage.provider.toUpperCase().substring(0, 3)}
                    </div>
                    <div>
                      <p className="font-bold capitalize text-white">{storage.provider.replace('_', ' ')} Storage</p>
                      <p className="text-[10px] text-[var(--on-surface-subtle)] tracking-wide font-medium truncate max-w-[140px]">
                        {storage.publicBaseUrl ? new URL(storage.publicBaseUrl).hostname : 'Local Disk'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 ${storage.isActive ? 'bg-emerald-500' : 'bg-stone-500'} rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]`} />
                  <span className="text-sm font-bold text-white">{storage.isActive ? 'Live Sync Ready' : 'Standby Mode'}</span>
                </div>
                <button 
                  onClick={openStore}
                  className="text-[var(--color-primary)] hover:underline flex items-center gap-1 text-xs font-black"
                >
                  OPEN STORE <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </section>

          <section className="p-8 border border-white/5 bg-white/5 rounded-[2rem] backdrop-blur-sm">
            <h3 className="font-bold mb-3 flex items-center gap-2 text-white">
              <ShieldCheck className="text-[var(--on-surface-subtle)]" size={18} />
              Data Persistence
            </h3>
            <p className="text-xs text-[var(--on-surface-subtle)] leading-relaxed font-medium">
              Changes reflect instantly on your public catalog. We recommend flushing caches in the <strong className="text-white underline">Maintenance Panel</strong> if imagery is not updating.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}