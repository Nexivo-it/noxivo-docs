'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Tag,
  FileText,
  Star,
  Upload,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { CatalogItem, CustomField, Review } from '@/lib/catalog/types';

const STYLES = {
  container: "display: grid; grid-template-columns: 1fr 380px; height: calc(100vh - 64px);",
  canvas: "display: flex; flex-direction: column; overflow: hidden;",
  canvasHeader: "display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; gap: 1rem; border-bottom: 1px solid var(--border);",
  searchBar: "display: flex; align-items: center; gap: 0.5rem; background: var(--surface-section); padding: 0.5rem 1rem; border-radius: var(--radius-md); width: 300px;",
  searchIcon: "color: var(--muted); width: 18px; height: 18px;",
  input: "border: none; background: transparent; outline: none; flex: 1; font-size: 0.9rem; color: var(--foreground);",
  canvasActions: "display: flex; gap: 0.75rem;",
  previewBtn: "display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); background: var(--surface-section); color: var(--foreground); font-size: 0.9rem; font-weight: 500; text-decoration: none; transition: background 0.2s;",
  addBtn: "display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); font-size: 0.9rem; font-weight: 500; border: none; cursor: pointer; transition: opacity 0.2s;",
  hideMobile: "display: block; @media (max-width: 768px) { display: none; }",
  spin: "animation: spin 1s linear infinite;",
  canvasContent: "flex: 1; overflow: auto; padding: 1.5rem;",
  filterBar: "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;",
  activeFilter: "padding: 0.4rem 0.75rem; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); border: none; cursor: pointer; font-size: 0.85rem;",
  grid: "display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;",
  card: "position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.75rem; background: var(--surface-base); cursor: pointer; transition: all 0.2s;",
  cardSelected: "border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary);",
  cardImage: "width: 100%; height: 140px; border-radius: var(--radius-md); overflow: hidden; margin-bottom: 0.75rem; background: var(--surface-section); display: flex; align-items: center; justify-content: center;",
  placeholderIcon: "font-size: 2rem;",
  cardInfo: "display: flex; flex-direction: column; gap: 0.25rem;",
  cardMeta: "display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; color: var(--muted);",
  dot: "width: 4px; height: 4px; border-radius: 50%; background: var(--muted);",
  inspector: "position: fixed; right: 0; top: 64px; width: 380px; height: calc(100vh - 64px); background: var(--surface-base); border-left: 1px solid var(--border); transform: translateX(100%); transition: transform 0.3s ease; display: flex; flex-direction: column; z-index: 50;",
  inspectorVisible: "transform: translateX(0);",
  inspectorContent: "display: flex; flex-direction: column; height: 100%;",
  inspectorHeader: "display: flex; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border); gap: 0.75rem;",
  dragHandle: "width: 24px; height: 4px; border-radius: 2px; background: var(--border);",
  closeBtn: "margin-left: auto; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--muted);",
  inspectorScroll: "flex: 1; overflow: auto; padding: 1rem;",
  inspectorField: "margin-bottom: 1rem;",
  inspectorRow: "display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;",
  inputWithIcon: "display: flex; align-items: center; gap: 0.5rem; background: var(--surface-section); border-radius: var(--radius-md); padding-left: 0.75rem;",
  metaSection: "padding: 1rem 0; border-top: 1px solid var(--border);",
  readinessSection: "padding: 1rem 0; border-top: 1px solid var(--border);",
  checkItem: "display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0;",
  checkCircle: "width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center;",
  checkDone: "background: var(--primary); border-color: var(--primary); color: var(--primary-foreground);",
  inspectorFooter: "display: flex; gap: 0.75rem; padding: 1rem; border-top: 1px solid var(--border);",
  secondaryBtn: "flex: 1; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--border); background: transparent; color: var(--foreground); cursor: pointer;",
  primaryBtn: "flex: 1; padding: 0.75rem; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); border: none; cursor: pointer;",
  loadingContainer: "display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 1rem;",
  spinner: "width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;",
  emptyState: "grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; gap: 1rem; color: var(--muted);",
  emptyInspector: "display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--muted); text-align: center; padding: 2rem;",
  dropdownMenu: "position: absolute; top: 100%; right: 0; background: var(--surface-base); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.25rem; min-width: 120px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.15);",
  dropdownItem: "display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.75rem; border: none; background: transparent; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85rem; text-align: left; color: var(--foreground);",
  dropdownItemDanger: "color: var(--destructive);",
  primaryImageSection: "display: flex; align-items: center; justify-content: center;",
  primaryImagePreview: "position: relative; width: 100%; max-height: 200px; border-radius: var(--radius-md); overflow: hidden;",
  primaryImageUpload: "display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2rem; border: 2px dashed var(--border); border-radius: var(--radius-md); background: var(--surface-section); cursor: pointer; width: 100%; color: var(--muted);",
  statusChip: "display: inline-flex; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 500;",
  ready: "background: #dcfce7; color: #166534;",
  needs_review: "background: #fef9c3; color: #854d0e;",
  missing_image: "background: #fee2e2; color: #991b1b;",
  missing_price: "background: #fee2e2; color: #991b1b;",
  draft: "background: #f3f4f6; color: #374151;",
  cardOptions: "position: absolute; top: 0.5rem; right: 0.5rem; background: var(--surface-base); border: none; padding: 0.25rem; border-radius: var(--radius-sm); cursor: pointer; opacity: 0; transition: opacity 0.2s;",
  activeCard: "opacity: 1;",
  galleryGrid: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;",
  galleryItem: "position: relative; aspect-ratio: 1; border-radius: var(--radius-md); overflow: hidden;",
  removeGalleryBtn: "position: absolute; top: 0.25rem; right: 0.25rem; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;",
  addGalleryBtn: "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem; aspect-ratio: 1; border: 2px dashed var(--border); border-radius: var(--radius-md); background: var(--surface-section); cursor: pointer; color: var(--muted); font-size: 0.75rem;",
  reviewsList: "display: flex; flex-direction: column; gap: 0.75rem;",
  reviewItem: "padding: 0.75rem; background: var(--surface-section); border-radius: var(--radius-md);",
  reviewHeader: "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;",
  fieldLabelInput: "flex: 1; padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem;",
  editInput: "width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 0.85rem; background: var(--surface-base); color: var(--foreground); resize: vertical;",
  customFieldsList: "display: flex; flex-direction: column; gap: 0.75rem;",
  customFieldItem: "padding: 0.75rem; background: var(--surface-section); border-radius: var(--radius-md);",
  fieldHeader: "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;",
  fieldTypeSelect: "padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.8rem; background: var(--surface-base);",
  removeFieldBtn: "background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1rem;",
  addMiniBtn: "display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); background: var(--surface-section); border: none; cursor: pointer; font-size: 0.8rem; color: var(--foreground);",
};
function StatusChip({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ready: 'Ready',
    needs_review: 'Needs Review',
    missing_image: 'Missing Image',
    missing_price: 'Missing Price',
    draft: 'Draft'
  };
  return (
    <span style={{ 
      padding: '0.2rem 0.5rem', 
      borderRadius: 'var(--radius-sm)', 
      fontSize: '0.75rem', 
      fontWeight: 500,
      background: status === 'ready' ? '#dcfce7' : status === 'needs_review' ? '#fef9c3' : '#f3f4f6',
      color: status === 'ready' ? '#166534' : status === 'needs_review' ? '#854d0e' : '#374151'
    }}>
      {labels[status] || status}
    </span>
  );
}

