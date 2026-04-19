'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Search, Clock, DollarSign, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CatalogItem } from '@/lib/catalog/types';

export default function CatalogPreview() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchItems() {
      try {
        const response = await fetch('/api/catalog');
        const data = await response.json();
        if (data.items) {
          setItems(data.items);
        }
      } catch (error) {
        console.error('Failed to fetch items:', error);
        toast.error('Failed to load catalog');
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.shortDescription?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/dashboard/catalog" style={{ display: 'flex', alignItems: 'center', color: 'var(--foreground)', textDecoration: 'none' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Service Catalog Preview</h1>
        </div>
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
      </header>

      <main style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
        {filteredItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem', color: 'var(--muted)' }}>
            <ExternalLink size={48} />
            <p>No services available yet.</p>
            <Link href="/dashboard/catalog" style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 'var(--radius-md)', textDecoration: 'none' }}>
              Add Services
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {filteredItems.map((item) => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface-card)' }}>
                <div style={{ width: '100%', height: 180, background: 'var(--surface-section)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.mediaPath ? (
                    <img src={item.mediaPath} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <ExternalLink size={32} style={{ color: 'var(--muted)' }} />
                  )}
                </div>
                <div style={{ padding: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.name}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                    {item.shortDescription || 'No description'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--foreground)', fontWeight: 500 }}>
                      <DollarSign size={16} />
                      {item.isVariablePrice ? 'From ' : ''}{formatPrice(item.priceAmount || 0, item.priceCurrency)}
                    </div>
                    {item.durationMinutes && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                        <Clock size={14} />
                        {item.durationMinutes} min
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}