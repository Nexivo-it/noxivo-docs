import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { canManageWorkflows } from '../../../../../lib/auth/authorization';
import { WorkflowDefinitionModel } from '@noxivo/database';
import dbConnect from '../../../../../lib/mongodb';
import { buildWorkflowTenantFilter } from '../../../../../lib/workflows/scope';

export async function POST(
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
    const workflow = await WorkflowDefinitionModel.findOne({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    workflow.isActive = !workflow.isActive;
    await workflow.save();

    return NextResponse.json({
      success: true,
      isActive: workflow.isActive
    });
  } catch (error) {
    console.error('Failed to toggle workflow:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
