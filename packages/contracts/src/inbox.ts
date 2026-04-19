import { z } from 'zod';
import {
  CrmNoteSchema,
  CrmOwnerSchema,
  CrmPipelineStageSchema,
  CrmTagSchema
} from './crm.js';

export const InboxStatusSchema = z.enum([
  'open',      // New conversation, unassigned
  'assigned',  // Claimed by an agent
  'handoff',   // Human takeover pauses automation
  'resolved',  // Issue fixed, waiting for customer
  'closed',    // Finished
  'deleted'    // Trash
]);

export type InboxStatus = z.infer<typeof InboxStatusSchema>;

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const InboxDeliveryStatusSchema = z.enum(['queued', 'sent', 'delivered', 'read', 'failed', 'revoked']);
export type InboxDeliveryStatus = z.infer<typeof InboxDeliveryStatusSchema>;

export const InboxDeliveryEventSourceSchema = z.enum([
  'message_create',
  'webhook_message',
  'webhook_ack',
  'retry_worker',
  'manual_resend'
]);
export type InboxDeliveryEventSource = z.infer<typeof InboxDeliveryEventSourceSchema>;

export const InboxAttachmentKindSchema = z.enum(['image', 'video', 'audio', 'document']);
export type InboxAttachmentKind = z.infer<typeof InboxAttachmentKindSchema>;

export const InboxAttachmentSchema = z.object({
  kind: InboxAttachmentKindSchema,
  url: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional()
}).strict();

export type InboxAttachment = z.infer<typeof InboxAttachmentSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid().optional(),
  conversationId: z.string().min(1),
  role: MessageRoleSchema,
  content: z.string().default(''),
  timestamp: z.date().default(() => new Date()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  messagingMessageId: z.string().optional(),
  providerMessageId: z.string().nullable().optional(),
  providerAck: z.number().int().nullable().optional(),
  providerAckName: z.string().nullable().optional(),
  replyToMessageId: z.string().nullable().optional(),
  deliveryStatus: InboxDeliveryStatusSchema.nullable().optional(),
  attachments: z.array(InboxAttachmentSchema).default([]),
  error: z.string().nullable().optional()
}).strict();

export type Message = z.infer<typeof MessageSchema>;

export const MessageDeliveryEventSchema = z.object({
  id: z.string().min(1).optional(),
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  providerMessageId: z.string().nullable().optional(),
  deliveryStatus: InboxDeliveryStatusSchema,
  providerAck: z.number().int().nullable().optional(),
  providerAckName: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  source: InboxDeliveryEventSourceSchema,
  occurredAt: z.date().default(() => new Date()),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict();

export type MessageDeliveryEvent = z.infer<typeof MessageDeliveryEventSchema>;

export const ConversationSchema = z.object({
  id: z.string().min(1).optional(),
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  contactId: z.string().min(1), // WhatsApp JID or similar
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  status: InboxStatusSchema.default('open'),
  assignedTo: z.string().nullable().optional(), // Agent User ID
  lastMessageContent: z.string().optional(),
  lastMessageAt: z.date().optional(),
  unreadCount: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type Conversation = z.infer<typeof ConversationSchema>;

export const ContactProfileSchema = z.object({
  id: z.string().min(1).optional(),
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  contactId: z.string().min(1),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  firstSeenAt: z.date().nullable().default(null),
  lastInboundAt: z.date().nullable().default(null),
  lastOutboundAt: z.date().nullable().default(null),
  crmOwner: CrmOwnerSchema.nullable().default(null),
  crmPipelineStage: CrmPipelineStageSchema.nullable().default(null),
  crmTags: z.array(CrmTagSchema).default([]),
  crmNotes: z.array(CrmNoteSchema).default([]),
  lastCrmSyncedAt: z.date().nullable().default(null),
  totalMessages: z.number().int().nonnegative().default(0),
  inboundMessages: z.number().int().nonnegative().default(0),
  outboundMessages: z.number().int().nonnegative().default(0)
}).strict();

export type ContactProfile = z.infer<typeof ContactProfileSchema>;

export const InboxQuerySchema = z.object({
  status: InboxStatusSchema.optional(),
  assignedTo: z.string().optional(),
  tenantId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
}).strict();

export type InboxQuery = z.infer<typeof InboxQuerySchema>;

// Realtime inbox events for SSE/RabbitMQ pub-sub
export const InboxEventTypeSchema = z.enum([
  'conversation.updated',
  'message.created',
  'message.delivery_updated',
  'assignment.updated'
]);
export type InboxEventType = z.infer<typeof InboxEventTypeSchema>;

export const InboxEventSchema = z.object({
  type: InboxEventTypeSchema,
  conversationId: z.string().min(1)
});
export type InboxEvent = z.infer<typeof InboxEventSchema>;

export function buildTenantInboxChannel(tenantId: string): string {
  return `tenant:${tenantId}:inbox`;
}
