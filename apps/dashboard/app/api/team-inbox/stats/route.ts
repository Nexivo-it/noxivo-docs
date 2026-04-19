import { NextResponse } from 'next/server';
import { AgencyModel, TenantModel, ConversationModel, MessageModel, UserModel, WorkflowRunModel, MessagingSessionBindingModel } from '@noxivo/database';
import dbConnect from '../../../../lib/mongodb';
import { getCurrentSession } from '../../../../lib/auth/session';

export async function GET(_request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();

  const [agencies, tenants, conversations, messages, users, activeWorkflows, sessions] = await Promise.all([
    AgencyModel.countDocuments().lean(),
    TenantModel.countDocuments().lean(),
    ConversationModel.countDocuments({ agencyId: session.actor.agencyId }).lean(),
    MessageModel.countDocuments({ agencyId: session.actor.agencyId }).lean(),
    UserModel.countDocuments({ agencyId: session.actor.agencyId }).lean(),
    WorkflowRunModel.countDocuments({ status: 'running', agencyId: session.actor.agencyId }).lean(),
    MessagingSessionBindingModel.countDocuments({ agencyId: session.actor.agencyId }).lean()
  ]);

  return NextResponse.json({
    agencies,
    tenants,
    conversations,
    messages,
    users,
    activeWorkflows,
    activeSessions: sessions,
    timestamp: new Date().toISOString()
  });
}