import { DashboardShell } from '../../components/dashboard-shell';
import { requireCurrentSession } from '../../lib/auth/current-user';
import { workflowEngineServerFetch } from '../../lib/api/workflow-engine-server';
import type { DashboardShellData } from '../../lib/api/dashboard-aggregates';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireCurrentSession();
  const shellData = await workflowEngineServerFetch<DashboardShellData>('/api/v1/dashboard-data/shell');

  return (
    <DashboardShell
      user={shellData.user}
      agency={shellData.agency}
      allAgencies={shellData.allAgencies ?? []}
      clientTenants={shellData.clientTenants ?? []}
      activeClientTenant={shellData.activeClientTenant ?? null}
    >
      {children}
    </DashboardShell>
  );
}
