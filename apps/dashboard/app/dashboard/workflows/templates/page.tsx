import { requireCurrentSession } from '../../../../lib/auth/current-user';
import { canManageWorkflows } from '../../../../lib/auth/authorization';
import { TemplatesClient } from './templates-client';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const session = await requireCurrentSession();
  const canManage = canManageWorkflows(session);

  return (
    <TemplatesClient canManage={canManage} />
  );
}
