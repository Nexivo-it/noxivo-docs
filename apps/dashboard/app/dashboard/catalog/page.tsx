'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Info,
  MoreVertical,
  Clock,
  DollarSign,
  Loader2,
  Edit,
  Copy,
  Trash2,
  Upload,
  Eye,
  X,
  Image as ImageIcon,
  Images,
  CheckCircle2,
  Circle,
  Tag,
  FileText,
  Layers,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Save,
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { CatalogItem } from '@/lib/catalog/types';
import { dashboardApi } from '@/lib/api/dashboard-api';

/* ─── helpers ─────────────────────────────────────────────────── */
function safeParseGallery(raw?: string): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

/* ─── sub-components ──────────────────────────────────────────── */
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; glow?: string }> = {
    ready:         { label: 'Ready',         color: 'var(--color-success)', glow: 'rgba(34, 197, 94, 0.2)' },
    needs_review:  { label: 'Needs Review',  color: 'var(--color-warning)', glow: 'rgba(234, 179, 8, 0.2)' },
    missing_image: { label: 'Missing Image', color: 'var(--color-error)',   glow: 'rgba(239, 68, 68, 0.2)' },
    missing_price: { label: 'Missing Price', color: 'var(--color-error)',   glow: 'rgba(239, 68, 68, 0.2)' },
    draft:         { label: 'Draft',         color: 'var(--on-surface-muted)' },
    published:     { label: 'Published',     color: 'var(--color-primary)', glow: 'rgba(37, 211, 102, 0.2)' },
  };
  const s = map[status] ?? { label: status, color: 'var(--on-surface-muted)' };
  return (
    <span 
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md border border-white/10"
      style={{ 
        background: `linear-gradient(135deg, ${s.glow || 'rgba(255,255,255,0.05)'}, transparent)`,
        color: s.color,
        boxShadow: s.glow ? `0 0 10px ${s.glow}` : 'none'
      }}
    >
      {s.label}
    </span>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5 transition-all duration-300">
      {done
        ? <CheckCircle2 size={16} className="text-primary shrink-0 drop-shadow-[0_0_8px_rgba(37,211,102,0.3)]" strokeWidth={2.5} />
        : <Circle size={16} className="text-on-surface-subtle shrink-0" strokeWidth={2} />}
      <span className={`text-[13px] font-medium transition-colors ${done ? 'text-on-surface' : 'text-on-surface-muted'}`}>
        {label}
      </span>
    </div>
  );
}

