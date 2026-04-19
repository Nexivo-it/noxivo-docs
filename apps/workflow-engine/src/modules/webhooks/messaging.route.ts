import { z } from 'zod';
import { ConversationModel, MessageModel } from '@noxivo/database';
import { DeliveryLifecycleService } from '../inbox/delivery-lifecycle.service.js';
import { InboxEventsPublisher } from '../inbox/inbox-events.publisher.js';
import { type AddMessageInput } from '../inbox/inbox.service.js';

const MessagingSessionBindingInterface = z.object({
  id: z.string(),
  agencyId: z.string(),
  tenantId: z.string(),
  clusterId: z.string(),
  sessionName: z.string()
});

type MessagingSessionBinding = z.infer<typeof MessagingSessionBindingInterface>;

type MessagingSessionBindingStatus = 'pending' | 'active' | 'failed' | 'stopped';

interface MessagingSessionBindingRepo {
  findBySessionName(sessionName: string): Promise<MessagingSessionBinding | null>;
  updateStatus(sessionName: string, status: MessagingSessionBindingStatus): Promise<void>;
}

interface AgencyRepo {
  findById(id: string): Promise<unknown>;
}

interface TenantRepo {
  findById(id: string): Promise<unknown>;
}

interface EntitlementService {
  checkEntitlement(input: { agencyId: string; feature: string }): Promise<{ allowed: boolean; reason?: string }>;
}

interface InboxService {
  recordMessage(input: AddMessageInput): Promise<Record<string, unknown>>;
}

interface ConversationIngestService {
  ingestInboundMessage(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    contactId: string;
    content: string;
    receivedAt?: Date;
  }): Promise<unknown>;
}

type MessageLookupResult = { _id: unknown; conversationId: unknown } | null;

interface MessageRepo {
  findOne(filter: Record<string, unknown>): {
    exec(): Promise<MessageLookupResult>;
  };
  find(filter: Record<string, unknown>): {
    lean(): {
      exec(): Promise<Array<{ _id: unknown; conversationId: unknown }>>;
    };
  };
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>): {
    exec(): Promise<unknown>;
  };
}

interface ConversationRepo {
  findOne(filter: Record<string, unknown>): {
    lean(): {
      exec(): Promise<{ _id: unknown } | null>;
    };
  };
}

const MessagingWebhookMetadataSchema = z.object({
  agencyId: z.string().optional(),
  tenantId: z.string().optional(),
  clusterId: z.string().optional(),
  sessionBindingId: z.string().optional()
}).strict();

const MessagingWebhookEnvelopeSchema = z.object({
  event: z.string().min(1),
  session: z.string().min(1),
  payload: z.unknown(),
  metadata: MessagingWebhookMetadataSchema.optional()
}).strict();

const MessagingReplyToSchema = z.object({
  id: z.string().min(1),
  participant: z.string().optional(),
  body: z.string().optional()
}).passthrough();

const MessagingMediaSchema = z.object({
  url: z.string().min(1),
  mimetype: z.string().min(1),
  filename: z.string().nullable().optional()
}).passthrough();

const MessagingProviderIdSchema = z.union([
  z.string().min(1),
  z.object({
    _serialized: z.string().min(1)
  }).passthrough()
]);

const MessagingMessagePayloadSchema = z.object({
  id: MessagingProviderIdSchema,
  timestamp: z.number().optional(),
  from: z.string().min(1),
  fromMe: z.boolean().optional(),
  source: z.string().optional(),
  to: z.string().min(1),
  body: z.string().optional(),
  hasMedia: z.boolean().optional(),
  media: MessagingMediaSchema.nullable().optional(),
  ack: z.number().optional(),
  ackName: z.string().optional(),
  replyTo: MessagingReplyToSchema.nullable().optional()
}).passthrough();

const MessagingAckPayloadSchema = z.object({
  id: MessagingProviderIdSchema,
  ack: z.number(),
  ackName: z.string().optional(),
  fromMe: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional()
}).passthrough();

const MessagingSessionStatusPayloadSchema = z.object({
  status: z.string().min(1)
}).passthrough();

const MessagingPresencePayloadSchema = z.object({
  id: z.string().min(1),
  presence: z.string().min(1)
}).passthrough();

function mapMessagingMediaToQuotedMetadata(media: z.infer<typeof MessagingMediaSchema> | null | undefined): {
  kind: 'image' | 'video' | 'audio' | 'document';
  url: string;
  mimeType: string;
  fileName?: string | null;
} | null {
  if (!media?.url || !media.mimetype) {
    return null;
  }

  return {
    kind: mapMimeTypeToAttachmentKind(media.mimetype),
    url: media.url,
    mimeType: media.mimetype,
    ...(typeof media.filename === 'string' || media.filename === null ? { fileName: media.filename } : {}),
  };
}

