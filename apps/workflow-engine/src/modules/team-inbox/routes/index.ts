import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  AgencyModel,
  ContactProfileModel,
  ConversationModel,
  MessageModel,
  MessageDeliveryEventModel,
  MessagingSessionBindingModel,
  PluginInstallationModel,
  TenantModel,
  UserModel,
  WorkflowRunModel,
} from '@noxivo/database';
import type { InternalInboxSendAttachment } from '@noxivo/contracts';
import { InternalInboxMessageError, InternalInboxMessageService } from '../../inbox/internal-message.service.js';
import { getSessionFromRequest, type SessionRecord } from '../../agency/session-auth.js';
import { loadCrmConversationProfile, mutateCrmConversationProfile } from '../../crm/crm.route.js';

type TeamInboxContext = {
  session: SessionRecord;
  agencyId: string;
  tenantId: string;
};

const internalInboxMessageService = new InternalInboxMessageService();

type CrmTagLike = { label?: string | null };

function hasLeadTag(tags: CrmTagLike[] | undefined): boolean {
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some((tag) => typeof tag.label === 'string' && tag.label.trim().toLowerCase() === 'lead');
}

async function requireTeamInboxContext(request: FastifyRequest, reply: FastifyReply): Promise<TeamInboxContext | null> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }

  const tenantId = session.actor.tenantId || session.actor.tenantIds[0] || '';
  if (!tenantId) {
    await reply.status(409).send({ error: 'No tenant workspace available for this agency context' });
    return null;
  }

  return {
    session,
    agencyId: session.actor.agencyId,
    tenantId,
  };
}

function normalizeStatusFilter(status: unknown): 'all' | 'active' | 'archived' {
  if (typeof status !== 'string') {
    return 'active';
  }

  const normalized = status.trim().toLowerCase();
  if (normalized === 'archived') {
    return 'archived';
  }

  if (normalized === 'all') {
    return 'all';
  }

  return 'active';
}

function inferArchived(status: string, metadata: unknown): boolean {
  if (status === 'closed' || status === 'deleted') {
    return true;
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }

  const value = (metadata as Record<string, unknown>).isArchived;
  return value === true || value === 'true';
}

function normalizePositiveInt(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.trunc(raw));
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.trunc(parsed));
    }
  }

  return fallback;
}

type MessageCursorPayload = {
  ts: string;
  id: string;
};

