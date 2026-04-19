import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { canManageWorkflows } from '../../../../../lib/auth/authorization';
import dbConnect from '../../../../../lib/mongodb';
import { buildWorkflowTenantFilter } from '../../../../../lib/workflows/scope';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageWorkflows(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { workflowId } = await params;
  if (!Types.ObjectId.isValid(workflowId)) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  const tenantFilter = buildWorkflowTenantFilter(session);

  try {
    await dbConnect();
    const { WorkflowRunModel, WorkflowExecutionEventModel } = await import('@noxivo/database');

    // Get 5 most recent runs
    const runs = await WorkflowRunModel.find({
      workflowDefinitionId: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    })
    .sort({ startedAt: -1 })
    .limit(5)
    .lean()
    .exec();

    const runIds = runs.map(r => r.workflowRunId);

    // Get events for these runs
    const events = await WorkflowExecutionEventModel.find({
      workflowRunId: { $in: runIds },
      agencyId: session.actor.agencyId,
      ...tenantFilter
    })
    .sort({ startedAt: 1 })
    .lean()
    .exec();

    return NextResponse.json({ runs, events });
  } catch (error) {
    console.error('Failed to fetch workflow runs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