function buildQuotedMessageMetadata(replyTo: z.infer<typeof MessagingReplyToSchema> | null | undefined): {
  messageId: string;
  participant?: string;
  body?: string;
  media?: {
    kind: 'image' | 'video' | 'audio' | 'document';
    url: string;
    mimeType: string;
    fileName?: string | null;
  };
} | null {
  if (!replyTo?.id) {
    return null;
  }

  const quotedMedia = mapMessagingMediaToQuotedMetadata(
    typeof replyTo === 'object' && replyTo !== null && 'media' in replyTo
      ? (replyTo as { media?: z.infer<typeof MessagingMediaSchema> | null }).media
      : null
  );

  return {
    messageId: replyTo.id,
    ...(typeof replyTo.participant === 'string' ? { participant: replyTo.participant } : {}),
    ...(typeof replyTo.body === 'string' ? { body: replyTo.body } : {}),
    ...(quotedMedia ? { media: quotedMedia } : {}),
  };
}

function mapAckToDeliveryStatus(ack?: number): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'revoked' | null {
  switch (ack) {
    case -1:
      return 'failed';
    case 0:
      return 'queued';
    case 1:
      return 'sent';
    case 2:
      return 'delivered';
    case 3:
    case 4:
      return 'read';
    default:
      return null;
  }
}

function mapMimeTypeToAttachmentKind(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
}

function mapMessagingSessionStatus(status: string): MessagingSessionBindingStatus | null {
  switch (status) {
    case 'STARTING':
    case 'SCAN_QR_CODE':
      return 'pending';
    case 'WORKING':
      return 'active';
    case 'FAILED':
      return 'failed';
    case 'STOPPED':
      return 'stopped';
    default:
      return null;
  }
}

function extractProviderMessageId(value: z.infer<typeof MessagingProviderIdSchema>): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (value && typeof value === 'object' && typeof value._serialized === 'string' && value._serialized.length > 0) {
    return value._serialized;
  }

  return null;
}

export type MessagingWebhookPayload = {
  event: string;
  session: string;
  payload: unknown;
  metadata?: {
    agencyId?: string;
    tenantId?: string;
    clusterId?: string;
    sessionBindingId?: string;
  };
};

export type WebhookResolutionResult = {
  agencyId: string;
  tenantId: string;
  clusterId: string;
  sessionBindingId: string;
};

type ParsedMessagingWebhookPayload = z.infer<typeof MessagingWebhookEnvelopeSchema>;

export class MessagingRouteService {
  private readonly messagingSessionBindingRepo: MessagingSessionBindingRepo;
  private readonly agencyRepo: AgencyRepo;
  private readonly tenantRepo: TenantRepo;
  private readonly entitlementService: EntitlementService;
  private readonly inboxService: InboxService;
  private readonly conversationIngestService: ConversationIngestService;
  private readonly messageRepo: MessageRepo;
  private readonly conversationRepo: ConversationRepo;
  private readonly deliveryLifecycleService: DeliveryLifecycleService;
  private readonly inboxEventsPublisher: InboxEventsPublisher;

  constructor(input: {
    messagingSessionBindingRepo: MessagingSessionBindingRepo;
    agencyRepo: AgencyRepo;
    tenantRepo: TenantRepo;
    entitlementService: EntitlementService;
    inboxService: InboxService;
    conversationIngestService: ConversationIngestService;
    messageRepo?: MessageRepo;
    conversationRepo?: ConversationRepo;
    deliveryLifecycleService: DeliveryLifecycleService;
    inboxEventsPublisher?: InboxEventsPublisher;
  }) {
    this.messagingSessionBindingRepo = input.messagingSessionBindingRepo;
    this.agencyRepo = input.agencyRepo;
    this.tenantRepo = input.tenantRepo;
    this.entitlementService = input.entitlementService;
    this.inboxService = input.inboxService;
    this.conversationIngestService = input.conversationIngestService;
    this.messageRepo = input.messageRepo ?? MessageModel;
    this.conversationRepo = input.conversationRepo ?? ConversationModel;
    this.deliveryLifecycleService = input.deliveryLifecycleService;
    this.inboxEventsPublisher = input.inboxEventsPublisher ?? new InboxEventsPublisher();
  }