function encodeMessageCursor(message: { _id: { toString(): string }; timestamp: Date }): string {
  const payload: MessageCursorPayload = {
    ts: message.timestamp.toISOString(),
    id: message._id.toString(),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeMessageCursor(rawCursor: string): MessageCursorPayload | null {
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<MessageCursorPayload>;

    if (typeof parsed.ts !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    if (Number.isNaN(new Date(parsed.ts).getTime())) {
      return null;
    }

    return { ts: parsed.ts, id: parsed.id };
  } catch {
    return null;
  }
}

export const teamInboxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const rawQuery = typeof request.query === 'object' && request.query ? request.query as Record<string, unknown> : {};
    const queryText = typeof rawQuery.query === 'string' ? rawQuery.query.trim() : '';
    const status = normalizeStatusFilter(rawQuery.status);

    const conversations = await ConversationModel.find({
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    })
      .sort({ lastMessageAt: -1, _id: -1 })
      .lean();

    const items = await Promise.all(conversations.map(async (conversation) => {
      const profile = await ContactProfileModel.findOne({
        tenantId: context.tenantId,
        contactId: conversation.contactId,
      }).lean();

      const isArchived = inferArchived(conversation.status, conversation.metadata);

      return {
        _id: conversation._id.toString(),
        contactId: conversation.contactId,
        contactName: conversation.contactName ?? null,
        contactPhone: conversation.contactPhone ?? null,
        unreadCount: conversation.unreadCount,
        status: conversation.status,
        assignedTo: conversation.assignedTo ? conversation.assignedTo.toString() : null,
        channel: 'whatsapp' as const,
        sourceName: null,
        sourceLabel: null,
        isArchived,
        lastMessageSource: null,
        lastMessage: conversation.lastMessageContent && conversation.lastMessageAt
          ? {
              content: conversation.lastMessageContent,
              createdAt: conversation.lastMessageAt.toISOString(),
            }
          : null,
        leadSaved: hasLeadTag(profile?.crmTags),
      };
    }));

    const filtered = items.filter((item) => {
      if (status === 'archived' && !item.isArchived) {
        return false;
      }

      if (status === 'active' && item.isArchived) {
        return false;
      }

      if (queryText.length > 0) {
        const haystack = `${item.contactName ?? ''} ${item.contactId}`.toLowerCase();
        if (!haystack.includes(queryText.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    return reply.status(200).send(filtered);
  });

  fastify.get('/events', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('cache-control', 'no-cache, no-transform');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', tenantId: context.tenantId })}\n\n`);
    reply.raw.end();
    return reply;
  });

  fastify.get('/stats', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const [agencies, tenants, conversations, messages, users, activeWorkflows, activeSessions] = await Promise.all([
      AgencyModel.countDocuments({}),
      TenantModel.countDocuments({}),
      ConversationModel.countDocuments({ agencyId: context.agencyId }),
      MessageModel.countDocuments({ agencyId: context.agencyId }),
      UserModel.countDocuments({ agencyId: context.agencyId }),
      WorkflowRunModel.countDocuments({ agencyId: context.agencyId, status: 'running' }),
      MessagingSessionBindingModel.countDocuments({ agencyId: context.agencyId }),
    ]);

    return reply.status(200).send({
      agencies,
      tenants,
      conversations,
      messages,
      users,
      activeWorkflows,
      activeSessions,
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/plugins', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const rawQuery = typeof request.query === 'object' && request.query ? request.query as Record<string, unknown> : {};
    const pluginId = typeof rawQuery.pluginId === 'string' && rawQuery.pluginId.trim().length > 0
      ? rawQuery.pluginId.trim()
      : null;

    const query: Record<string, unknown> = {
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    };
    if (pluginId) {
      query.pluginId = pluginId;
    }

    const installations = await PluginInstallationModel.find(query).lean();
    return reply.status(200).send(
      installations.map((installation) => ({
        pluginId: installation.pluginId,
        pluginVersion: installation.pluginVersion,
        enabled: installation.enabled,
        config: installation.config,
        createdAt: installation.createdAt?.toISOString(),
        updatedAt: installation.updatedAt?.toISOString(),
      })),
    );
  });

  fastify.post('/plugins', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const payload = request.body as {
      pluginId?: string;
      pluginVersion?: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    };

    if (
      typeof payload?.pluginId !== 'string'
      || payload.pluginId.trim().length === 0
      || typeof payload.pluginVersion !== 'string'
      || payload.pluginVersion.trim().length === 0
      || typeof payload.enabled !== 'boolean'
    ) {
      return reply.status(400).send({ error: 'Invalid plugin configuration' });
    }

    const installation = await PluginInstallationModel.findOneAndUpdate(
      {
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        pluginId: payload.pluginId.trim(),
      },
      {
        $set: {
          pluginVersion: payload.pluginVersion.trim(),
          enabled: payload.enabled,
          ...(payload.config ? { config: payload.config } : {}),
        },
      },
      { upsert: true, new: true },
    ).lean();

    return reply.status(200).send({
      pluginId: installation.pluginId,
      pluginVersion: installation.pluginVersion,
      enabled: installation.enabled,
      config: installation.config,
    });
  });

  fastify.get('/billing', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const agency = await AgencyModel.findById(context.agencyId).lean();
    if (!agency) {
      return reply.status(404).send({ error: 'Agency not found' });
    }

    const plan = agency.plan ?? 'reseller_basic';
    const status = agency.status ?? 'trial';
    return reply.status(200).send({
      agencyId: agency._id.toString(),
      agencyName: agency.name,
      plan,
      status,
      stripeCustomerId: agency.billingStripeCustomerId ?? null,
      subscriptionId: agency.billingStripeSubscriptionId ?? null,
      features: {
        crmIntegration: ['reseller_pro', 'enterprise'].includes(plan),
        advancedWorkflows: plan === 'enterprise',
        customBranding: ['reseller_pro', 'enterprise'].includes(plan),
        prioritySupport: plan === 'enterprise',
      },
    });
  });

  fastify.get('/leads', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const profiles = await ContactProfileModel.find({
      tenantId: context.tenantId,
      crmTags: {
        $elemMatch: { label: 'lead' },
      },
    }).lean();

    const leads = await Promise.all(profiles.map(async (profile) => {
      const conversation = await ConversationModel.findOne({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        contactId: profile.contactId,
      }).lean();

      return {
        conversationId: conversation?._id?.toString() ?? '',
        contactId: profile.contactId,
        contactName: profile.contactName ?? null,
      };
    }));

    return reply.status(200).send(leads.filter((lead) => lead.conversationId.length > 0));
  });

  fastify.post('/:conversationId/assign', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const payload = request.body as { assignedTo?: string | null };

    const conversation = await ConversationModel.findOneAndUpdate(
      {
        _id: params.conversationId,
        agencyId: context.agencyId,
        tenantId: context.tenantId,
      },
      {
        $set: {
          assignedTo: payload?.assignedTo ?? null,
        },
      },
      { new: true },
    ).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    return reply.status(200).send({ success: true, assignedTo: conversation.assignedTo?.toString?.() ?? null });
  });

  fastify.post('/:conversationId/read', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const conversation = await ConversationModel.findOneAndUpdate(
      {
        _id: params.conversationId,
        agencyId: context.agencyId,
        tenantId: context.tenantId,
      },
      {
        $set: { unreadCount: 0 },
      },
      { new: true },
    ).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    return reply.status(200).send({ success: true, unreadCount: 0 });
  });

  fastify.post('/:conversationId/actions', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const payload = request.body as { action?: string };
    const action = (payload?.action ?? '').trim().toLowerCase();

    if (action !== 'archive' && action !== 'unarchive') {
      return reply.status(400).send({ error: 'Unsupported action' });
    }

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const metadata = conversation.metadata && typeof conversation.metadata === 'object' && !Array.isArray(conversation.metadata)
      ? { ...(conversation.metadata as Record<string, unknown>) }
      : {};
    metadata.isArchived = action === 'archive';

    await ConversationModel.updateOne(
      { _id: conversation._id },
      {
        $set: { metadata },
      },
    ).exec();

    return reply.status(200).send({ success: true, isArchived: action === 'archive' });
  });

  fastify.post('/:conversationId/unhandoff', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    if (conversation.status !== 'handoff' && conversation.status !== 'assigned') {
      return reply.status(400).send({ error: 'Conversation is not in handoff state' });
    }

    const updated = await ConversationModel.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          assignedTo: null,
          status: 'open',
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    return reply.status(200).send({
      conversationId: updated._id.toString(),
      status: updated.status,
    });
  });

  fastify.post('/:conversationId/suggest-reply', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const payload = request.body as { mode?: 'assist' | 'auto' };
    const mode = payload?.mode === 'auto' ? 'auto' : 'assist';

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const latestInbound = await MessageModel.findOne({
      conversationId: conversation._id,
      role: 'user',
    }).sort({ timestamp: -1, _id: -1 }).lean();

    const basis = latestInbound?.content?.trim() || conversation.lastMessageContent?.trim() || 'your message';
    const replyText = mode === 'auto'
      ? `Thanks for reaching out. We received: "${basis}". Our team is taking this forward now.`
      : `Thanks for your message: "${basis}". I can help you with that right away.`;

    return reply.status(200).send({
      mode,
      reply: replyText,
    });
  });

  fastify.get('/:conversationId/lead', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const profile = await ContactProfileModel.findOne({
      tenantId: context.tenantId,
      contactId: conversation.contactId,
    }).lean();

    return reply.status(200).send({
      leadSaved: hasLeadTag(profile?.crmTags),
      note: Array.isArray(profile?.crmNotes) && profile.crmNotes.length > 0
        ? profile.crmNotes[profile.crmNotes.length - 1]?.body ?? null
        : null,
    });
  });

  fastify.post('/:conversationId/lead', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const payload = request.body as { note?: string };

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const existing = await ContactProfileModel.findOne({
      tenantId: context.tenantId,
      contactId: conversation.contactId,
    }).lean();

    const currentTags = Array.isArray(existing?.crmTags) ? existing.crmTags : [];
    const leadTagExists = hasLeadTag(currentTags);
    const crmTags = leadTagExists
      ? currentTags
      : [...currentTags, { label: 'lead', id: null }];
    const crmNotes = Array.isArray(existing?.crmNotes) ? existing.crmNotes : [];
    const nextNote = typeof payload?.note === 'string' && payload.note.trim().length > 0
      ? {
          id: randomUUID(),
          body: payload.note.trim(),
          authorUserId: context.session.actor.userId,
          createdAt: new Date(),
          externalRecordId: null,
        }
      : null;

    await ContactProfileModel.updateOne(
      {
        tenantId: context.tenantId,
        contactId: conversation.contactId,
      },
      {
        $set: {
          agencyId: context.agencyId,
          contactName: conversation.contactName,
          crmTags,
          crmNotes: nextNote ? [...crmNotes, nextNote] : crmNotes,
        },
      },
      { upsert: true },
    ).exec();

    return reply.status(200).send({ success: true, leadSaved: true });
  });

  fastify.delete('/:conversationId/lead', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const profile = await ContactProfileModel.findOne({
      tenantId: context.tenantId,
      contactId: conversation.contactId,
    }).lean();

    if (!profile) {
      return reply.status(200).send({ success: true, leadSaved: false });
    }

    const crmTags = (profile.crmTags ?? []).filter((tag) => tag.label.trim().toLowerCase() !== 'lead');
    await ContactProfileModel.updateOne({ _id: profile._id }, { $set: { crmTags } }).exec();

    return reply.status(200).send({ success: true, leadSaved: false });
  });

  fastify.get('/:conversationId/messages', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const rawQuery = typeof request.query === 'object' && request.query ? request.query as Record<string, unknown> : {};
    const limit = Math.min(100, normalizePositiveInt(rawQuery.limit, 20));
    const cursor = typeof rawQuery.cursor === 'string' ? decodeMessageCursor(rawQuery.cursor) : null;

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const cursorFilter = cursor
      ? {
          $or: [
            { timestamp: { $lt: new Date(cursor.ts) } },
            { timestamp: new Date(cursor.ts), _id: { $lt: cursor.id } },
          ],
        }
      : {};

    const page = await MessageModel.find({
      conversationId: conversation._id,
      ...cursorFilter,
    })
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const messages = slice
      .slice()
      .reverse()
      .map((message) => ({
        _id: message._id.toString(),
        role: message.role,
        content: message.content,
        deliveryStatus: message.deliveryStatus ?? 'queued',
        providerAck: message.providerAck ?? null,
        providerAckName: message.providerAckName ?? null,
        providerMessageId: message.providerMessageId ?? null,
        replyToMessageId: message.replyToMessageId ?? null,
        metadata: message.metadata ?? {},
        messageSource: typeof message.metadata?.source === 'string' ? message.metadata.source : null,
        error: message.error ?? null,
        attachments: message.attachments ?? [],
        createdAt: message.timestamp.toISOString(),
      }));

    const nextCursor = hasMore && slice.length > 0 ? encodeMessageCursor(slice[slice.length - 1]!) : null;

    return reply.status(200).send({
      messages,
      hasMore,
      nextCursor,
    });
  });

  fastify.post('/:conversationId/messages', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const payload = request.body as {
      content?: string;
      attachments?: InternalInboxSendAttachment[];
      replyToMessageId?: string;
    };

    try {
      const result = await internalInboxMessageService.sendOperatorMessage({
        conversationId: params.conversationId,
        idempotencyKey: randomUUID(),
        payload: {
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          operatorUserId: context.session.actor.userId,
          content: typeof payload.content === 'string' ? payload.content : '',
          attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
          ...(typeof payload.replyToMessageId === 'string' && payload.replyToMessageId.trim().length > 0
            ? { replyToMessageId: payload.replyToMessageId.trim() }
            : {}),
        },
      });

      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof InternalInboxMessageError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  fastify.post('/:conversationId/messages/:messageId', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string; messageId: string };

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const message = await MessageModel.findOne({
      _id: params.messageId,
      conversationId: conversation._id,
    }).lean();

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    try {
      const result = await internalInboxMessageService.sendOperatorMessage({
        conversationId: params.conversationId,
        idempotencyKey: `${params.messageId}-resend-${randomUUID()}`,
        payload: {
          agencyId: context.agencyId,
          tenantId: context.tenantId,
          operatorUserId: context.session.actor.userId,
          content: message.content,
          attachments: Array.isArray(message.attachments) ? message.attachments : [],
          ...(typeof message.replyToMessageId === 'string' && message.replyToMessageId.trim().length > 0
            ? { replyToMessageId: message.replyToMessageId }
            : {}),
        },
      });

      return reply.status(200).send({
        messageId: message._id.toString(),
        resentAt: new Date().toISOString(),
        ...result,
      });
    } catch (error) {
      if (error instanceof InternalInboxMessageError) {
        return reply.status(error.statusCode).send({ error: 'Failed to resend message' });
      }

      request.log.error(error);
      return reply.status(502).send({ error: 'Failed to resend message' });
    }
  });

  fastify.get('/:conversationId/delivery-history', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const messageIds = await MessageModel.find({ conversationId: conversation._id }, { _id: 1 })
      .lean()
      .then((messages) => messages.map((message) => message._id.toString()));

    if (messageIds.length === 0) {
      return reply.status(200).send([]);
    }

    const events = await MessageDeliveryEventModel.find(
      { messageId: { $in: messageIds } },
      {},
      { sort: { occurredAt: -1 }, limit: 100 },
    ).lean();

    return reply.status(200).send(events.map((event) => ({
      messageId: event.messageId,
      deliveryStatus: event.deliveryStatus,
      providerAckName: event.providerAckName,
      providerAck: event.providerAck,
      source: event.source,
      error: event.error,
      occurredAt: event.occurredAt?.toISOString(),
    })));
  });

  fastify.get('/:conversationId/crm', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };

    try {
      const profile = await loadCrmConversationProfile({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        conversationId: params.conversationId,
      });
      return reply.status(200).send(profile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid CRM request' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to load CRM profile' });
    }
  });

  fastify.patch('/:conversationId/crm', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string };
    const rawPayload = request.body as Record<string, unknown> | null;

    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return reply.status(400).send({ error: 'Invalid CRM request' });
    }

    const mutation = rawPayload.action === 'add_note'
      ? {
          ...rawPayload,
          note: {
            ...((rawPayload.note && typeof rawPayload.note === 'object' && !Array.isArray(rawPayload.note))
              ? rawPayload.note as Record<string, unknown>
              : {}),
            authorUserId: context.session.actor.userId,
          },
        }
      : rawPayload;

    try {
      const profile = await mutateCrmConversationProfile({
        agencyId: context.agencyId,
        tenantId: context.tenantId,
        conversationId: params.conversationId,
        mutation,
      });

      return reply.status(200).send(profile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid CRM request' });
      }

      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to update CRM profile' });
    }
  });

  fastify.post('/:conversationId/messages/:messageId/actions', async (request, reply) => {
    const context = await requireTeamInboxContext(request, reply);
    if (!context) {
      return;
    }

    const params = request.params as { conversationId: string; messageId: string };
    const payload = request.body as { action?: string };
    const action = (payload.action ?? '').trim().toLowerCase();

    const conversation = await ConversationModel.findOne({
      _id: params.conversationId,
      agencyId: context.agencyId,
      tenantId: context.tenantId,
    }).lean();

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const message = await MessageModel.findOne({
      _id: params.messageId,
      conversationId: conversation._id,
    }).lean();

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    if (action === 'delete') {
      await MessageModel.updateOne(
        { _id: message._id },
        {
          $set: {
            deliveryStatus: 'revoked',
            error: null,
          },
        },
      ).exec();

      return reply.status(200).send({ success: true, status: 'revoked' });
    }

    if (action === 'star' || action === 'unstar') {
      const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
        ? { ...(message.metadata as Record<string, unknown>) }
        : {};
      metadata.starred = action === 'star';

      await MessageModel.updateOne({ _id: message._id }, { $set: { metadata } }).exec();
      return reply.status(200).send({ success: true, starred: action === 'star' });
    }

    return reply.status(400).send({ error: 'Unsupported message action' });
  });
};
