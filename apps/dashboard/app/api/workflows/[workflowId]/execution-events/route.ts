import { getCurrentSession } from '../../../../../lib/auth/session';
import { subscribeToWorkflowEvents } from '../../../../../lib/workflow-events';
import { Types } from 'mongoose';
import dbConnect from '../../../../../lib/mongodb';
import { buildWorkflowTenantFilter } from '../../../../../lib/workflows/scope';

export const dynamic = 'force-dynamic';

function encodeSseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { workflowId } = await params;
  if (!Types.ObjectId.isValid(workflowId)) {
    return new Response('Workflow not found', { status: 404 });
  }

  // Verify access to workflow
  try {
    await dbConnect();
    const { WorkflowDefinitionModel } = await import('@noxivo/database');
    const tenantFilter = buildWorkflowTenantFilter(session);
    const workflow = await WorkflowDefinitionModel.findOne({
      _id: workflowId,
      agencyId: session.actor.agencyId,
      ...tenantFilter
    }).lean();

    if (!workflow) {
      return new Response('Workflow not found', { status: 404 });
    }
  } catch (error) {
    console.error('Failed to verify workflow access:', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  let cleanup = async () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeSseEvent({ type: 'connected', workflowId }));

      // --- HYDRATION START ---
      try {
        await dbConnect();

        const { WorkflowRunModel, WorkflowExecutionEventModel } = await import('@noxivo/database');
        
        // Find most recent run started in the last 15 minutes
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const latestRun = await WorkflowRunModel.findOne({
          workflowDefinitionId: workflowId,
          startedAt: { $gte: fifteenMinutesAgo }
        }).sort({ startedAt: -1 }).lean();

        if (latestRun) {
          const events = await WorkflowExecutionEventModel.find({
            workflowRunId: latestRun.workflowRunId
          }).sort({ startedAt: 1 }).lean();

          for (const event of events) {
            // Map DB status to frontend expected status if necessary
            // In DB: 'running', 'completed', 'failed'
            // In Frontend: 'hit' (for running), 'completed', 'failed'
            const status = event.status === 'running' ? 'hit' : event.status;
            
            controller.enqueue(encodeSseEvent({
              workflowId,
              workflowRunId: event.workflowRunId,
              nodeId: event.nodeId,
              status,
              output: event.output,
              error: event.error,
              timestamp: event.startedAt
            }));
          }
        }
      } catch (error) {
        console.error('Failed to hydrate workflow events:', error);
      }
      // --- HYDRATION END ---

      const unsubscribe = await subscribeToWorkflowEvents(workflowId, (event) => {
        controller.enqueue(encodeSseEvent(event));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
      }, 15000);

      cleanup = async () => {
        clearInterval(keepAlive);
        await unsubscribe();
      };
    },
    async cancel() {
      await cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
