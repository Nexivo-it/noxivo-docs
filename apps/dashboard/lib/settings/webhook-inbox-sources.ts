import { createHash } from 'node:crypto';

export type WebhookInboxSourceStatus = 'active' | 'disabled';

export type WebhookInboxSourceDto = {
  id: string;
  name: string;
  status: WebhookInboxSourceStatus;
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders: Record<string, string>;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWebhookInboxSourcePayload = {
  name: string;
  outboundUrl: string;
  inboundSecret: string;
  outboundHeaders: Record<string, string>;
};

export type UpdateWebhookInboxSourcePayload = {
  name?: string;
  outboundUrl?: string;
  inboundSecret?: string;
  outboundHeaders?: Record<string, string>;
  status?: WebhookInboxSourceStatus;
};

const VALIDATION_MESSAGES = new Set([
  'Invalid payload object',
  'Webhook source name must be between 2 and 120 characters',
  'outboundUrl must be a valid URL',
  'inboundSecret is required',
  'inboundSecret must be a non-empty string',
  'outboundHeaders must be an object of string values',
  'status must be active or disabled',
  'At least one field is required',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseName(value: unknown): string {
  const normalized = toOptionalString(value);
  if (!normalized || normalized.length < 2 || normalized.length > 120) {
    throw new Error('Webhook source name must be between 2 and 120 characters');
  }

  return normalized;
}

function parseUrl(value: unknown): string {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error('outboundUrl must be a valid URL');
  }

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error('outboundUrl must be a valid URL');
  }
}

function parseHeaders(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error('outboundHeaders must be an object of string values');
  }

  const normalizedEntries = Object.entries(value).map(([key, headerValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = toOptionalString(headerValue);
    if (normalizedKey.length === 0 || normalizedValue === undefined) {
      throw new Error('outboundHeaders must be an object of string values');
    }

    return [normalizedKey, normalizedValue] as const;
  });

  return Object.fromEntries(normalizedEntries);
}

function parseInboundSecret(value: unknown): string {
  if (value === undefined) {
    throw new Error('inboundSecret is required');
  }

  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error('inboundSecret must be a non-empty string');
  }

  return normalized;
}

export function hashWebhookInboundSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseCreateWebhookInboxSourcePayload(input: unknown): CreateWebhookInboxSourcePayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  return {
    name: parseName(input.name),
    outboundUrl: parseUrl(input.outboundUrl),
    inboundSecret: parseInboundSecret(input.inboundSecret),
    outboundHeaders: parseHeaders(input.outboundHeaders),
  };
}

export function parseUpdateWebhookInboxSourcePayload(input: unknown): UpdateWebhookInboxSourcePayload {
  if (!isRecord(input)) {
    throw new Error('Invalid payload object');
  }

  const payload: UpdateWebhookInboxSourcePayload = {};

  if ('name' in input) {
    payload.name = parseName(input.name);
  }

  if ('outboundUrl' in input) {
    payload.outboundUrl = parseUrl(input.outboundUrl);
  }

  if ('inboundSecret' in input) {
    payload.inboundSecret = parseInboundSecret(input.inboundSecret);
  }

  if ('outboundHeaders' in input) {
    payload.outboundHeaders = parseHeaders(input.outboundHeaders);
  }

  if ('status' in input) {
    if (input.status !== 'active' && input.status !== 'disabled') {
      throw new Error('status must be active or disabled');
    }
    payload.status = input.status;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('At least one field is required');
  }

  return payload;
}

function normalizeOutboundHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, headerValue]) => [key, headerValue]);

  return Object.fromEntries(normalizedEntries);
}

export function mapWebhookInboxSourceDto(source: {
  _id: { toString(): string };
  name: string;
  status: WebhookInboxSourceStatus;
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders?: unknown;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WebhookInboxSourceDto {
  return {
    id: source._id.toString(),
    name: source.name,
    status: source.status,
    inboundPath: source.inboundPath,
    outboundUrl: source.outboundUrl,
    outboundHeaders: normalizeOutboundHeaders(source.outboundHeaders),
    disabledAt: source.disabledAt ? source.disabledAt.toISOString() : null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

export function isWebhookInboxSourceValidationError(error: unknown): error is Error {
  return error instanceof Error && VALIDATION_MESSAGES.has(error.message);
}
