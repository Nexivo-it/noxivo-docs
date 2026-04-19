import { NextResponse } from 'next/server';
import { getAgencyAdministrationDetail } from '../../../../../../lib/dashboard/agency-admin';
import { getCurrentSession } from '../../../../../../lib/auth/session';

function toErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected tenants error';

  if (message === 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message === 'Agency not found') {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ agencyId: string; tenantId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agencyId, tenantId } = await context.params;
    const detail = await getAgencyAdministrationDetail(session, agencyId);
    
    // Find the specific tenant in the agency's tenant list
    const tenant = detail.tenants.find((t) => t.id === tenantId);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    return NextResponse.json(tenant);
  } catch (error) {
    return toErrorResponse(error);
  }
}
