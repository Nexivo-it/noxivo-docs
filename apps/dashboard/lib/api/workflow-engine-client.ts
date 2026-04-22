const DEFAULT_BASE_URL = 'http://localhost:3001';

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WORKFLOW_ENGINE_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/$/, '');
}

export function buildWorkflowEngineUrl(path: string, overrideBaseUrl?: string): string {
  const base = overrideBaseUrl ?? getBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base.replace(/\/$/, '')}${normalizedPath}`;
}

export async function workflowEngineFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = buildWorkflowEngineUrl(path);

  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined;
  const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(init?.method?.toUpperCase() ?? '');
  if (hasBody || isWriteMethod) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  const rawBody = await res.text();
  const trimmedBody = rawBody.trim();

  const parseJsonBody = (): unknown | null => {
    if (trimmedBody.length === 0) {
      return null;
    }
    try {
      return JSON.parse(trimmedBody);
    } catch {
      return null;
    }
  };

  if (!res.ok) {
    const parsedErrorBody = parseJsonBody();
    const errorMessage =
      typeof parsedErrorBody === 'object' &&
      parsedErrorBody !== null &&
      'error' in parsedErrorBody &&
      typeof (parsedErrorBody as { error?: unknown }).error === 'string'
        ? (parsedErrorBody as { error: string }).error
        : trimmedBody || res.statusText;
    throw new Error(errorMessage || `Workflow Engine Error: ${res.status}`);
  }

  if (trimmedBody.length === 0) {
    throw new Error('Empty response body');
  }

  const parsedBody = parseJsonBody();
  if (parsedBody !== null) {
    return parsedBody as T;
  }

  throw new Error(`Failed to parse response as JSON: ${trimmedBody}`);
}