  private async findScopedMessage(input: {
    agencyId: string;
    tenantId: string;
    providerMessageId: string;
  }): Promise<MessageLookupResult> {
    const candidates = await this.messageRepo.find({
      $or: [
        { messagingMessageId: input.providerMessageId },
        { providerMessageId: input.providerMessageId }
      ]
    }).lean().exec();

    for (const candidate of candidates) {
      const conversation = await this.conversationRepo.findOne({
        _id: candidate.conversationId,
        agencyId: input.agencyId,
        tenantId: input.tenantId
      }).lean().exec();

      if (conversation) {
        return candidate;
      }
    }

    return null;
  }

  async processWebhook(payload: MessagingWebhookPayload): Promise<WebhookResolutionResult | null> {
    const parsedPayload = MessagingWebhookEnvelopeSchema.parse(payload);
    const resolution = await this.resolveWebhook(parsedPayload);

    if (parsedPayload.event === 'session.status') {
      const sessionStatusPayload = MessagingSessionStatusPayloadSchema.parse(parsedPayload.payload);
      const mappedStatus = mapMessagingSessionStatus(sessionStatusPayload.status);

      if (mappedStatus) {
        const binding = await this.messagingSessionBindingRepo.findBySessionName(parsedPayload.session) as MessagingSessionBinding | null;
        if (binding) {
          await this.messagingSessionBindingRepo.updateStatus(parsedPayload.session, mappedStatus);
        }
      }

      return resolution;
    }

    if (!resolution) {
      return null;
    }

    if (parsedPayload.event === 'message.upsert' || parsedPayload.event === 'message' || parsedPayload.event === 'message.any') {
      const msg = MessagingMessagePayloadSchema.parse(parsedPayload.payload);
      const providerMessageId = extractProviderMessageId(msg.id);

      if (!providerMessageId) {
        return resolution;
      }

      const fromMe = msg.fromMe === true;
      const contactId = fromMe ? msg.to : msg.from;
      const attachments = msg.hasMedia && msg.media?.url && msg.media.mimetype
        ? [
          {
            kind: mapMimeTypeToAttachmentKind(msg.media.mimetype),
            url: msg.media.url,
            mimeType: msg.media.mimetype,
            fileName: msg.media.filename ?? null,
            caption: msg.body?.trim() ? msg.body : null
          }
        ]
        : [];
      const quotedMessageMetadata = buildQuotedMessageMetadata(msg.replyTo);
      const deliveryStatus = mapAckToDeliveryStatus(msg.ack);
      const existingMessage = await this.findScopedMessage({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        providerMessageId
      });

      if (existingMessage) {
        await this.messageRepo.findOneAndUpdate(
          { _id: existingMessage._id },
          {
            $set: {
              providerAck: msg.ack ?? null,
              providerAckName: msg.ackName ?? null,
              deliveryStatus,
              ...(attachments.length > 0 ? { attachments } : {}),
              ...(msg.replyTo?.id ? { replyToMessageId: msg.replyTo.id } : {}),
              ...(quotedMessageMetadata ? { 'metadata.quotedMessage': quotedMessageMetadata } : {})
            }
          }
        ).exec();

        await this.inboxEventsPublisher.publishDeliveryUpdated(
          resolution.tenantId,
          String(existingMessage.conversationId)
        );

        return resolution;
      }

      const recordResult = await this.inboxService.recordMessage({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        contactId,
        role: fromMe ? 'assistant' : 'user',
        content: msg.body ?? '',
        messagingMessageId: providerMessageId,
        providerMessageId,
        providerAck: msg.ack ?? null,
        providerAckName: msg.ackName ?? null,
        replyToMessageId: msg.replyTo?.id ?? null,
        deliveryStatus,
        attachments,
        deliveryEventSource: 'webhook_message',
        metadata: {
          messagingEvent: parsedPayload.event,
          timestamp: msg.timestamp ?? null,
          source: msg.source ?? null,
          ...(quotedMessageMetadata ? { quotedMessage: quotedMessageMetadata } : {})
        }
      });

      const record = recordResult as { conversation?: { _id?: unknown } };
      const conversationId = record?.conversation?._id?.toString();
      if (conversationId) {
        await this.inboxEventsPublisher.publishMessageCreated(
          resolution.tenantId,
          conversationId
        );

        // ADR-001 Phase 4: Trigger workflow ingestion loop
        if (!fromMe) {
          await this.conversationIngestService.ingestInboundMessage({
            agencyId: resolution.agencyId,
            tenantId: resolution.tenantId,
            conversationId,
            contactId,
            content: msg.body ?? '',
            receivedAt: msg.timestamp ? new Date(msg.timestamp * 1000) : new Date()
          });
        }
      }
    }

    if (parsedPayload.event === 'message.revoked') {
      const msg = MessagingMessagePayloadSchema.parse(parsedPayload.payload);
      const providerMessageId = extractProviderMessageId(msg.id);

      if (!providerMessageId) {
        return resolution;
      }

      const existingMessage = await this.findScopedMessage({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        providerMessageId
      });

      if (existingMessage) {
        await this.messageRepo.findOneAndUpdate(
          { _id: existingMessage._id },
          { $set: { deliveryStatus: 'revoked' } }
        ).exec();

        await this.inboxEventsPublisher.publishDeliveryUpdated(
          resolution.tenantId,
          String(existingMessage.conversationId)
        );
      }
    }

    if (parsedPayload.event === 'presence.update') {
      const presencePayload = MessagingPresencePayloadSchema.parse(parsedPayload.payload);
      const conversation = await this.conversationRepo.findOne({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        contactId: presencePayload.id
      }).lean().exec();

      if (conversation) {
        await this.inboxEventsPublisher.publishConversationUpdated(
          resolution.tenantId,
          String(conversation._id)
        );
      }
    }

    if (parsedPayload.event === 'message.ack' || parsedPayload.event === 'message.ack.group') {
      const ackPayload = MessagingAckPayloadSchema.parse(parsedPayload.payload);
      const providerMessageId = extractProviderMessageId(ackPayload.id);

      if (!providerMessageId) {
        return resolution;
      }

      const existingMessage = await this.findScopedMessage({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        providerMessageId
      });

      if (!existingMessage) {
        return resolution;
      }

      await this.messageRepo.findOneAndUpdate(
        { _id: existingMessage._id },
        {
          $set: {
            providerAck: ackPayload.ack,
            providerAckName: ackPayload.ackName ?? null,
            deliveryStatus: mapAckToDeliveryStatus(ackPayload.ack)
          }
        }
      ).exec();

      await this.deliveryLifecycleService.recordEvent({
        agencyId: resolution.agencyId,
        tenantId: resolution.tenantId,
        conversationId: String(existingMessage.conversationId),
        messageId: String(existingMessage._id),
        providerMessageId,
        deliveryStatus: mapAckToDeliveryStatus(ackPayload.ack) ?? 'queued',
        providerAck: ackPayload.ack,
        providerAckName: ackPayload.ackName ?? null,
        source: 'webhook_ack'
      });

      await this.inboxEventsPublisher.publishDeliveryUpdated(
        resolution.tenantId,
        String(existingMessage.conversationId)
      );
    }

    return resolution;
  }

