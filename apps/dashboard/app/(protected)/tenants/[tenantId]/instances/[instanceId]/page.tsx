import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../../../../lib/auth/current-user';

export const dynamic = 'force-dynamic';

interface TenantInstancePageProps {
  params: Promise<{
    tenantId: string;
    instanceId: string;
  }>;
}

export default async function TenantInstancePage({ params }: TenantInstancePageProps) {
  const session = await requireCurrentSession();
  const { tenantId, instanceId } = await params;

  if (tenantId !== session.actor.tenantId) {
    redirect('/dashboard');
  }

  if (!instanceId) {
    return (
      <section
        data-state="empty"
        className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6"
      >
        <h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
          No instance selected
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--text-muted)]">
          Select an instance to open MessagingProvider dashboard and health details.
        </p>
      </section>
    );
  }

  return (
    <section
      data-state="default"
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6"
    >
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
            Tenant Instance
          </h1>
          <p className="mt-2 text-base leading-relaxed text-[var(--text-muted)]">
            Tenant <strong>{tenantId}</strong> · Instance <strong>{instanceId}</strong>
          </p>
        </div>
        <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border-default)] px-3 text-sm font-medium text-[var(--text-primary)]">
          Ready
        </span>
      </header>

      <div
        data-state="loading"
        className="mt-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-muted)]"
      >
        Loading live instance telemetry…
      </div>
    </section>
  );
}
