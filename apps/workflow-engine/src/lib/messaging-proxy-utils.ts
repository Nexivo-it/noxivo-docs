export async function proxyToMessaging(path: string, options: RequestInit = {}) {
  const baseUrlCandidate = process.env.MESSAGING_PROVIDER_PROXY_BASE_URL ?? process.env.MESSAGING_PROVIDER_BASE_URL;
  if (!baseUrlCandidate) {
    throw new Error('MESSAGING_PROVIDER_PROXY_BASE_URL or MESSAGING_PROVIDER_BASE_URL environment variable is required');
  }
  const baseUrl = baseUrlCandidate.replace(/\/$/, '');
  const apiKey = process.env.MESSAGING_PROVIDER_API_KEY ?? 'messagingSecretKey2025!';

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(options.headers);
  headers.set('X-Api-Key', apiKey);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers
  });

  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();
  const parseBody = (): unknown => {
    if (trimmedBody.length === 0) {
      return null;
    }

    try {
      return JSON.parse(trimmedBody) as unknown;
    } catch {
      return trimmedBody;
    }
  };

  if (!response.ok) {
    const parsedErrorBody = parseBody();
    const message = typeof parsedErrorBody === 'object'
      && parsedErrorBody
      && 'message' in parsedErrorBody
      && typeof (parsedErrorBody as { message?: unknown }).message === 'string'
      ? (parsedErrorBody as { message: string }).message
      : typeof parsedErrorBody === 'string' && parsedErrorBody.length > 0
        ? parsedErrorBody
        : response.statusText;

    const error = new Error(message || `Messaging Provider Error: ${response.status}`) as any;
    error.status = response.status;
    throw error;
  }

  return parseBody();
}