function SectionHeader({ icon, title, actionLabel, onAction }:
  { icon: React.ReactNode; title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary drop-shadow-[0_0_8px_rgba(37,211,102,0.4)]">{icon}</span>
      <h3 className="text-[12px] font-bold tracking-widest uppercase text-on-surface-muted m-0">{title}</h3>
      {actionLabel && (
        <button 
          onClick={onAction} 
          className="ml-auto text-[12px] font-bold text-primary hover:text-primary-light transition-colors active:scale-95 bg-transparent border-none cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon, defaultOpen = true, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-white/5 pt-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-500">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer p-0 pb-2 text-on-surface hover:text-primary transition-colors group"
      >
        <span className="text-primary/70 group-hover:text-primary transition-colors drop-shadow-[0_0_5px_rgba(37,211,102,0.2)]">{icon}</span>
        <span className="text-[12px] font-bold tracking-widest uppercase text-on-surface-muted group-hover:text-on-surface transition-colors">{title}</span>
        <span className="ml-auto text-on-surface-muted group-hover:text-on-surface transition-colors">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div className="animate-in fade-in zoom-in-95 duration-300">{children}</div>}
    </div>
  );
}

/* ─── main page ───────────────────────────────────────────────── */
export default function CatalogWorkspace() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Partial<CatalogItem>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'primary' | `gallery-${number}` | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'ready' | 'needs_action' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState<string | null>(null);

  const primaryImageRef = useRef<HTMLInputElement>(null);
  const galleryImageRef = useRef<HTMLInputElement>(null);

  /* fetch catalog */
  useEffect(() => {
    async function fetchItems() {
      try {
        const data = await dashboardApi.getCatalog();
        if (data.items) {
          setItems(data.items);
          const firstItem = data.items[0];
          if (firstItem && !selectedItemId) setSelectedItemId(firstItem.id);
        }
      } catch { toast.error('Failed to load catalog'); }
      finally { setLoading(false); }
    }
    fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* sync edit form */
  useEffect(() => {
    const item = items.find(i => i.id === selectedItemId);
    setEditItem(item ? { ...item } : {});
  }, [selectedItemId, items]);

  /* filtered list */
  const filteredItems = useMemo(() =>
    items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (activeFilter === 'ready') return matchSearch && item.status === 'ready';
      if (activeFilter === 'needs_action') return matchSearch && item.status !== 'ready';
      if (activeFilter === 'inactive') return matchSearch && item.isActive === false;
      return matchSearch;
    }),
  [items, activeFilter, searchQuery]);

  /* gallery derived array */
  const galleryUrls = safeParseGallery(editItem.gallery);

  /* ── readiness engine ── */
  const readiness = useMemo(() => {
    const checks = [
      { id: 'image',    done: !!editItem.mediaPath,                                    label: 'Primary image uploaded',    hint: 'Upload a cover photo in the Images section above.' },
      { id: 'price',    done: !!editItem.priceAmount && (editItem.priceAmount ?? 0) > 0, label: 'Price set',                  hint: 'Enter a price greater than 0 in Service Details.' },
      { id: 'desc',     done: !!editItem.shortDescription,                             label: 'Short description provided',  hint: 'Add a brief description in Service Details.' },
      { id: 'category', done: !!editItem.categoryId,                                   label: 'Category assigned',           hint: 'Pick a category from the dropdown in Service Details.' },
      { id: 'seo',      done: !!editItem.seoTitle && !!editItem.seoDescription,        label: 'SEO tags defined',           hint: 'Add meta title and description for search engines.' },
      { id: 'active',   done: editItem.isActive !== false,                             label: 'Service is active',           hint: 'Enable the toggle in Inventory & Availability.' },
    ];
    const passed = checks.filter(c => c.done).length;
    const allPassed = passed === checks.length;
    return { checks, passed, total: checks.length, allPassed, pct: Math.round((passed / checks.length) * 100) };
  }, [editItem.mediaPath, editItem.priceAmount, editItem.shortDescription, editItem.categoryId, editItem.isActive, editItem.seoTitle, editItem.seoDescription]);

  /* ── input handler ── */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setEditItem(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value
    }));
  };

  /* ── add service ── */
  const handleAddService = async () => {
    setSaving(true);
    try {
      const { item } = await dashboardApi.createCatalogItem({
        payload: {
          name: 'New Service',
          itemType: 'service',
          status: 'needs_review',
          priceAmount: 0,
          durationMinutes: 30,
          isActive: true,
        },
      });
      setItems(prev => [...prev, item]);
      setSelectedItemId(item.id);
      toast.success('New service added');
    } catch { toast.error('Error adding service'); }
    finally { setSaving(false); }
  };

  /* ── save ── */
  const handleSave = async (forceReady = false) => {
    if (!selectedItemId) return;
    setSaving(true);
    try {
      // Auto-derive status: if all readiness checks pass → ready, if forced → ready,
      // if previously ready but now failing → revert to needs_review
      const contentReady = !!editItem.mediaPath &&
        !!editItem.priceAmount && (editItem.priceAmount ?? 0) > 0 &&
        !!editItem.shortDescription &&
        !!editItem.categoryId &&
        !!editItem.seoTitle && !!editItem.seoDescription &&
        editItem.isActive !== false;
      const derivedStatus: CatalogItem['status'] = (forceReady || contentReady)
        ? 'ready'
        : (editItem.status === 'ready' ? 'needs_review' : (editItem.status ?? 'needs_review'));
      const payload = { ...editItem, status: derivedStatus };
      const updated = await dashboardApi.updateCatalogItem(selectedItemId, payload);
      setItems(prev => prev.map(i => i.id === selectedItemId ? updated : i));
      setEditItem(prev => ({ ...prev, status: derivedStatus }));
      if (forceReady) toast.success('🎉 Service marked as Ready!');
      else toast.success('Changes saved');
    } catch { toast.error('Failed to save changes'); }
    finally { setSaving(false); }
  };

  /* ── archive ── */
  const handleArchive = async (targetId?: string) => {
    const id = targetId ?? selectedItemId;
    if (!id) return;
    if (!confirm('Archive this service?')) return;
    try {
      await dashboardApi.deleteCatalogItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      if (selectedItemId === id) setSelectedItemId(null);
      toast.success('Item archived');
    } catch { toast.error('Failed to archive item'); }
  };

  /* ── inventory toggle ── */
  const toggleInventory = () => {
    setEditItem(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  /* ── ai help ── */
  const handleAiHelp = async (targetField: 'all' | 'seo') => {
    setGeneratingAi(targetField);
    try {
      const context: {
        itemType: CatalogItem['itemType'];
        name?: string;
        currentDescription?: string;
        title?: string;
        description?: string;
      } = {
        itemType: editItem.itemType || 'service',
      };

      if (editItem.name) context.name = editItem.name;

      const currentDescription = editItem.shortDescription || editItem.longDescription;
      if (currentDescription) context.currentDescription = currentDescription;

      if (editItem.seoTitle) context.title = editItem.seoTitle;
      if (editItem.seoDescription) context.description = editItem.seoDescription;

      const { suggestions } = await dashboardApi.getCatalogAiHelp({
        mode: targetField === 'seo' ? 'seo-only' : 'all',
        context,
      });

      setEditItem(prev => {
        const patch: Partial<CatalogItem> = {};

        if (targetField === 'all') {
          if (suggestions.name) patch.name = suggestions.name;
          if (suggestions.shortDescription) patch.shortDescription = suggestions.shortDescription;
          if (suggestions.longDescription) patch.longDescription = suggestions.longDescription;
        }

        if (suggestions.seoTitle) patch.seoTitle = suggestions.seoTitle;
        if (suggestions.seoDescription) patch.seoDescription = suggestions.seoDescription;
        if (suggestions.seoKeywords) patch.seoKeywords = suggestions.seoKeywords;

        return { ...prev, ...patch };
      });
      toast.success('AI suggestions applied! Review and save.');
    } catch {
      toast.error('AI was unable to generate suggestions at this time.');
    } finally {
      setGeneratingAi(null);
    }
  };

  /* ── upload primary image ── */
  const handlePrimaryImageUpload = async (file: File) => {
    setUploading('primary');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { url } = await dashboardApi.uploadCatalogAsset(fd);
      setEditItem(prev => ({ ...prev, mediaPath: url, imageUrl: url }));
      toast.success('Image uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(null); }
  };

  /* ── upload gallery image ── */
  const handleGalleryUpload = async (file: File) => {
    const idx = galleryUrls.length;
    setUploading(`gallery-${idx}`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { url } = await dashboardApi.uploadCatalogAsset(fd);
      const updated = [...galleryUrls, url];
      setEditItem(prev => ({ ...prev, gallery: JSON.stringify(updated) }));
      toast.success('Gallery image added');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(null); }
  };

  /* ── remove gallery image ── */
  const removeGalleryImage = (idx: number) => {
    const updated = galleryUrls.filter((_, i) => i !== idx);
    setEditItem(prev => ({ ...prev, gallery: JSON.stringify(updated) }));
  };

  const selectedItem = items.find(i => i.id === selectedItemId);

  /* ── loading ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', gap: '1rem' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--border-ghost)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--on-surface-muted)' }}>Loading catalog…</p>
      </div>
    );
  }

  /* ─── render ──────────────────────────────────────────────── */
  return (
    <div className="grid h-[calc(100vh-64px)] overflow-hidden transition-all duration-500 ease-in-out" style={{ gridTemplateColumns: selectedItemId ? '1fr 400px' : '1fr' }}>

      {/* ── LEFT: canvas ── */}
      <main className="flex flex-col overflow-hidden bg-surface-base relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(37,211,102,0.05),transparent_50%)] pointer-events-none" />
        {/* header */}
        <header className="flex items-center justify-between p-4 px-6 gap-4 border-b border-white/5 flex-shrink-0 z-10 backdrop-blur-xl bg-white/[0.02]">
          <div className="flex items-center gap-3 glass-panel px-4 py-2 borderRadius-md w-[300px] group focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <Search size={18} className="text-on-surface-muted shrink-0 group-hover:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search services…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border-none bg-transparent outline-none flex-1 text-[14px] text-on-surface placeholder:text-on-surface-subtle"
            />
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard/catalog/preview"
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass-panel text-on-surface text-[14px] font-semibold no-underline hover-float active:scale-95 transition-all"
            >
              <Eye size={16} className="text-primary" />
              <span>Preview</span>
            </Link>
            <button
              onClick={handleAddService}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[14px] font-bold border-none cursor-pointer shadow-[0_4px_15px_rgba(37,211,102,0.4)] hover:shadow-[0_8px_25px_rgba(37,211,102,0.6)] hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>Add Service</span>
            </button>
          </div>
        </header>

        {/* filters */}
        <div className="flex-1 overflow-auto p-6 scrollbar-premium">
          <div className="flex items-center gap-2 mb-6 flex-wrap animate-in fade-in slide-in-from-left-4 duration-700">
            {(['all', 'ready', 'needs_action', 'inactive'] as const).map(f => {
              const labels = { all: `All (${items.length})`, ready: 'Ready', needs_action: 'Action Needed', inactive: 'Inactive' };
              const active = activeFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition-all duration-300 border ${
                    active 
                      ? 'bg-primary text-white border-primary shadow-[0_0_15px_rgba(37,211,102,0.4)]' 
                      : 'glass-panel text-on-surface-muted border-white/5 hover:border-white/20 hover:text-on-surface'
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>

          {/* grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 h-fit">
            {filteredItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`group relative flex flex-col p-4 rounded-3xl border transition-all duration-500 scale-in-center animate-float-in lumina-card hover-float ${
                  selectedItemId === item.id 
                    ? 'border-primary shadow-primary-glow bg-white/[0.05]' 
                    : 'border-white/5 hover:border-white/10 bg-white/[0.02]'
                }`}
                style={{ 
                  animationDelay: `${idx * 50}ms`,
                  opacity: item.isActive === false ? 0.6 : 1 
                }}
              >
                {/* inactive badge */}
                {item.isActive === false && (
                  <div className="absolute top-4 right-12 z-20 px-2 py-0.5 rounded-full bg-surface-base border border-white/10 text-[10px] font-black tracking-tighter text-on-surface-subtle">
                    OFFLINE
                  </div>
                )}
                {/* thumbnail */}
                <div className="relative w-full aspect-square rounded-2xl overflow-hidden mb-4 bg-white/[0.03] flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500">
                  {item.mediaPath
                    ? <img src={item.mediaPath} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    : <ImageIcon size={48} className="text-on-surface-subtle opacity-20" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-4">
                    <span className="text-white text-[10px] font-bold tracking-widest uppercase flex items-center gap-1">
                      <Search size={10} /> View Details
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 px-1">
                  <h3 className="text-[15px] font-bold text-on-surface leading-tight line-clamp-1 group-hover:text-primary transition-colors">{item.name}</h3>
                  <div className="flex items-center gap-2 text-[12px] font-medium text-on-surface-muted mb-2">
                    <span className="text-primary/90">${item.priceAmount || '0'}</span>
                    <span className="opacity-30">|</span>
                    <span className="flex items-center gap-1 italic"><Clock size={10} /> {item.durationMinutes || 0}m</span>
                  </div>
                  <div className="mt-auto pt-2 border-t border-white/5 flex justify-between items-center">
                    <StatusChip status={item.status} />
                  </div>
                </div>
                {/* options button */}
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === item.id ? null : item.id); }}
                  className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-on-surface-muted opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/[0.1] transition-all z-10"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpenId === item.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="absolute top-14 right-4 w-[160px] glass-panel p-1.5 z-30 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                  >
                    {[
                      { icon: <Edit size={14} />, label: 'Edit', action: () => { setSelectedItemId(item.id); setMenuOpenId(null); } },
                      { icon: <Copy size={14} />, label: 'Duplicate', action: () => setMenuOpenId(null) },
                      { icon: <Trash2 size={14} />, label: 'Archive', danger: true, action: () => { handleArchive(item.id); setMenuOpenId(null); } },
                    ].map(({ icon, label, danger, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className={`flex items-center gap-3 w-full p-2 rounded-lg text-[13px] font-bold text-left transition-colors cursor-pointer border-none bg-transparent ${
                          danger ? 'text-error hover:bg-error/10' : 'text-on-surface hover:bg-white/5'
                        }`}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-16 gap-4 text-on-surface-muted animate-in fade-in duration-1000">
                <Search size={48} className="opacity-10 stroke-[1.5]" />
                <p className="text-[14px] font-medium tracking-wide">No services found in this category.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── RIGHT: inspector panel ── */}
      <aside 
        className={`fixed right-0 top-16 w-[440px] h-[calc(100vh-64px)] sidebar-glass border-l border-white/5 transition-all duration-700 ease-lumina z-50 flex flex-col ${
          selectedItemId ? 'translate-x-0 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]' : 'translate-x-full'
        }`}
      >
        {/* hidden file inputs */}
        <input
          ref={primaryImageRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePrimaryImageUpload(f); e.target.value = ''; }}
        />
        <input
          ref={galleryImageRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleGalleryUpload(f); e.target.value = ''; }}
        />

        {selectedItem ? (
          <div className="flex flex-col h-full">
            {/* panel header */}
            <header className="flex items-center p-4 px-6 gap-3 border-b border-white/5 flex-shrink-0 bg-transparent backdrop-blur-md sticky top-0 z-20">
              <h2 className="text-[16px] font-black tracking-tight text-on-surface m-0">Edit Service</h2>
              {/* inventory toggle pill */}
              <button
                onClick={toggleInventory}
                className={`ml-3 flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-tighter cursor-pointer transition-all ${
                  editItem.isActive !== false 
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_10px_rgba(37,211,102,0.1)]' 
                    : 'border-white/10 bg-white/5 text-on-surface-muted'
                  }`}
              >
                {editItem.isActive !== false
                  ? <><Power size={12} strokeWidth={3} /> Active</>
                  : <><PowerOff size={12} strokeWidth={3} /> Inactive</>}
              </button>
              <button 
                onClick={() => setSelectedItemId(null)} 
                className="ml-auto p-2 rounded-xl text-on-surface-muted hover:text-white hover:bg-white/5 transition-all"
              >
                <X size={20} />
              </button>
            </header>

            {/* scrollable body */}
            <div className="flex-1 overflow-auto p-6 space-y-8 scrollbar-premium">

              {/* ──────── PRIMARY IMAGE ──────── */}
              <CollapsibleSection title="Primary Image" icon={<ImageIcon size={14} />}>
                {editItem.mediaPath ? (
                  <div className="relative rounded-3xl overflow-hidden mb-2 group shadow-2xl">
                    <img src={editItem.mediaPath} alt="Primary" className="w-full max-h-[240px] object-cover block transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4">
                      <button
                        onClick={() => setEditItem(prev => ({ ...prev, mediaPath: null, imageUrl: '' }))}
                        className="p-2 rounded-full bg-error/80 text-white hover:bg-error transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        onClick={() => primaryImageRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-bold text-[13px] hover:shadow-primary-glow transition-all"
                      >
                        <Upload size={14} /> Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => primaryImageRef.current?.click()}
                    disabled={uploading === 'primary'}
                    className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-white/10 rounded-3xl bg-white/[0.02] hover:border-primary/50 hover:bg-primary/[0.02] transition-all w-full text-on-surface-muted group"
                  >
                    {uploading === 'primary'
                      ? <Loader2 size={32} className="animate-spin text-primary" />
                      : <Upload size={32} className="group-hover:text-primary transition-colors" />}
                    <div className="text-center">
                      <span className="block text-[14px] font-bold text-on-surface">Upload Primary Image</span>
                      <span className="block text-[12px] opacity-60">PNG, JPG, WebP up to 10MB</span>
                    </div>
                  </button>
                )}
              </CollapsibleSection>

              {/* ──────── GALLERY ──────── */}
              <CollapsibleSection title="Gallery" icon={<Images size={14} />} defaultOpen={true}>
                <div className="grid grid-cols-3 gap-3 mb-4 pt-2">
                  {galleryUrls.map((url, idx) => (
                    <div key={url} className="group relative aspect-square rounded-2xl overflow-hidden glass-panel border-white/5 bg-on-surface/5 shadow-lg">
                      <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <button
                          onClick={() => removeGalleryImage(idx)}
                          className="p-1.5 rounded-full bg-error/80 text-white hover:bg-error transition-all scale-75 group-hover:scale-100 duration-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {galleryUrls.length < 9 && (
                    <button
                      onClick={() => galleryImageRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-1 aspect-square border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] hover:border-primary/50 hover:bg-primary/[0.02] transition-all text-on-surface-muted group"
                    >
                      {uploading?.startsWith('gallery')
                        ? <Loader2 size={24} className="animate-spin text-primary" />
                        : <><Plus size={20} className="group-hover:text-primary transition-colors" /><span className="text-[10px] font-black uppercase tracking-tighter">Add</span></>}
                    </button>
                  )}
                </div>
                <div className="flex justify-between items-center px-1">
                  <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-muted m-0">{galleryUrls.length}/9 images</p>
                  <p className="text-[10px] font-medium text-on-surface-subtle italic">Max 10MB per file</p>
                </div>
              </CollapsibleSection>

              {/* ──────── CORE FIELDS ──────── */}
              <CollapsibleSection title="Service Details" icon={<FileText size={14} />}>
                <div className="space-y-6 pt-2">
                  <div className="group">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted group-focus-within:text-primary transition-colors">Service Name</label>
                      <button
                        onClick={() => handleAiHelp('all')}
                        disabled={!!generatingAi}
                        className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-tighter text-primary hover:text-primary-light disabled:opacity-50 transition-all cursor-pointer bg-transparent border-none"
                      >
                        {generatingAi === 'all' ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        AI Help
                      </button>
                    </div>
                    <input
                      type="text"
                      name="name"
                      value={editItem.name || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. Deluxe Spa Manicure"
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[15px] font-medium text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Price</label>
                      <div className="flex items-center gap-3 glass-panel px-4 py-3 rounded-2xl border border-white/5 group-focus-within:border-primary/50 group-focus-within:ring-1 group-focus-within:ring-primary/20 transition-all">
                        <DollarSign size={16} className="text-on-surface-subtle" />
                        <input
                          type="number"
                          name="priceAmount"
                          value={editItem.priceAmount ?? ''}
                          onChange={handleInputChange}
                          className="flex-1 bg-transparent border-none outline-none text-[15px] font-bold text-on-surface p-0"
                        />
                      </div>
                    </div>
                    <div className="group">
                      <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Duration (min)</label>
                      <div className="flex items-center gap-3 glass-panel px-4 py-3 rounded-2xl border border-white/5 group-focus-within:border-primary/50 group-focus-within:ring-1 group-focus-within:ring-primary/20 transition-all">
                        <Clock size={16} className="text-on-surface-subtle" />
                        <input
                          type="number"
                          name="durationMinutes"
                          value={editItem.durationMinutes ?? ''}
                          onChange={handleInputChange}
                          className="flex-1 bg-transparent border-none outline-none text-[15px] font-bold text-on-surface p-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Short Description</label>
                    <textarea
                      rows={3}
                      name="shortDescription"
                      value={editItem.shortDescription || ''}
                      onChange={handleInputChange}
                      placeholder="A brief description shown in listings…"
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-medium text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Full Description</label>
                    <textarea
                      rows={4}
                      name="longDescription"
                      value={editItem.longDescription || ''}
                      onChange={handleInputChange}
                      placeholder="Detailed description, benefits, what's included…"
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-medium text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Category</label>
                    <select
                      name="categoryId"
                      value={editItem.categoryId || ''}
                      onChange={handleInputChange}
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-bold text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-surface-base">Select Category</option>
                      <option value="nails" className="bg-surface-base">Nails</option>
                      <option value="makeup" className="bg-surface-base">Makeup</option>
                      <option value="skincare" className="bg-surface-base">Skincare</option>
                      <option value="body" className="bg-surface-base">Body</option>
                      <option value="hair" className="bg-surface-base">Hair</option>
                      <option value="lashes" className="bg-surface-base">Lashes & Brows</option>
                      <option value="massage" className="bg-surface-base">Massage</option>
                      <option value="waxing" className="bg-surface-base">Waxing</option>
                    </select>
                  </div>
                </div>
              </CollapsibleSection>

              {/* ──────── METADATA & SEO ──────── */}
              <CollapsibleSection title="Metadata & SEO" icon={<Tag size={14} />} defaultOpen={true}>
                <div className="space-y-6 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted">SEO Metadata</label>
                    <button
                      onClick={() => handleAiHelp('seo')}
                      disabled={!!generatingAi}
                      className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-tighter text-primary hover:text-primary-light disabled:opacity-50 transition-all cursor-pointer bg-transparent border-none"
                    >
                      {generatingAi === 'seo' ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      AI Optimize
                    </button>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Browser Title</label>
                    <input
                      type="text"
                      name="seoTitle"
                      value={editItem.seoTitle || ''}
                      onChange={handleInputChange}
                      placeholder="Standard SEO title..."
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[15px] font-medium text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    <div className="flex justify-end mt-1.5">
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${(editItem.seoTitle?.length || 0) > 60 ? 'text-error' : 'text-on-surface-subtle opacity-60'}`}>
                        {editItem.seoTitle?.length || 0}/60
                      </span>
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Meta Description</label>
                    <textarea
                      rows={3}
                      name="seoDescription"
                      value={editItem.seoDescription || ''}
                      onChange={handleInputChange}
                      placeholder="Write a compelling meta description..."
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-medium text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                    />
                    <div className="flex justify-end mt-1.5">
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${(editItem.seoDescription?.length || 0) > 160 ? 'text-error' : 'text-on-surface-subtle opacity-60'}`}>
                        {editItem.seoDescription?.length || 0}/160
                      </span>
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Slug / URL Handle</label>
                    <input
                      type="text"
                      name="slug"
                      value={editItem.slug || ''}
                      onChange={handleInputChange}
                      placeholder="my-service-handle"
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-bold text-primary font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Item Type</label>
                      <select
                        name="itemType"
                        value={editItem.itemType || 'service'}
                        onChange={handleInputChange}
                        className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] font-bold text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                      >
                        <option value="service" className="bg-surface-base">Service</option>
                        <option value="add_on" className="bg-surface-base">Add-on</option>
                        <option value="bundle" className="bg-surface-base">Bundle</option>
                        <option value="package" className="bg-surface-base">Package</option>
                      </select>
                    </div>
                    <div className="flex items-end pb-1 px-1">
                      <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setEditItem(prev => ({ ...prev, isVariablePrice: !prev.isVariablePrice }))}>
                        <div className={`w-10 h-5 rounded-full relative transition-all duration-300 ${editItem.isVariablePrice ? 'bg-primary shadow-primary-glow' : 'bg-white/10'}`}>
                          <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${editItem.isVariablePrice ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <span className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted group-hover:text-on-surface transition-colors">Variable Price</span>
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted mb-2 block group-focus-within:text-primary transition-colors">Internal Staff Notes</label>
                    <textarea
                      rows={2}
                      name="notes"
                      value={editItem.notes || ''}
                      onChange={handleInputChange}
                      placeholder="Staff usage only..."
                      className="w-full glass-panel px-4 py-3 rounded-2xl border border-white/5 text-[14px] italic text-on-surface-muted outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>
                </div>
              </CollapsibleSection>

              {/* ──────── INVENTORY ──────── */}
              <CollapsibleSection title="Inventory & Availability" icon={<Layers size={14} />} defaultOpen={true}>
                <div className="glass-panel border-white/5 rounded-2xl overflow-hidden mt-2">
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <p className="m-0 text-[14px] font-bold text-on-surface">Service Active</p>
                      <p className="mt-1 text-[12px] text-on-surface-muted italic">Visible to clients in booking & catalog</p>
                    </div>
                    <div
                      onClick={toggleInventory}
                      className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-500 ${editItem.isActive !== false ? 'bg-primary shadow-primary-glow' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-500 ${editItem.isActive !== false ? 'translate-x-6' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  {editItem.isActive === false && (
                    <div className="px-5 py-3 bg-warning/10 border-t border-warning/20">
                      <p className="m-0 text-[11px] font-black uppercase tracking-tighter text-warning flex items-center gap-2">
                        <AlertTriangle size={12} /> Hidden from clients
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* ──────── READINESS ──────── */}
              <CollapsibleSection title="Readiness Check" icon={<CheckCircle2 size={14} />}>
                <div className="glass-panel border-white/5 rounded-2xl p-5 space-y-4 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest uppercase text-on-surface-muted">
                      {readiness.passed}/{readiness.total} checks
                    </span>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                      readiness.allPassed ? 'bg-success/20 text-success' : readiness.pct >= 60 ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'
                    }`}>
                      {readiness.pct}% Complete
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        readiness.allPassed ? 'bg-success shadow-success-glow' : readiness.pct >= 60 ? 'bg-warning shadow-warning-glow' : 'bg-error shadow-error-glow'
                      }`}
                      style={{ width: `${readiness.pct}%` }}
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    {readiness.checks.map(check => (
                      <div key={check.id} className="flex items-start gap-3 group">
                        <div className={`mt-0.5 transition-colors duration-300 ${check.done ? 'text-success' : 'text-on-surface-muted'}`}>
                          {check.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-[13px] font-medium transition-colors ${check.done ? 'text-on-surface' : 'text-on-surface-muted'}`}>
                            {check.label}
                          </p>
                          {!check.done && (
                            <p className="mt-1 text-[11px] font-black uppercase tracking-tighter text-error/80">
                              Suggestion: {check.hint}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {readiness.allPassed ? (
                    <button
                      onClick={() => handleSave(true)}
                      disabled={saving || editItem.status === 'ready' || editItem.status === 'published'}
                      className={`w-full mt-2 py-3 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-black uppercase tracking-widest transition-all duration-300 ${
                        (editItem.status === 'ready' || editItem.status === 'published')
                          ? 'bg-success/10 border border-success/30 text-success'
                          : 'bg-primary shadow-primary-glow text-white hover:scale-[1.02] active:scale-[0.98]'
                      } disabled:opacity-50`}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                      {(editItem.status === 'ready' || editItem.status === 'published') ? 'Live on Catalog ✓' : 'Publish Service'}
                    </button>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                      <p className="m-0 text-[11px] font-black uppercase tracking-widest text-on-surface-muted opacity-60">
                        Complete {readiness.total - readiness.passed} more to publish
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

            </div>{/* end scrollable body */}

            {/* panel footer */}
            <footer className="p-6 flex gap-4 border-t border-white/5 bg-on-surface/[0.02] backdrop-blur-md">
              <button
                onClick={() => handleArchive()}
                className="flex-1 py-4 rounded-2xl border border-white/10 text-[13px] font-black uppercase tracking-widest text-on-surface-muted hover:bg-white/5 hover:text-on-surface transition-all active:scale-95"
              >
                Archive
              </button>
              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="flex-[2] py-4 rounded-2xl bg-primary shadow-primary-glow text-white text-[13px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Saving...</>
                ) : (
                  <><Save size={16} /> Save Changes</>
                )}
              </button>
            </footer>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--on-surface-muted)', textAlign: 'center', padding: '2rem' }}>
            <Info size={48} style={{ opacity: 0.3 }} />
            <p>Select a service to view and edit its details.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
