'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Eye, Upload, Link2, Settings, Sparkles, Plus, ArrowRight } from 'lucide-react';

const navItems = [
  { href: '/dashboard/catalog', label: 'Workspace', icon: LayoutGrid },
  { href: '/dashboard/catalog/preview', label: 'Live Preview', icon: Eye },
  { href: '/dashboard/catalog/import', label: 'Import', icon: Upload },
  { href: '/dashboard/catalog/linking', label: 'Bundles', icon: Link2 },
  { href: '/dashboard/catalog/settings', label: 'Settings', icon: Settings },
];

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 64px)' }}>
      <nav style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.25rem', 
        padding: '0.75rem 1.5rem', 
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-card)',
        overflowX: 'auto'
      }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard/catalog' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}