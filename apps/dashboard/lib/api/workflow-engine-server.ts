import { cookies } from 'next/headers';
import { buildWorkflowEngineUrl } from './workflow-engine-client';

function toCookieHeaderValue(cookieStore: Awaited<ReturnType<typeof cookies>>): string {
  return cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

export async function workflowEngineServerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const headers = new Headers(init?.headers);
  const cookieHeader = toCookieHeaderValue(cookieStore);

  if (cookieHeader.length > 0) {
    headers.set('cookie', cookieHeader);
  }

  headers.set('accept', 'application/json');

  const response = await fetch(buildWorkflowEngineUrl(path), {
    ...init,
    headers,
    cache: init?.cache ?? 'no-store',
  });

  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();

  if (!response.ok) {
    throw new Error(trimmedBody || `Workflow Engine Error: ${response.status}`);
  }

  if (trimmedBody.length === 0) {
    throw new Error('Empty response body');
  }

  return JSON.parse(trimmedBody) as T;
}
