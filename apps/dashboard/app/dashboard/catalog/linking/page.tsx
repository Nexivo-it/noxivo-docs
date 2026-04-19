'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Link2, ArrowLeft, Package, ArrowRight, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { CatalogItem } from '@/lib/catalog/types';

export default function CatalogLinking() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<Array<{ id: string; name: string; items: string[]; originalPrice?: number; priceAmount?: number }>>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/catalog');
        const data = await response.json();
        if (data.items) {
          setItems(data.items.filter((i: CatalogItem) => i.itemType === 'service'));
        }
      } catch (error) {
        console.error('Failed to fetch items:', error);
        toast.error('Failed to load services');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const addBundle = () => {
    setBundles([...bundles, { id: `bundle-${Date.now()}`, name: 'New Bundle', items: [], originalPrice: 0, priceAmount: 0 }]);
  };

  const updateBundle = (id: string, updates: Partial<typeof bundles[0]>) => {
    setBundles(bundles.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBundle = (id: string) => {
    setBundles(bundles.filter(b => b.id !== id));
  };

  const toggleItemInBundle = (bundleId: string, itemId: string) => {
    setBundles(bundles.map(b => {
      if (b.id !== bundleId) return b;
      const hasItem = b.items.includes(itemId);
      return {
        ...b,
        items: hasItem ? b.items.filter(i => i !== itemId) : [...b.items, itemId]
      };
    }));
  };

  const saveBundle = async (bundle: typeof bundles[0]) => {
    try {
      const response = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            name: bundle.name,
            itemType: 'bundle',
            priceAmount: bundle.priceAmount,
            customFields: JSON.stringify({ originalPrice: bundle.originalPrice, items: bundle.items })
          }
        }),
      });
      if (!response.ok) throw new Error('Failed to save');
      toast.success('Bundle saved!');
    } catch (error) {
      toast.error('Failed to save bundle');
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)', padding: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/dashboard/catalog" style={{ display: 'flex', color: 'var(--foreground)', textDecoration: 'none' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Link Services</h1>
        </div>
        <button onClick={addBundle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
          <Plus size={18} /> Add Bundle
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Available Services</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map(item => (
              <div key={item.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)' }}>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>${item.priceAmount}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Bundles</h2>
          {bundles.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No bundles yet. Click "Add Bundle" to create one.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {bundles.map(bundle => (
                <div key={bundle.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)' }}>
                  <input 
                    value={bundle.name}
                    onChange={(e) => updateBundle(bundle.id, { name: e.target.value })}
                    placeholder="Bundle name"
                    style={{ width: '100%', padding: '0.5rem', marginBottom: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontWeight: 600 }}
                  />
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Services in bundle:</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {items.map(item => {
                        const inBundle = bundle.items.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleItemInBundle(bundle.id, item.id)}
                            style={{ padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: inBundle ? 'var(--primary)' : 'transparent', color: inBundle ? 'var(--primary-foreground)' : 'var(--foreground)', cursor: 'pointer', fontSize: '0.875rem' }}
                          >
                            {item.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.875rem' }}>Bundle Price</label>
                      <input type="number" value={bundle.priceAmount || ''} onChange={(e) => updateBundle(bundle.id, { priceAmount: parseFloat(e.target.value) || 0 })} style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.875rem' }}>Original Price</label>
                      <input type="number" value={bundle.originalPrice || ''} onChange={(e) => updateBundle(bundle.id, { originalPrice: parseFloat(e.target.value) || 0 })} style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button onClick={() => removeBundle(bundle.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--destructive)', cursor: 'pointer', fontSize: '0.875rem' }}>
                      <Trash2 size={14} /> Delete
                    </button>
                    <button onClick={() => saveBundle(bundle)} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.875rem' }}>
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}