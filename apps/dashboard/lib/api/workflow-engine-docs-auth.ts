import { createHmac } from 'node:crypto';

const DEFAULT_WORKFLOW_ENGINE_PUBLIC_BASE_URL = 'https://api-workflow-engine.noxivo.app';
const DOCS_TOKEN_TTL_SECONDS = 60 * 5;

interface WorkflowEngineDocsTokenPayload {
  email: string;
  exp: number;
  sub: string;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signValue(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function resolveWorkflowEnginePublicBaseUrl(): string {
  const rawBaseUrl = process.env.WORKFLOW_ENGINE_PUBLIC_BASE_URL?.trim();
  if (!rawBaseUrl) {
    return DEFAULT_WORKFLOW_ENGINE_PUBLIC_BASE_URL;
  }

  return rawBaseUrl.replace(/\/+$/, '');
}

export function normalizeWorkflowEngineDocsReturnTo(value: string | null | undefined): string {
  if (!value) {
    return '/docs';
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/docs')) {
    return '/docs';
  }

  return trimmed;
}

export function createWorkflowEngineDocsBridgeToken(input: {
  email: string;
  userId: string;
}): string {
  const secret = process.env.WORKFLOW_ENGINE_INTERNAL_PSK?.trim();
  if (!secret) {
    throw new Error('WORKFLOW_ENGINE_INTERNAL_PSK is required to mint workflow-engine docs access tokens');
  }

  const payload: WorkflowEngineDocsTokenPayload = {
    sub: input.userId,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + DOCS_TOKEN_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signValue(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function buildWorkflowEngineDocsAuthorizeUrl(input: {
  email: string;
  returnTo?: string | null;
  userId: string;
}): string {
  const token = createWorkflowEngineDocsBridgeToken({
    userId: input.userId,
    email: input.email,
  });
  const target = new URL('/docs/authorize', resolveWorkflowEnginePublicBaseUrl());
  target.searchParams.set('token', token);
  target.searchParams.set('returnTo', normalizeWorkflowEngineDocsReturnTo(input.returnTo));
  return target.toString();
}
