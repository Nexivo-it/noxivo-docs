import { z } from 'zod';

export const MessagingSessionStatusSchema = z.enum([
  'STOPPED',
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'FAILED',
  'loading',
  'available',
  'provisioning',
  'connected',
  'unavailable',
  'error'
]);

export type MessagingSessionStatus = z.infer<typeof MessagingSessionStatusSchema>;

export const MessagingSessionBootstrapRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  accountName: z.string().optional()
}).strict();

export type MessagingSessionBootstrapRequest = z.infer<typeof MessagingSessionBootstrapRequestSchema>;

export const MessagingSessionBootstrapResponseSchema = z.object({
  sessionName: z.string(),
  status: MessagingSessionStatusSchema,
  provisioning: z.boolean().optional()
}).strict();

export type MessagingSessionBootstrapResponse = z.infer<typeof MessagingSessionBootstrapResponseSchema>;

export const MessagingSessionQrResponseSchema = z.object({
  sessionName: z.string(),
  status: MessagingSessionStatusSchema,
  qr: z.string().nullable(),
  profile: z.object({
    id: z.string(),
    pushName: z.string().nullable(),
    profilePicUrl: z.string().nullable()
  }).nullable().optional(),
  provisioning: z.boolean().optional()
}).strict();

export type MessagingSessionQrResponse = z.infer<typeof MessagingSessionQrResponseSchema>;

export const MessagingSessionStatusResponseSchema = z.object({
  sessionName: z.string(),
  status: MessagingSessionStatusSchema,
  profile: z.object({
    id: z.string(),
    pushName: z.string().nullable(),
    profilePicUrl: z.string().nullable()
  }).nullable()
}).strict();

export type MessagingSessionStatusResponse = z.infer<typeof MessagingSessionStatusResponseSchema>;

export const MessagingChatSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  lastMessage: z.object({
    id: z.string(),
    body: z.string().nullable(),
    timestamp: z.number(),
    fromMe: z.boolean()
  }).nullable(),
  unreadCount: z.number().int().nonnegative().default(0)
}).strict();

export type MessagingChatSummary = z.infer<typeof MessagingChatSummarySchema>;

export const MessagingChatsRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  pages: z.coerce.number().int().min(1).max(20).optional()
}).strict();

export type MessagingChatsRequest = z.infer<typeof MessagingChatsRequestSchema>;

export const MessagingChatsResponseSchema = z.object({
  chats: z.array(MessagingChatSummarySchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean()
}).strict();

export type MessagingChatsResponse = z.infer<typeof MessagingChatsResponseSchema>;

export const MessagingMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  fromMe: z.boolean(),
  to: z.string(),
  body: z.string().nullable(),
  timestamp: z.number(),
  ack: z.number().int(),
  ackName: z.enum(['ERROR', 'PENDING', 'SERVER', 'DEVICE', 'READ', 'PLAYED']),
  hasMedia: z.boolean().default(false),
  media: z.object({
    url: z.string(),
    mimetype: z.string(),
    filename: z.string().nullable()
  }).nullable()
}).strict();

export type MessagingMessage = z.infer<typeof MessagingMessageSchema>;

export const MessagingMessagesRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  pages: z.coerce.number().int().min(1).max(20).optional()
}).strict();

export type MessagingMessagesRequest = z.infer<typeof MessagingMessagesRequestSchema>;

export const MessagingMessagesResponseSchema = z.object({
  messages: z.array(MessagingMessageSchema),
  hasMore: z.boolean()
}).strict();

export type MessagingMessagesResponse = z.infer<typeof MessagingMessagesResponseSchema>;

export const MessagingSendMessageRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  operatorUserId: z.string().min(1),
  content: z.string().trim().optional(),
  attachments: z.array(z.object({
    kind: z.enum(['image', 'video', 'audio', 'document']),
    url: z.string().url().optional(),
    data: z.string().optional(),
    mimeType: z.string(),
    filename: z.string().nullable().optional(),
    caption: z.string().nullable().optional()
  })).max(10).default([]),
  replyToMessageId: z.string().optional()
}).strict().superRefine((value, context) => {
  const hasContent = (value.content ?? '').trim().length > 0;
  const hasAttachments = value.attachments.length > 0;

  if (!hasContent && !hasAttachments) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either content or attachments must be provided'
    });
  }
});

export type MessagingSendMessageRequest = z.infer<typeof MessagingSendMessageRequestSchema>;

export const MessagingSendMessageResponseSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  status: z.enum(['queued', 'sent'])
}).strict();

export type MessagingSendMessageResponse = z.infer<typeof MessagingSendMessageResponseSchema>;

export const MessagingMessageStatusRequestSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1),
  messageId: z.string().min(1)
}).strict();

export type MessagingMessageStatusRequest = z.infer<typeof MessagingMessageStatusRequestSchema>;

export const MessagingMessageStatusResponseSchema = z.object({
  messageId: z.string(),
  providerMessageId: z.string().nullable(),
  status: z.enum(['queued', 'sent', 'delivered', 'read', 'failed']),
  providerAck: z.number().int().nullable(),
  providerAckName: z.string().nullable(),
  updatedAt: z.string().datetime()
}).strict();

export type MessagingMessageStatusResponse = z.infer<typeof MessagingMessageStatusResponseSchema>;
