import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../lib/auth/session';
import { canManageWorkflows } from '../../../lib/auth/authorization';
import { queryWorkflowsData } from '../../../lib/dashboard/queries';
import { resolveWorkflowWriteTenantId } from '../../../lib/workflows/scope';

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await queryWorkflowsData(session);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch workflows:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageWorkflows(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, description, channel = 'whatsapp' } = body;
    const writeTenantId = resolveWorkflowWriteTenantId(session);

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!writeTenantId) {
      return NextResponse.json({ error: 'No tenant scope available for workflow creation' }, { status: 409 });
    }

    const { WorkflowDefinitionModel } = await import('@noxivo/database');

    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const version = '1.0.0';

    // Check for existing workflow with same key
    const existing = await WorkflowDefinitionModel.findOne({
      agencyId: session.actor.agencyId,
      tenantId: writeTenantId,
      key,
      version
    });

    if (existing) {
      return NextResponse.json({ error: 'A workflow with this name already exists' }, { status: 409 });
    }

    const starterGraph = {
      nodes: [
        {
          id: 'trigger_1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: { triggerType: 'message_received' }
        }
      ],
      edges: []
    };

    const starterDag = {
      entryNodeId: 'trigger_1',
      topologicalOrder: ['trigger_1'],
      nodes: [
        {
          id: 'trigger_1',
          type: 'trigger',
          next: [],
          input: { triggerType: 'message_received' }
        }
      ],
      metadata: {
        compiledAt: new Date().toISOString(),
        version: '1.0.0',
        nodeCount: 1
      }
    };

    const workflow = await WorkflowDefinitionModel.create({
      agencyId: session.actor.agencyId,
      tenantId: writeTenantId,
      key,
      version,
      name,
      description: description || `Workflow for ${channel}`,
      channel,
      editorGraph: starterGraph,
      compiledDag: starterDag,
      isActive: false
    });

    return NextResponse.json({
      id: workflow._id.toString(),
      name: workflow.name,
      key: workflow.key,
      status: 'paused'
    });
  } catch (error) {
    console.error('Failed to create workflow:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
