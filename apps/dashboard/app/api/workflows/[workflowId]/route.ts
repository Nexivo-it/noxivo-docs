import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageWorkflows } from '../../../../lib/auth/authorization';
import dbConnect from '../../../../lib/mongodb';
import { buildWorkflowTenantFilter } from '../../../../lib/workflows/scope';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { workflowId } = await params;
  if (!Types.ObjectId.isValid(workflowId)) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }
  const tenantFilter = buildWorkflowTenantFilter(session);

  try {
    await dbConnect();
    const { WorkflowDefinitionModel } = await import('@noxivo/database');
    const workflow = await WorkflowDefinitionModel.findOne({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error('Failed to fetch workflow:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
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
    const { WorkflowDefinitionModel } = await import('@noxivo/database');
    const workflow = await WorkflowDefinitionModel.findOneAndDelete({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workflow:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = await request.json();
    const { name, description, editorGraph, compiledDag } = body;

    const { WorkflowDefinitionModel } = await import('@noxivo/database');
    const workflow = await WorkflowDefinitionModel.findOne({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (name) workflow.name = name;
    if (description !== undefined) workflow.description = description;
    if (editorGraph) workflow.editorGraph = editorGraph;
    if (compiledDag) workflow.compiledDag = compiledDag;

    await workflow.save();

    return NextResponse.json({ success: true, workflow });
  } catch (error) {
    console.error('Failed to update workflow:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
