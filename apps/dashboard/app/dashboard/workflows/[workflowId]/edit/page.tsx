import { redirect } from 'next/navigation';
import { requireCurrentSession } from '../../../../../lib/auth/current-user';
import { canManageWorkflows } from '../../../../../lib/auth/authorization';
import dbConnect from '../../../../../lib/mongodb';
import { WorkflowDefinitionModel } from '@noxivo/database';
import { WorkflowEditClient } from './edit-client';
import { buildWorkflowTenantFilter } from '../../../../../lib/workflows/scope';
import { Types } from 'mongoose';

export const dynamic = 'force-dynamic';

export default async function WorkflowEditPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const session = await requireCurrentSession();
  if (!canManageWorkflows(session)) {
    redirect('/dashboard');
  }

  const { workflowId: id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    redirect('/dashboard/workflows?status=invalid-workflow');
  }
  await dbConnect();
  const tenantFilter = buildWorkflowTenantFilter(session);

  const workflow = await WorkflowDefinitionModel.findOne({
    _id: id,
    agencyId: session.actor.agencyId,
    ...tenantFilter
  }).lean();

  if (!workflow) {
    redirect('/dashboard/workflows?status=workflow-not-found');
  }

  return (
    <div className="h-full flex flex-col">
      <WorkflowEditClient
        workflowId={id}
        initialNodes={workflow.editorGraph?.nodes || []}
        initialEdges={workflow.editorGraph?.edges || []}
        workflowName={workflow.name}
      />
    </div>
  );
}
