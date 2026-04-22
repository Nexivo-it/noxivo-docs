import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Types } from 'mongoose';
import { requireCurrentSession } from '../../../../../lib/auth/current-user';
import { canManageWorkflows } from '../../../../../lib/auth/authorization';
import { buildWorkflowEngineUrl } from '../../../../../lib/api/workflow-engine-client';
import { AUTH_SESSION_COOKIE_NAME } from '../../../../../lib/auth/session';
import { WorkflowEditClient } from './edit-client';

type WorkflowEditPageResponse = {
  workflow?: {
    name: string;
    editorGraph?: {
      nodes?: unknown[];
      edges?: unknown[];
    };
  };
};

function toCookieHeaderValue(cookieStore: Awaited<ReturnType<typeof cookies>>): string {
  return cookieStore.getAll().map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; ');
}

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

  const cookieStore = await cookies();
  if (!cookieStore.has(AUTH_SESSION_COOKIE_NAME)) {
    redirect('/auth/login');
  }

  const response = await fetch(buildWorkflowEngineUrl(`/api/v1/workflows/${id}`), {
    method: 'GET',
    headers: {
      cookie: toCookieHeaderValue(cookieStore),
      accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (response.status === 401 || response.status === 403) {
    redirect('/dashboard');
  }

  if (response.status === 404) {
    redirect('/dashboard/workflows?status=workflow-not-found');
  }

  if (!response.ok) {
    throw new Error(`Workflow engine returned ${response.status} for workflow detail`);
  }

  const payload = await response.json() as WorkflowEditPageResponse;
  const workflow = payload.workflow;

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
