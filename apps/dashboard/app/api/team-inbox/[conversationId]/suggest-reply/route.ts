import { NextResponse } from 'next/server';
import { getCurrentSession } from '../../../../../lib/auth/session';
import { suggestInboxReply } from '../../../../../lib/ai/inbox-assistant';
import dbConnect from '../../../../../lib/mongodb';
import { resolveActorTenantCandidates, resolveActorTenantId } from '../../../../../lib/auth/tenant-context';

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedTenantId = resolveActorTenantId(session.actor);
  if (!requestedTenantId) {
    return NextResponse.json(
      { error: 'No tenant workspace available for this agency context' },
      { status: 409 }
    );
  }

  try {
    await dbConnect();
    const resolvedTenantCandidates = await resolveActorTenantCandidates(session.actor);
    const tenantId = resolvedTenantCandidates[0] ?? requestedTenantId;
    const { conversationId } = await context.params;
    const payload = await request.json().catch(() => ({})) as { mode?: 'assist' | 'auto' };
    const scopedSession = {
      ...session,
      actor: {
        ...session.actor,
        tenantId
      }
    };
    const result = await suggestInboxReply({
      session: scopedSession,
      conversationId,
      mode: payload.mode === 'auto' ? 'auto' : 'assist'
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate AI reply';
    const status = /not allowed|forbidden|denied/i.test(message) ? 403 : /not found|not exist/i.test(message) ? 404 : 500;
    const safeMessage = status === 403 ? 'AI assistance not allowed for this conversation'
      : status === 404 ? 'Conversation not found'
      : 'Failed to generate reply';
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
