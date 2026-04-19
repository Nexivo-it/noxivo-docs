export interface ChatSummary {
  _id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  avatarUrl: string | null;
  leadSaved: boolean;
  unreadCount: number;
  status: string;
  assignedTo: string | null;
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
}

export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  deliveryStatus?: string | null;
  providerMessageId?: string | null;
  replyToMessageId?: string | null;
  messageSource?: string | null;
  error?: string | null;
  attachments?: Array<{
    kind: 'image' | 'video' | 'audio' | 'document';
    url: string;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
  }>;
}

export interface TeamInboxActionResponse {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  status?: string;
  updatedAt?: string;
  error?: {
    code?: string;
    message: string;
  };
}

export type ConversationActionType =
  | 'seen'
  | 'archive'
  | 'unarchive'
  | 'unread'
  | 'typing_start'
  | 'typing_stop'
  | 'send_link_preview';

export type MessageActionType =
  | 'reaction'
  | 'star'
  | 'unstar'
  | 'edit'
  | 'delete'
  | 'pin'
  | 'unpin';

export interface PaginatedMessagesResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface InboxRealtimeEvent {
  type:
    | 'connected'
    | 'conversation.updated'
    | 'message.delivery_updated'
    | 'message.created'
    | 'assignment.updated'
    | 'message.sent'
    | 'message.received';
  conversationId?: string;
  message?: ChatMessage;
  conversation?: ChatSummary;
}
