import { getTemplateById, type WorkflowTemplate } from './templates-library';
import { WorkflowDefinitionModel } from '@noxivo/database';
import { engineClient } from '../api/engine-client';
import dbConnect from '../mongodb';
import type { SessionRecord } from '../auth/session';

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

export async function cloneTemplateFromTemplate(
  options: CloneTemplateOptions
): Promise<CloneTemplateResult> {
  const { templateId, session, customName } = options;

  const template = getTemplateById(templateId);
  if (!template) {
    return { success: false, error: 'Template not found' };
  }

  const writeTenantId = session.actor.tenantId?.trim();
  if (!writeTenantId) {
    return { success: false, error: 'No tenant scope available for workflow creation' };
  }

  await dbConnect();

  const key = (customName || template.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const version = '1.0.0';

  const existing = await WorkflowDefinitionModel.findOne({
    agencyId: session.actor.agencyId,
    tenantId: writeTenantId,
    key,
    version
  });

  if (existing) {
    return { success: false, error: 'A workflow with this name already exists' };
  }

  const editorGraphWithSession = await mapTriggerToSession(template.editorGraph, session);
  const compiledDagWithSession = mapCompiledDagToSession(template.compiledDag, session);

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
    isTemplate: false
  });

  return {
    success: true,
    workflowId: workflow._id.toString(),
    workflowName: workflow.name
  };
}

async function mapTriggerToSession(
  graph: WorkflowTemplate['editorGraph'],
  session: SessionRecord
): Promise<WorkflowTemplate['editorGraph']> {
  const sessionId = await findWhatsAppSession(session);

  const updatedNodes = graph.nodes.map(node => {
    if (node.type === 'trigger') {
      return {
        ...node,
        data: {
          ...node.data,
          sessionId: sessionId || undefined
        }
      };
    }
    return node;
  });

  return {
    ...graph,
    nodes: updatedNodes
  };
}

function mapCompiledDagToSession(
  dag: WorkflowTemplate['compiledDag'],
  session: SessionRecord
): WorkflowTemplate['compiledDag'] {
  return dag;
}

async function findWhatsAppSession(
  session: SessionRecord
): Promise<string | null> {
  try {
    const result = await engineClient.getSessionByTenant(
      session.actor.agencyId,
      session.actor.tenantId
    );
    return result.id || null;
  } catch {
    return null;
  }
}
