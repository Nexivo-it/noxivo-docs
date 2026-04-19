import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../lib/auth/session';
import { canManageWorkflows } from '../../../../lib/auth/authorization';
import { cloneTemplateFromTemplate } from '../../../../lib/workflows/workflow-cloner';

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
    const { templateId, customName } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const result = await cloneTemplateFromTemplate({
      templateId,
      session,
      customName
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        workflowId: result.workflowId,
        workflowName: result.workflowName
      });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to clone template:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
