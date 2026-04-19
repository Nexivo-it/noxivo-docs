import { getCurrentSession } from '../../../../../lib/auth/session';
import dbConnect from '../../../../../lib/mongodb';
import { MessagingSessionBindingModel } from '@noxivo/database';

function normalizeEngineApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

async function handleProxy(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  const resolvedParams = await context.params;
  const session = await getCurrentSession();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  await dbConnect();

  const binding = await MessagingSessionBindingModel.findOne({
    $or: [
      { sessionName: resolvedParams.instanceId },
      { messagingSessionName: resolvedParams.instanceId }
    ]
  }).lean();

  if (!binding) {
    return new Response('Instance not found', { status: 404 });
  }

  if (binding.agencyId.toString() !== session.actor.agencyId || binding.tenantId.toString() !== session.actor.tenantId) {
    return new Response('Forbidden', { status: 403 });
  }

  const engineApiUrl = process.env.ENGINE_API_URL ?? process.env.NEXT_PUBLIC_ENGINE_API_URL;
  const engineApiKey = process.env.ENGINE_API_KEY;

  if (!engineApiUrl || !engineApiKey) {
    return new Response('Backend not configured', { status: 500 });
  }

  const path = (resolvedParams.path ?? []).map((segment) => encodeURIComponent(segment)).join('/');
  const query = new URL(request.url).search;
  const engineBaseUrl = normalizeEngineApiUrl(engineApiUrl);
  const url = `${engineBaseUrl}/${encodeURIComponent(resolvedParams.instanceId)}${path ? `/${path}` : ''}${query}`;

  const incomingHeaders = new Headers(request.headers);
  incomingHeaders.set('x-api-key', engineApiKey);
  incomingHeaders.delete('cookie');

  const fetchInit: RequestInit = {
    method: request.method,
    headers: incomingHeaders
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const rawBody = await request.text();
    fetchInit.body = rawBody.length > 0 ? rawBody : null;
  }

  const response = await fetch(url, fetchInit);

  return response;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  return handleProxy(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  return handleProxy(request, context);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  return handleProxy(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  return handleProxy(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ instanceId: string; path: string[] }> }
): Promise<Response> {
  return handleProxy(request, context);
}