function CheckItem({ done, label }: { done: boolean, label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
      <div style={{ 
        width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--primary)' : 'transparent',
        borderColor: done ? 'var(--primary)' : 'var(--border)',
        color: done ? 'var(--primary-foreground)' : 'transparent'
      }}>
        {done && <Info size={12} />}
      </div>
      <span style={{ color: done ? 'var(--foreground)' : 'var(--muted)' }}>{label}</span>
    </div>
  );
}

export default function CatalogWorkspace() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Partial<CatalogItem>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'ready' | 'needs_action'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItems() {
      try {
        const response = await fetch('/api/catalog');
        const data = await response.json();
        if (data.items) {
          setItems(data.items);
          if (data.items.length > 0 && !selectedItemId) {
            setSelectedItemId(data.items[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch items:', error);
        toast.error('Failed to load catalog');
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, [selectedItemId]);

  useEffect(() => {
    const item = items.find(i => i.id === selectedItemId);
    if (item) {
      setEditItem({ ...item });
    } else {
      setEditItem({});
    }
  }, [selectedItemId, items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      let matchesFilter = true;
      if (activeFilter === 'ready') matchesFilter = item.status === 'ready';
      if (activeFilter === 'needs_action') matchesFilter = item.status !== 'ready';
      return matchesSearch && matchesFilter;
    });
  }, [items, activeFilter, searchQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setEditItem(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value
    }));
  };

  const handleAddService = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            name: 'New Service',
            itemType: 'service',
            status: 'needs_review',
            priceAmount: 0,
            durationMinutes: 30
          }
        }),
      });

      if (!response.ok) throw new Error('Failed to add service');

      const { item } = await response.json();
      setItems(prev => [...prev, item]);
      setSelectedItemId(item.id);
      toast.success('New service added');
    } catch (error) {
      console.error('Error adding service:', error);
      toast.error('Error adding service');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedItemId || !editItem) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/catalog/${selectedItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });

      if (!response.ok) throw new Error('Failed to save changes');

      const updatedItem = await response.json();
      setItems(prev => prev.map(item => item.id === selectedItemId ? updatedItem : item));
      toast.success('Changes saved');
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    const targetId = selectedItemId;
    if (!targetId) return;
    if (!confirm('Are you sure you want to archive this service?')) return;

    try {
      const response = await fetch(`/api/catalog/${targetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to archive item');

      setItems(prev => prev.filter(item => item.id !== targetId));
      if (selectedItemId === targetId) setSelectedItemId(null);
      toast.success('Item archived');
    } catch (error) {
      console.error('Error archiving item:', error);
      toast.error('Failed to archive item');
    }
  };

  const selectedItem = items.find(item => item.id === selectedItemId);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', gap: '1rem' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p>Loading catalog...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedItemId ? '1fr 380px' : '1fr', height: 'calc(100vh - 64px)' }}>
      <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', gap: '1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-section)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', width: 300 }}>
            <Search size={18} style={{ color: 'var(--muted)' }} />
            <input 
              type="text" 
              placeholder="Search services..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.9rem', color: 'var(--foreground)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/dashboard/catalog/preview" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--surface-section)', color: 'var(--foreground)', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none' }}>
              <Eye size={18} />
              <span>Preview</span>
            </Link>
            <button onClick={handleAddService} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.9rem', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
              {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} />}
              <span>Add Service</span>
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveFilter('all')} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', background: activeFilter === 'all' ? 'var(--primary)' : 'var(--surface-section)', color: activeFilter === 'all' ? 'var(--primary-foreground)' : 'var(--foreground)', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              All ({items.length})
            </button>
            <button onClick={() => setActiveFilter('ready')} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', background: activeFilter === 'ready' ? 'var(--primary)' : 'var(--surface-section)', color: activeFilter === 'ready' ? 'var(--primary-foreground)' : 'var(--foreground)', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              Ready
            </button>
            <button onClick={() => setActiveFilter('needs_action')} style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', background: activeFilter === 'needs_action' ? 'var(--primary)' : 'var(--surface-section)', color: activeFilter === 'needs_action' ? 'var(--primary-foreground)' : 'var(--foreground)', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              Action Needed
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {filteredItems.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedItemId(item.id)}
                style={{ 
                  position: 'relative', 
                  border: '1px solid var(--border)', 
                  borderRadius: 'var(--radius-lg)', 
                  padding: '0.75rem', 
                  background: 'var(--surface-base)', 
                  cursor: 'pointer', 
                  borderColor: selectedItemId === item.id ? 'var(--primary)' : 'var(--border)',
                  boxShadow: selectedItemId === item.id ? '0 0 0 2px var(--primary)' : 'none'
                }}
              >
                <div style={{ width: '100%', height: 140, borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '0.75rem', background: 'var(--surface-section)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.mediaPath ? (
                    <img src={item.mediaPath} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '2rem' }}>✨</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>{item.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    <span>{item.priceAmount ? `$${item.priceAmount}` : 'No price'}</span>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--muted)' }}>•</span>
                    <span>{item.durationMinutes || 0} min</span>
                  </div>
                  <StatusChip status={item.status} />
                </div>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setMenuOpenId(menuOpenId === item.id ? null : item.id);
                  }}
                  style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'var(--surface-base)', border: 'none', padding: '0.25rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpenId === item.id && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--surface-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.25rem', minWidth: 120, zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setSelectedItemId(item.id); setMenuOpenId(null); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left', color: 'var(--foreground)' }}>
                      <Edit size={14} /> Edit
                    </button>
                    <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left', color: 'var(--foreground)' }}>
                      <Copy size={14} /> Duplicate
                    </button>
                    <button onClick={() => handleArchive()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left', color: 'var(--destructive)' }}>
                      <Trash2 size={14} /> Archive
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem', color: 'var(--muted)' }}>
                <Search size={48} />
                <p>No services found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <aside style={{ 
        position: 'fixed', 
        right: 0, 
        top: 64, 
        width: 380, 
        height: 'calc(100vh - 64px)', 
        background: 'var(--surface-base)', 
        borderLeft: '1px solid var(--border)', 
        transform: selectedItemId ? 'translateX(0)' : 'translateX(100%)', 
        transition: 'transform 0.3s ease', 
        display: 'flex', 
        flexDirection: 'column', 
        zIndex: 50 
      }}>
        {selectedItem ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <header style={{ display: 'flex', alignItems: 'center', padding: '1rem', borderBottom: '1px solid var(--border)', gap: '0.75rem' }}>
              <div style={{ width: 24, height: 4, borderRadius: 2, background: 'var(--border)' }} />
              <h2>Edit Service</h2>
              <button onClick={() => setSelectedItemId(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </header>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Service Name</label>
                <input 
                  type="text" 
                  name="name"
                  value={editItem.name || ''} 
                  onChange={handleInputChange}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', background: 'var(--surface-section)', color: 'var(--foreground)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Price</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-section)', borderRadius: 'var(--radius-md)', paddingLeft: '0.75rem' }}>
                    <DollarSign size={14} />
                    <input 
                      type="number" 
                      name="priceAmount"
                      value={editItem.priceAmount ?? ''} 
                      onChange={handleInputChange}
                      style={{ flex: 1, padding: '0.5rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: 'var(--foreground)' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Duration (min)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-section)', borderRadius: 'var(--radius-md)', paddingLeft: '0.75rem' }}>
                    <Clock size={14} />
                    <input 
                      type="number" 
                      name="durationMinutes"
                      value={editItem.durationMinutes ?? ''} 
                      onChange={handleInputChange}
                      style={{ flex: 1, padding: '0.5rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem', color: 'var(--foreground)' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Description</label>
                <textarea 
                  rows={4} 
                  name="shortDescription"
                  value={editItem.shortDescription || ''} 
                  onChange={handleInputChange}
                  placeholder="A premium treatment designed to relax and rejuvenate."
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', background: 'var(--surface-section)', color: 'var(--foreground)', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem' }}>Category</label>
                <select 
                  name="categoryId"
                  value={editItem.categoryId || ''} 
                  onChange={handleInputChange}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', background: 'var(--surface-section)', color: 'var(--foreground)' }}
                >
                  <option value="">Select Category</option>
                  <option value="nails">Nails</option>
                  <option value="makeup">Makeup</option>
                  <option value="skincare">Skincare</option>
                  <option value="body">Body</option>
                </select>
              </div>

              <div style={{ padding: '1rem 0', borderTop: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>Readiness Check</h3>
                <CheckItem done={!!editItem.mediaPath} label="Service Image" />
                <CheckItem done={!!editItem.priceAmount} label="Price set" />
                <CheckItem done={!!editItem.shortDescription} label="Description provided" />
                <CheckItem done={editItem.status === 'ready'} label="Final Review" />
              </div>
            </div>

            <footer style={{ display: 'flex', gap: '0.75rem', padding: '1rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={handleArchive} style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>Archive</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </footer>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
            <Info size={48} />
            <p>Select a service to view and edit its details.</p>
          </div>
        )}
      </aside>
    </div>
  );
}