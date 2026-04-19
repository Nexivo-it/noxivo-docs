import { DashboardShell } from '../../components/dashboard-shell';
import { requireCurrentSession } from '../../lib/auth/current-user';
import { queryDashboardShellData } from '../../lib/dashboard/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCurrentSession();
  const shellData = await queryDashboardShellData(session);

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
