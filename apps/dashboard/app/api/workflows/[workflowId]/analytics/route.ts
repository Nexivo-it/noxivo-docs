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
    const { WorkflowExecutionEventModel } = await import('@noxivo/database');

    const analytics = await WorkflowExecutionEventModel.aggregate([
      {
        $match: {
          workflowDefinitionId: workflowId,
          agencyId: session.actor.agencyId,
          ...tenantFilter
        }
      },
      {
        $group: {
          _id: '$nodeId',
          executionCount: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failureCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          avgDurationMs: {
            $avg: {
              $cond: [
                { $and: ['$startedAt', '$finishedAt'] },
                { $subtract: ['$finishedAt', '$startedAt'] },
                null
              ]
            }
          }
        }
      },
      {
        $project: {
          nodeId: '$_id',
          _id: 0,
          executionCount: 1,
          successCount: 1,
          failureCount: 1,
          avgDurationMs: 1
        }
      }
    ]);

    // Format as a map for easier lookup in frontend
    const analyticsMap = analytics.reduce((acc: any, item: any) => {
      acc[item.nodeId] = item;
      return acc;
    }, {});

    return NextResponse.json({ analytics: analyticsMap });
  } catch (error) {
    console.error('Failed to fetch workflow analytics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