  private async resolveWebhookFromMetadata(payload: ParsedMessagingWebhookPayload): Promise<WebhookResolutionResult | null> {
    const metadata = payload.metadata;
    const agencyId = metadata?.agencyId?.trim();
    const tenantId = metadata?.tenantId?.trim();

    if (!agencyId || !tenantId) {
      return null;
    }

    const [agency, tenant] = await Promise.all([
      this.agencyRepo.findById(agencyId),
      this.tenantRepo.findById(tenantId),
    ]);

    if (!agency || !tenant) {
      return null;
    }

    return {
      agencyId,
      tenantId,
      clusterId: metadata?.clusterId ?? 'unbound',
      sessionBindingId: metadata?.sessionBindingId ?? payload.session,
    };
  }

  async resolveWebhook(payload: ParsedMessagingWebhookPayload): Promise<WebhookResolutionResult | null> {
    const sessionName = payload.session;
    
    const binding = await this.messagingSessionBindingRepo.findBySessionName(sessionName) as MessagingSessionBinding | null;
    
    if (!binding) {
      return this.resolveWebhookFromMetadata(payload);
    }

    const metadata = payload.metadata || {};
    
    if (metadata.agencyId && metadata.agencyId !== binding.agencyId) {
      return null;
    }
    
    if (metadata.tenantId && metadata.tenantId !== binding.tenantId) {
      return null;
    }
    
    if (metadata.clusterId && metadata.clusterId !== binding.clusterId) {
      return null;
    }
    
    if (metadata.sessionBindingId && metadata.sessionBindingId !== binding.id) {
      return null;
    }

    return {
      agencyId: binding.agencyId,
      tenantId: binding.tenantId,
      clusterId: binding.clusterId,
      sessionBindingId: binding.id
    };
  }
}
