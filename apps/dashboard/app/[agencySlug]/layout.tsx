import type { ReactNode } from 'react';

export default function AgencyLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-layout="agency-shell"
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]"
    >
      <main className="mx-auto w-full max-w-7xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}
