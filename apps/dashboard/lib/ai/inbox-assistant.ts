import {
  AgencyModel,
  ConversationModel,
  projectContactProfileFromMessage,
  MessageModel,
  TenantModel,
  WorkflowDefinitionModel,
  type Message
} from '@noxivo/database';
import { EntitlementService, LlmContextService } from './workflow-engine-stubs';
import type { SessionRecord } from '../auth/session';
import dbConnect from '../mongodb';
import { broadcastInboxEvent } from '../inbox-events';
import { generateInboxReply } from './provider-client';

export async function suggestInboxReply(input: {
  session: SessionRecord;
  conversationId: string;
  mode: 'assist' | 'auto';
}): Promise<{
  suggestedReply: string;
  suggestions?: string[];
  systemPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}> {
  await dbConnect();

  const agency = await AgencyModel.findById(input.session.actor.agencyId).lean();

  if (!agency) {
    throw new Error('Agency not found');
  }

  const entitlementService = new EntitlementService({
    agencyRepo: {
      findById: async (...args: unknown[]) => {
        const agencyId = typeof args[0] === 'string' ? args[0] : '';
        const resolvedAgency = await AgencyModel.findById(agencyId).lean();

        if (!resolvedAgency) {
          return null;
        }

        return {
          id: resolvedAgency._id.toString(),
          plan: resolvedAgency.plan,
          status: resolvedAgency.status
        };
      }
    }
  });

  const entitlement = await entitlementService.checkEntitlement({
    agencyId: input.session.actor.agencyId,
    feature: 'ai_action'
  });

  if (!entitlement.allowed) {
    throw new Error(entitlement.reason ?? 'AI inbox actions are not allowed');
  }

  const conversation = await ConversationModel.findOne({
    _id: input.conversationId,
    agencyId: input.session.actor.agencyId,
    tenantId: input.session.actor.tenantId
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const activeWorkflow = await WorkflowDefinitionModel.findOne({
    agencyId: input.session.actor.agencyId,
    tenantId: input.session.actor.tenantId,
    isActive: true
  }).lean();

  const llmContextService = new LlmContextService({
    conversationRepo: {
      findRecentMessages: async (conversationId: string, limit: number) => {
        const messages = await MessageModel.find({ conversationId })
          .sort({ timestamp: -1 })
          .limit(limit)
          .lean();

        return messages.reverse().map((message: Message & { _id: { toString(): string } }) => ({
          id: message._id.toString(),
          direction: message.role === 'user' ? 'inbound' : 'outbound',
          content: message.content,
          timestamp: message.timestamp
        }));
      }
    },
    tenantRepo: {
      findById: async (tenantId: string) => {
        const tenant = await TenantModel.findById(tenantId).lean();

        if (!tenant) {
          return null;
        }

        return {
          id: tenant._id.toString(),
          businessName: tenant.name,
          businessDescription: `${tenant.name} operates in ${tenant.region}`
        };
      }
    },
    workflowDefinitionRepo: {
      findById: async (workflowId: string) => {
        if (!workflowId || workflowId === 'inbox-assistant') {
          return null;
        }

        const workflow = await WorkflowDefinitionModel.findById(workflowId).lean();

        if (!workflow) {
          return null;
        }

        return {
          id: workflow._id.toString(),
          name: workflow.key,
          state: {
            currentStage: workflow.version
          }
        };
      }
    }
  });

  const context = await llmContextService.buildLlmContext({
    conversationId: conversation._id.toString(),
    tenantId: input.session.actor.tenantId,
    workflowId: activeWorkflow?._id.toString() ?? 'inbox-assistant',
    maxMessages: 10
  });

  let systemPrompt = context.systemPrompt;
  if (input.mode === 'assist') {
    systemPrompt += "\n\nCRITICAL: You are an AI assistant helping a human agent. Please provide 3 distinct reply options for the agent to choose from. Format your response as a JSON array of strings: [\"Option 1\", \"Option 2\", \"Option 3\"]. Return ONLY the JSON array.";
  }

  const providerResult = await generateInboxReply({
    systemPrompt,
    messages: context.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  });

  let suggestedReply = '';
  let suggestions: string[] = [];

  if (input.mode === 'assist') {
    try {
      const parsed = JSON.parse(providerResult.text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        suggestions = parsed;
        suggestedReply = suggestions[0] || '';
      } else {
        suggestedReply = providerResult.text;
        suggestions = [suggestedReply];
      }
    } catch {
      suggestedReply = providerResult.text;
      suggestions = [suggestedReply];
    }
  } else {
    suggestedReply = providerResult.text;
  }

  if (input.mode === 'auto') {
    conversation.lastMessageContent = suggestedReply;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = 0;
    await conversation.save();

    await MessageModel.create({
      conversationId: conversation._id,
      role: 'assistant',
      content: suggestedReply,
      metadata: {
        source: 'inbox-ai-auto-reply',
        generatedFromConversationId: conversation._id.toString()
      }
    });

    await projectContactProfileFromMessage({
      agencyId: input.session.actor.agencyId,
      tenantId: input.session.actor.tenantId,
      contactId: conversation.contactId,
      contactName: conversation.contactName ?? null,
      contactPhone: conversation.contactPhone ?? null,
      role: 'assistant',
      timestamp: conversation.lastMessageAt ?? new Date()
    });

    await broadcastInboxEvent(input.session.actor.tenantId, {
      type: 'message.created',
      conversationId: conversation._id.toString()
    });
  }

  return {
    suggestedReply,
    suggestions: suggestions.length > 0 ? suggestions : [],
    systemPrompt: context.systemPrompt,
    messages: context.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  };
}
