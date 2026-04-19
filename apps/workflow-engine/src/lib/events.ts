import { EventEmitter } from 'node:events';

export const systemEvents = new EventEmitter();

export const SystemEventTypes = {
  WEBHOOK_RECEIVED: 'webhook.received',
  MESSAGE_SENT: 'message.sent',
  SESSION_STATUS_CHANGED: 'session.status_changed'
} as const;
