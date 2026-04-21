import { MessagingSessionBindingModel, WorkflowDefinitionModel } from '@noxivo/database';
import type { SessionRecord } from '../agency/session-auth.js';
import { resolveWorkflowWriteTenantId } from './scope.js';
import { getTemplateById, type WorkflowTemplate } from './templates-library.js';

export interface CloneTemplateOptions {
  templateId: string;
  session: SessionRecord;
  customName?: string;
}

export interface CloneTemplateResult {
  success: boolean;
  workflowId?: string;
  workflowName?: string;
  error?: string;
}

function buildWorkflowKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function findWhatsAppSessionName(session: SessionRecord): Promise<string | null> {
  const tenantId = resolveWorkflowWriteTenantId(session);
  if (!tenantId) {
    return null;
  }

  const binding = await MessagingSessionBindingModel.findOne({
    agencyId: session.actor.agencyId,
    tenantId,
    status: 'active',
  }).sort({ updatedAt: -1 }).lean();

  return binding?.messagingSessionName ?? null;
}

async function mapTriggerToSession(
  graph: WorkflowTemplate['editorGraph'],
  session: SessionRecord,
): Promise<WorkflowTemplate['editorGraph']> {
  const sessionName = await findWhatsAppSessionName(session);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.type !== 'trigger') {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          sessionId: sessionName ?? undefined,
        },
      };
    }),
  };
}

function mapCompiledDagToSession(dag: WorkflowTemplate['compiledDag']): WorkflowTemplate['compiledDag'] {
  return dag;
}

export async function cloneTemplateFromTemplate(options: CloneTemplateOptions): Promise<CloneTemplateResult> {
  const { templateId, session, customName } = options;

  const template = getTemplateById(templateId);
  if (!template) {
    return { success: false, error: 'Template not found' };
  }

  const writeTenantId = resolveWorkflowWriteTenantId(session);
  if (!writeTenantId) {
    return { success: false, error: 'No tenant scope available for workflow creation' };
  }

  const key = buildWorkflowKey(customName || template.name);
  const version = '1.0.0';

  const existing = await WorkflowDefinitionModel.findOne({
    agencyId: session.actor.agencyId,
    tenantId: writeTenantId,
    key,
    version,
  });

  if (existing) {
    return { success: false, error: 'A workflow with this name already exists' };
  }

  const editorGraphWithSession = await mapTriggerToSession(template.editorGraph, session);
  const compiledDagWithSession = mapCompiledDagToSession(template.compiledDag);

  const workflow = await WorkflowDefinitionModel.create({
    agencyId: session.actor.agencyId,
    tenantId: writeTenantId,
    key,
    version,
    name: customName || template.name,
    description: template.description,
    channel: 'whatsapp',
    editorGraph: editorGraphWithSession,
    compiledDag: compiledDagWithSession,
    isActive: false,
    isTemplate: false,
  });

  return {
    success: true,
    workflowId: workflow._id.toString(),
    workflowName: workflow.name,
  };
}
