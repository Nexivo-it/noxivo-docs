import {
  MessagingClusterModel,
  MessagingSessionBindingModel,
  ConversationModel,
  MessageModel
} from '@noxivo/database';
import { type MessagingSendOperation } from './dag-executor.js';
import { InboxService } from '../inbox/inbox.service.js';

export class WorkflowActionService {
  constructor(private readonly inboxService: InboxService = new InboxService()) {}

  async executeMessagingOperation(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    operation: MessagingSendOperation;
  }): Promise<string | null> {
    const { agencyId, tenantId, conversationId, operation } = input;

    const binding = await MessagingSessionBindingModel.findOne({
      agencyId,
      tenantId,
      status: 'active'
    }).sort({ updatedAt: -1 }).lean();

    if (!binding) {
      throw new Error('No active MessagingProvider session binding found for workflow action');
    }

    const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();
    if (!cluster) {
      throw new Error('MessagingProvider cluster not found for workflow action');
    }

    const messagingBaseUrl = cluster.baseUrl.replace(/\/$/, '');
    const messagingAuthToken = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;

    if (!messagingAuthToken) {
      throw new Error('MessagingProvider auth token is not configured');
    }

    const endpointMap: Record<string, string> = {
      'messaging.sendText': '/api/sendText',
      'messaging.sendImage': '/api/sendImage',
      'messaging.sendFile': '/api/sendFile',
      'messaging.sendButtons': '/api/sendButtons',
      'messaging.sendList': '/api/sendList'
    };

    const endpoint = endpointMap[operation.kind];
    if (!endpoint) {
      throw new Error(`Unsupported MessagingProvider operation kind: ${operation.kind}`);
    }

    const response = await fetch(`${messagingBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': messagingAuthToken
      },
      body: JSON.stringify({
        session: binding.messagingSessionName,
        chatId: operation.chatId,
        ...operation.payload
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MessagingProvider send failed with status ${response.status}: ${errorBody}`);
    }

    const result = await response.json() as any;
    const messagingMessageId = result.id || (result.id && typeof result.id === 'object' ? result.id._serialized : null);

    // Record the message in the local inbox
    await this.inboxService.recordMessage({
      agencyId,
      tenantId,
      contactId: operation.chatId,
      role: 'assistant',
      content: (operation.payload.text as string) || (operation.payload.caption as string) || '',
      messagingMessageId: messagingMessageId || undefined,
      providerMessageId: messagingMessageId || null,
      deliveryStatus: 'sent',
      deliveryEventSource: 'webhook_message',
      metadata: {
        source: 'workflow_engine',
        operationKind: operation.kind
      }
    });

    return messagingMessageId;
  }
}
