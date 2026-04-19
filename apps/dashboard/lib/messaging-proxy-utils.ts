const PROXY_HEADER_AUTHORIZATION = 'authorization';

export interface ProxyAccessContext {
  actorAgencyId: string;
  actorTenantId: string;
  resourceAgencyId: string;
  resourceTenantId: string;
}

export interface ProxyRequestContext {
  baseUrl: string;
  instanceId: string;
  path: string[];
  method: string;
  incomingHeaders: Headers;
  serverAuthToken: string;
}

export function assertProxyAccess(context: ProxyAccessContext): void {
  if (context.actorAgencyId !== context.resourceAgencyId) {
    throw new Error('Cross-agency MessagingProvider proxy access is forbidden');
  }

  if (context.actorTenantId !== context.resourceTenantId) {
    throw new Error('Cross-tenant MessagingProvider proxy access is forbidden');
  }
}

export function buildProxyHeaders(input: {
  incomingHeaders: Headers;
  serverAuthToken: string;
}): Headers {
  const headers = new Headers();

  input.incomingHeaders.forEach((value, key) => {
    if (key.toLowerCase() === PROXY_HEADER_AUTHORIZATION) {
      return;
    }

    headers.set(key, value);
  });

  headers.set(PROXY_HEADER_AUTHORIZATION, `Basic ${input.serverAuthToken}`);
  return headers;
}

export function buildProxyUrl(input: {
  baseUrl: string;
  instanceId: string;
  path: string[];
  queryParams?: Record<string, string>;
}): string {
  const sanitizedBaseUrl = input.baseUrl.replace(/\/+$/, '');
  const pathSegments = input.path.map((segment) => encodeURIComponent(segment));
  const joinedPath = pathSegments.join('/');
  let url = `${sanitizedBaseUrl}/api/${encodeURIComponent(input.instanceId)}/${joinedPath}`;
  
  if (input.queryParams && Object.keys(input.queryParams).length > 0) {
    const searchParams = new URLSearchParams(input.queryParams);
    url += `?${searchParams.toString()}`;
  }
  
  return url;
}

export function createProxyRequestInit(context: ProxyRequestContext): {
  url: string;
  init: RequestInit;
} {
  const proxyHeaders = buildProxyHeaders({
    incomingHeaders: context.incomingHeaders,
    serverAuthToken: context.serverAuthToken
  });

  return {
    url: buildProxyUrl({
      baseUrl: context.baseUrl,
      instanceId: context.instanceId,
      path: context.path
    }),
    init: {
      method: context.method,
      headers: proxyHeaders
    }
  };
}

export function resolveAccessContext(request: Request): ProxyAccessContext {
  return {
    actorAgencyId: request.headers.get('x-actor-agency-id') ?? '',
    actorTenantId: request.headers.get('x-actor-tenant-id') ?? '',
    resourceAgencyId: request.headers.get('x-resource-agency-id') ?? '',
    resourceTenantId: request.headers.get('x-resource-tenant-id') ?? ''
  };
}