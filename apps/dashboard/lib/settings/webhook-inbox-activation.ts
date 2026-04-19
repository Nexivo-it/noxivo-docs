import { WebhookInboxActivationModel } from '@noxivo/database';

export interface WebhookInboxActivationStatus {
  isActive: boolean;
  webhookUrl: string | null;
  apiKey: string | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
}

export async function activateWebhookInbox(
  agencyId: string,
  tenantId: string
): Promise<WebhookInboxActivationStatus> {
  const result = await WebhookInboxActivationModel.activate(agencyId, tenantId);
  return {
    isActive: result.isActive,
    webhookUrl: result.webhookUrl,
    apiKey: result.apiKey,
    activatedAt: result.activatedAt ?? null,
    deactivatedAt: result.deactivatedAt ?? null,
  };
}

export async function deactivateWebhookInbox(
  agencyId: string,
  tenantId: string
): Promise<WebhookInboxActivationStatus | null> {
  const result = await WebhookInboxActivationModel.deactivate(agencyId, tenantId);
  if (!result) {
    return null;
  }
  return {
    isActive: result.isActive,
    webhookUrl: null,
    apiKey: null,
    activatedAt: result.activatedAt ?? null,
    deactivatedAt: result.deactivatedAt ?? null,
  };
}

export async function getWebhookInboxStatus(
  agencyId: string,
  tenantId: string
): Promise<WebhookInboxActivationStatus> {
  return WebhookInboxActivationModel.getStatus(agencyId, tenantId);
}

export interface WebhookInboxMessagePayload {
  contactName?: string | undefined;
  contactPhone?: string | undefined;
  message: string;
  metadata?: Record<string, unknown> | undefined;
}

export function isWebhookInboxMessageValidationError(
  error: unknown
): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

export function parseWebhookInboxMessagePayload(
  body: unknown
): WebhookInboxMessagePayload {
  if (!body || typeof body !== 'object') {
    throw { message: 'Invalid payload: must be an object' };
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    throw { message: 'message is required' };
  }

  return {
    contactName:
      typeof payload.contactName === 'string' ? payload.contactName.trim() : undefined,
    contactPhone:
      typeof payload.contactPhone === 'string' ? payload.contactPhone.trim() : undefined,
    message: payload.message.trim(),
    metadata:
      typeof payload.metadata === 'object' && payload.metadata !== null
        ? (payload.metadata as Record<string, unknown>)
        : undefined,
  };
}