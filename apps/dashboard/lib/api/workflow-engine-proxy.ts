import { NextResponse } from 'next/server';
import { getCurrentSession } from '../auth/session';

type ProxyOptions = {
  targetPath: string;
};

function resolveWorkflowEngineBaseUrl(): string | null {
  const rawBaseUrl = process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL?.trim();
  if (!rawBaseUrl) {
    return null;
  }

  return rawBaseUrl.replace(/\/+$/, '');
}

function normalizeTargetPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return '/';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildProxyUrl(requestUrl: string, targetPath: string): string | null {
  const baseUrl = resolveWorkflowEngineBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const search = new URL(requestUrl).search;
  return `${baseUrl}/api/v1${normalizeTargetPath(targetPath)}${search}`;
}

function buildProxyHeaders(incomingHeaders: Headers): Headers {
  const headers = new Headers(incomingHeaders);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  return headers;
}

function isBodyForwardingMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

export async function proxyDashboardRouteToWorkflowEngine(
  request: Request,
  options: ProxyOptions
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const proxyUrl = buildProxyUrl(request.url, options.targetPath);
  if (!proxyUrl) {
    return NextResponse.json({ error: 'Workflow engine internal base URL is not configured' }, { status: 500 });
  }

  const method = request.method.toUpperCase();
  const headers = buildProxyHeaders(request.headers);
  const init: RequestInit = {
    method,
    headers,
  };

  if (isBodyForwardingMethod(method)) {
    const bodyBuffer = await request.arrayBuffer();
    if (bodyBuffer.byteLength > 0) {
      init.body = bodyBuffer;
    }
  }

  try {
    return await fetch(proxyUrl, init);
  } catch {
    return NextResponse.json({ error: 'Failed to reach workflow engine' }, { status: 502 });
  }
}
