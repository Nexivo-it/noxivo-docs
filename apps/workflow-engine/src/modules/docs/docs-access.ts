import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_DASHBOARD_PUBLIC_BASE_URL = 'https://noxivo.app';
const DEFAULT_DOCS_RETURN_TO = '/docs';
const DOCS_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

interface WorkflowEngineDocsAccessTokenPayload {
  email: string;
  exp: number;
  sub: string;
}

function signValue(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function readSecret(): string | null {
  const secret = process.env.WORKFLOW_ENGINE_INTERNAL_PSK?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export const DOCS_ACCESS_COOKIE_NAME = 'noxivo_docs_access';

export function normalizeDocsReturnTo(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_DOCS_RETURN_TO;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/docs')) {
    return DEFAULT_DOCS_RETURN_TO;
  }

  return trimmed;
}

export function verifyWorkflowEngineDocsBridgeToken(token: string | null | undefined): WorkflowEngineDocsAccessTokenPayload | null {
  if (!token) {
    return null;
  }

  const secret = readSecret();
  if (!secret) {
    return null;
  }

  const separatorIndex = token.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex >= token.length - 1) {
    return null;
  }

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = signValue(secret, encodedPayload);

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let payload: WorkflowEngineDocsAccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as WorkflowEngineDocsAccessTokenPayload;
  } catch {
    return null;
  }

  if (!payload.sub || !payload.email || !Number.isFinite(payload.exp)) {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function serializeDocsAccessCookie(token: string): string {
  const secureDirective = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DOCS_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DOCS_ACCESS_COOKIE_MAX_AGE_SECONDS}${secureDirective}`;
}

export function resolveDashboardDocsEntryUrl(returnTo: string): string {
  const rawBaseUrl = process.env.DASHBOARD_PUBLIC_BASE_URL?.trim();
  const baseUrl = rawBaseUrl && rawBaseUrl.length > 0
    ? rawBaseUrl.replace(/\/+$/, '')
    : DEFAULT_DASHBOARD_PUBLIC_BASE_URL;
  const target = new URL('/dashboard/engine-docs', baseUrl);
  target.searchParams.set('returnTo', normalizeDocsReturnTo(returnTo));
  return target.toString();
}
