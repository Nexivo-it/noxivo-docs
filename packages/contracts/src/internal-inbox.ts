import { z } from 'zod';
import { InboxAttachmentKindSchema, InboxAttachmentSchema } from './inbox.js';

export const WORKFLOW_ENGINE_INTERNAL_PSK_HEADER = 'x-nexus-internal-psk';
export const INTERNAL_INBOX_IDEMPOTENCY_HEADER = 'idempotency-key';

export const InternalInboxSendMessageParamsSchema = z.object({
  conversationId: z.string().trim().min(1)
}).strict();

export type InternalInboxSendMessageParams = z.infer<typeof InternalInboxSendMessageParamsSchema>;

export const InternalInboxAuthHeadersSchema = z.object({
  [WORKFLOW_ENGINE_INTERNAL_PSK_HEADER]: z.string().trim().min(1)
}).passthrough();

export type InternalInboxAuthHeaders = z.infer<typeof InternalInboxAuthHeadersSchema>;

export const InternalInboxIdempotencyHeadersSchema = z.object({
  [INTERNAL_INBOX_IDEMPOTENCY_HEADER]: z.string().trim().min(1)
}).passthrough();

export type InternalInboxIdempotencyHeaders = z.infer<typeof InternalInboxIdempotencyHeadersSchema>;

export const InternalInboxSendAttachmentSchema = InboxAttachmentSchema.extend({
  kind: InboxAttachmentKindSchema,
  convert: z.boolean().optional(),
  asNote: z.boolean().optional()
}).strict();

export type InternalInboxSendAttachment = z.infer<typeof InternalInboxSendAttachmentSchema>;

export const InternalInboxSendMessageRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  operatorUserId: z.string().min(1),
  content: z.string().trim().optional(),
  attachments: z.array(InternalInboxSendAttachmentSchema).max(10).default([]),
  replyToMessageId: z.string().trim().min(1).optional()
}).strict().superRefine((value, context) => {
  const hasContent = (value.content ?? '').trim().length > 0;
  const hasAttachments = value.attachments.length > 0;

  if (!hasContent && !hasAttachments) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either content or attachments must be provided',
      path: ['content']
    });
  }
});

export type InternalInboxSendMessageRequest = z.infer<typeof InternalInboxSendMessageRequestSchema>;

export const InternalInboxSendMessageResponseSchema = z.object({
  _id: z.string().min(1),
  conversationId: z.string().min(1),
  role: z.literal('assistant'),
  content: z.string(),
  createdAt: z.string().datetime(),
  messagingMessageId: z.string().nullable().optional(),
  deliveryStatus: z.enum(['queued', 'sent', 'delivered', 'read', 'failed']).nullable().optional(),
  attachments: z.array(InternalInboxSendAttachmentSchema).default([])
}).strict();

export type InternalInboxSendMessageResponse = z.infer<typeof InternalInboxSendMessageResponseSchema>;

export const InternalInboxSyncRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  pages: z.number().int().min(1).max(20).optional()
}).strict();

export type InternalInboxSyncRequest = z.infer<typeof InternalInboxSyncRequestSchema>;

export const InternalInboxSyncResponseSchema = z.object({
  syncedConversations: z.number().int().nonnegative(),
  syncedMessages: z.number().int().nonnegative(),
  sessionName: z.string().nullable()
}).strict();

export type InternalInboxSyncResponse = z.infer<typeof InternalInboxSyncResponseSchema>;
