import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { dbConnect } from '../../lib/mongodb.js';
import { proxyToMessaging } from '../../lib/messaging-proxy-utils.js';
import { getWorkflowContinuationQueue } from '../../modules/agents/continuation-queue.js';
import { resolveMessagingSessionName } from './session-resolution.js';
import { MessagingSessionService } from '../../lib/messaging-session.service.js';
import { MessagingSessionBootstrapRequestSchema } from '@noxivo/contracts';

const AUTH_SESSION_COOKIE_NAME = 'noxivo_session';
const MessagingProvider_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

type MessagingMethod = typeof MessagingProvider_METHODS[number];

type MessagingSpecEndpoint = {
  id: string;
  method: MessagingMethod;
  pathTemplate: string;
  summary: string;
  operationId: string | null;
  parameters: {
    path: string[];
    query: string[];
  };
  hasRequestBody: boolean;
  responseStatusCodes: string[];
};

type MessagingSpecTag = {
  name: string;
  endpoints: MessagingSpecEndpoint[];
};

const AdminMessagingRequestSchema = z.object({
  method: z.enum(MessagingProvider_METHODS),
  path: z.string().trim().min(1),
  query: z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean()]))])).optional(),
  body: z.unknown().optional(),
});

function getMessagingBaseUrl(): string {
  const raw = process.env.MESSAGING_PROVIDER_BASE_URL ?? 'https://api-workflow-engine.noxivo.app';
  return raw.replace(/\/+$/, '');
}

function getMessagingApiKey(): string {
  return process.env.MESSAGING_PROVIDER_API_KEY ?? 'messagingSecretKey2025!';
}

function extractQrToken(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const candidate = record.qr ?? record.value ?? record.qrValue ?? record.code;
  return typeof candidate === 'string' ? candidate : '';
}

function getSessionTokenFromCookies(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const fragment of cookieHeader.split(';')) {
    const [rawKey, ...rest] = fragment.split('=');
    if (!rawKey || rest.length === 0) {
      continue;
    }

    if (rawKey.trim() !== AUTH_SESSION_COOKIE_NAME) {
      continue;
    }

    const rawValue = rest.join('=').trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

async function findMessagingSpecPath(startCwd: string): Promise<string | null> {
  const configuredPath = process.env.MESSAGING_PROVIDER_OPENAPI_PATH?.trim();
  if (configuredPath) {
    const resolvedPath = path.resolve(configuredPath);
    try {
      await access(resolvedPath);
      return resolvedPath;
    } catch {
      // fall through to filesystem search
    }
  }

  let currentDir = path.resolve(startCwd);
  const filesystemRoot = path.parse(currentDir).root;

  while (true) {
    const candidates = [
      path.join(currentDir, 'messaging-openapi.json'),
      path.join(currentDir, 'apps/workflow-engine/messaging-openapi.json'),
    ];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // continue search
      }
    }

    if (currentDir === filesystemRoot) {
      return null;
    }

    currentDir = path.dirname(currentDir);
  }
}

let cachedSpec: {
  fromPath: string;
  byTag: Map<string, MessagingSpecTag>;
  byMethod: Map<MessagingMethod, MessagingSpecEndpoint[]>;
  totalEndpoints: number;
} | null = null;

function extractParameterNames(operation: Record<string, unknown>, kind: 'path' | 'query'): string[] {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  const names: string[] = [];

  for (const parameter of parameters) {
    if (!parameter || typeof parameter !== 'object') {
      continue;
    }
    const record = parameter as Record<string, unknown>;
    if (record.in !== kind || typeof record.name !== 'string') {
      continue;
    }
    names.push(record.name);
  }

  return names;
}

function pathMatchesTemplate(actualPath: string, template: string): boolean {
  const normalizedActual = actualPath.replace(/\/+$/, '') || '/';
  const normalizedTemplate = template.replace(/\/+$/, '') || '/';
  const actualParts = normalizedActual.split('/').filter(Boolean);
  const templateParts = normalizedTemplate.split('/').filter(Boolean);

  if (actualParts.length !== templateParts.length) {
    return false;
  }

  for (let i = 0; i < templateParts.length; i += 1) {
    const templatePart = templateParts[i];
    const actualPart = actualParts[i];
    if (!templatePart || !actualPart) {
      return false;
    }

    if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
      continue;
    }

    if (templatePart !== actualPart) {
      return false;
    }
  }

  return true;
}

async function loadMessagingSpec(): Promise<{
  fromPath: string;
  byTag: Map<string, MessagingSpecTag>;
  byMethod: Map<MessagingMethod, MessagingSpecEndpoint[]>;
  totalEndpoints: number;
}> {
  if (cachedSpec) {
    return cachedSpec;
  }

  const specPath = await findMessagingSpecPath(process.cwd());
  if (!specPath) {
    throw new Error('Unable to locate messaging-openapi.json from configured path or working directory');
  }

  const raw = await readFile(specPath, 'utf8');
  const parsed = JSON.parse(raw) as { paths?: Record<string, Record<string, unknown>> };
  const pathsRecord = parsed.paths ?? {};

  const byTag = new Map<string, MessagingSpecTag>();
  const byMethod = new Map<MessagingMethod, MessagingSpecEndpoint[]>();

  for (const method of MessagingProvider_METHODS) {
    byMethod.set(method, []);
  }

  let endpointCount = 0;

  for (const [pathTemplate, operations] of Object.entries(pathsRecord)) {
    for (const [rawMethod, operationUnknown] of Object.entries(operations)) {
      const method = rawMethod.toUpperCase();
      if (!MessagingProvider_METHODS.includes(method as MessagingMethod)) {
        continue;
      }

      const operation = (operationUnknown ?? {}) as Record<string, unknown>;
      const tags = Array.isArray(operation.tags) && operation.tags.length > 0
        ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
        : ['Uncategorized'];
      const summary = typeof operation.summary === 'string' ? operation.summary : '';
      const operationId = typeof operation.operationId === 'string' ? operation.operationId : null;
      const hasRequestBody = typeof operation.requestBody === 'object' && operation.requestBody !== null;
      const responses = typeof operation.responses === 'object' && operation.responses !== null
        ? Object.keys(operation.responses as Record<string, unknown>)
        : [];

      const endpoint: MessagingSpecEndpoint = {
        id: `${method} ${pathTemplate}`,
        method: method as MessagingMethod,
        pathTemplate,
        summary,
        operationId,
        parameters: {
          path: extractParameterNames(operation, 'path'),
          query: extractParameterNames(operation, 'query'),
        },
        hasRequestBody,
        responseStatusCodes: responses,
      };

      endpointCount += 1;
      const methodList = byMethod.get(method as MessagingMethod);
      if (methodList) {
        methodList.push(endpoint);
      }

      for (const tagName of tags) {
        const existingTag = byTag.get(tagName);
        if (!existingTag) {
          byTag.set(tagName, { name: tagName, endpoints: [endpoint] });
          continue;
        }
        existingTag.endpoints.push(endpoint);
      }
    }
  }

  cachedSpec = {
    fromPath: specPath,
    byTag,
    byMethod,
    totalEndpoints: endpointCount,
  };
  return cachedSpec;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const SessionIdParamsSchema = z.object({
  id: z.string().min(1),
});

function toSessionStatus(status: unknown): string {
  if (typeof status !== 'string' || status.length === 0) {
    return 'OFFLINE';
  }

  if (status === 'active' || status === 'ACTIVE') {
    return 'WORKING';
  }

  return status.toUpperCase();
}

export async function registerAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/admin/me', {
    schema: {
      description: 'Owner-only profile for admin dashboard session bootstrap',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                role: { type: 'string' },
              }
            },
            session: {
              type: 'object',
              properties: {
                expiresAt: { type: 'string' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
  }, async (request, reply) => {
    const sessionToken = getSessionTokenFromCookies(request.headers.cookie);
    if (!sessionToken) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    await dbConnect();
    const { AuthSessionModel, UserModel, normalizeStoredUserRole } = await import('@noxivo/database');
    const authSession = await AuthSessionModel.findOne({
      sessionTokenHash: hashSessionToken(sessionToken),
      expiresAt: { $gt: new Date() }
    }).lean();

    if (!authSession) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = await UserModel.findById(authSession.userId).lean();
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.status(200).send({
      user: {
        id: user._id,
        email: user.email,
        name: user.fullName,
        role: normalizeStoredUserRole(user.role as string),
      },
      session: {
        expiresAt: authSession.expiresAt instanceof Date
          ? authSession.expiresAt.toISOString()
          : new Date(authSession.expiresAt).toISOString(),
      }
    });
  });

  fastify.post('/api/v1/admin/logout', {
    schema: {
      description: 'Owner-only admin logout that clears dashboard session cookie',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    },
  }, async (request, reply) => {
    const sessionToken = getSessionTokenFromCookies(request.headers.cookie);
    if (sessionToken) {
      await dbConnect();
      const { AuthSessionModel } = await import('@noxivo/database');
      await AuthSessionModel.deleteOne({
        sessionTokenHash: hashSessionToken(sessionToken)
      }).exec();
    }

    reply.clearCookie(AUTH_SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    return reply.status(200).send({ success: true });
  });

  fastify.get('/api/v1/admin/messaging/spec', {
    schema: {
      description: 'Owner-only metadata view of Messaging Provider OpenAPI grouped by tags for API explorer',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  endpoints: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        method: { type: 'string' },
                        pathTemplate: { type: 'string' },
                        summary: { type: 'string' },
                        operationId: { type: ['string', 'null'] },
                        parameters: {
                          type: 'object',
                          properties: {
                            path: { type: 'array', items: { type: 'string' } },
                            query: { type: 'array', items: { type: 'string' } },
                          }
                        },
                        hasRequestBody: { type: 'boolean' },
                        responseStatusCodes: { type: 'array', items: { type: 'string' } },
                      }
                    }
                  }
                }
              }
            },
            totalEndpoints: { type: 'number' },
            generatedAt: { type: 'string' },
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          }
        }
      }
    },
  }, async (request, reply) => {
    try {
      const spec = await loadMessagingSpec();
      const tags = Array.from(spec.byTag.values())
        .map((tag) => ({
          name: tag.name,
          endpoints: [...tag.endpoints].sort((a, b) =>
            a.pathTemplate.localeCompare(b.pathTemplate) || a.method.localeCompare(b.method)
          )
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return reply.status(200).send({
        tags,
        totalEndpoints: spec.totalEndpoints,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      request.log.warn(
        { err: error },
        'MessagingProvider spec unavailable for explorer metadata route; returning empty spec payload'
      );
      return reply.status(200).send({
        tags: [],
        totalEndpoints: 0,
        generatedAt: new Date().toISOString(),
      });
    }
  });

  fastify.post('/api/v1/admin/messaging/request', {
    schema: {
      description: 'Owner-only MessagingProvider explorer request executor with path+method allowlist validation',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['method', 'path'],
        properties: {
          method: { type: 'string', enum: [...MessagingProvider_METHODS] },
          path: { type: 'string' },
          query: { type: 'object' },
          body: { description: 'Optional JSON request body forwarded upstream' },
        }
      }
    },
  }, async (request, reply) => {
    try {
      const payload = AdminMessagingRequestSchema.parse(request.body);
      const method = payload.method.toUpperCase() as MessagingMethod;
      const pathOnly = payload.path.split('?')[0]?.trim() ?? '';

      if (!pathOnly.startsWith('/')) {
        return reply.status(400).send({
          origin: 'engine',
          status: 400,
          headers: {},
          body: { error: 'Path must start with "/"' },
        });
      }

      let spec: Awaited<ReturnType<typeof loadMessagingSpec>> | null = null;
      try {
        spec = await loadMessagingSpec();
      } catch (error) {
        request.log.warn(
          { err: error },
          'MessagingProvider spec unavailable; falling back to bounded /api/* proxy policy for admin explorer requests'
        );
      }

      if (spec) {
        const methodEndpoints = spec.byMethod.get(method) ?? [];
        const isAllowed = methodEndpoints.some((endpoint) => pathMatchesTemplate(pathOnly, endpoint.pathTemplate));

        if (!isAllowed) {
          return reply.status(400).send({
            origin: 'engine',
            status: 400,
            headers: {},
            body: { error: `Path "${pathOnly}" is not allowlisted for ${method}` },
          });
        }
      } else if (!pathOnly.startsWith('/api/') || pathOnly.includes('..')) {
        return reply.status(400).send({
          origin: 'engine',
          status: 400,
          headers: {},
          body: { error: `Path "${pathOnly}" is not allowed without loaded MessagingProvider spec` },
        });
      }

      const target = new URL(`${getMessagingBaseUrl()}${pathOnly}`);
      if (payload.query) {
        for (const [key, rawValue] of Object.entries(payload.query)) {
          if (rawValue === null) {
            continue;
          }

          if (Array.isArray(rawValue)) {
            for (const item of rawValue) {
              target.searchParams.append(key, String(item));
            }
            continue;
          }

          target.searchParams.append(key, String(rawValue));
        }
      }

      const upstreamHeaders = new Headers();
      upstreamHeaders.set('X-Api-Key', getMessagingApiKey());

      const hasBody = method !== 'GET' && method !== 'DELETE' && payload.body !== undefined;
      if (hasBody) {
        upstreamHeaders.set('Content-Type', 'application/json');
      }

      const upstreamResponse = await fetch(target, {
        method,
        headers: upstreamHeaders,
        ...(hasBody ? { body: JSON.stringify(payload.body) } : {}),
      });

      const safeHeaders: Record<string, string> = {};
      upstreamResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          return;
        }
        safeHeaders[key] = value;
      });

      const contentType = upstreamResponse.headers.get('content-type') ?? '';
      let body: unknown;
      if (contentType.includes('application/json')) {
        body = await upstreamResponse.json().catch(() => ({ message: 'Invalid JSON response' }));
      } else {
        body = await upstreamResponse.text();
      }

      return reply.status(upstreamResponse.status).send({
        origin: 'messaging_upstream',
        status: upstreamResponse.status,
        headers: safeHeaders,
        body,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({
        origin: 'engine',
        status: 400,
        headers: {},
        body: {
          error: error instanceof Error ? error.message : 'Invalid request',
        },
      });
    }
  });

  fastify.get('/api/v1/admin/sessions', {
    schema: {
      description: 'Owner-only Mission Control hierarchical sessions payload (Agency -> Client -> Sessions)',
      tags: ['Admin'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agencyId: { type: 'string', example: 'agency_123' },
              agencyName: { type: 'string', example: 'Noxivo Agency' },
              agencySlug: { type: 'string', example: 'noxivo-agency' },
              clients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tenantId: { type: 'string', example: 'tenant_456' },
                    tenantName: { type: 'string', example: 'Acme Corp' },
                    tenantSlug: { type: 'string', example: 'acme-corp' },
                    sessions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
                          name: { type: 'string', example: 'wa_agency_123_tenant_456' },
                          status: { type: 'string', example: 'CONNECTED' },
                          phone: { type: 'string', example: '1234567890' },
                          accountName: { type: 'string', example: 'Acme Support' },
                          platform: { type: 'string', example: 'WEBJS' },
                          server: { type: 'string', example: 'MessagingProvider' },
                          metadata: {
                            type: 'object',
                            properties: {
                              agencyId: { type: 'string', example: 'agency_123' },
                              tenantId: { type: 'string', example: 'tenant_456' },
                              clusterId: { type: 'string', example: 'cluster_789' },
                              sessionBindingId: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
  }, async (_request, reply) => {
    await dbConnect();
    const { MessagingSessionBindingModel } = await import('@noxivo/database');

    const bindings = await MessagingSessionBindingModel.aggregate<{
      _id: { toString(): string };
      agencyId: { toString(): string };
      tenantId: { toString(): string };
      clusterId: { toString(): string };
      messagingSessionName: string;
      status: string;
      agencyName: string;
      agencySlug: string;
      tenantName: string;
      tenantSlug: string;
    }>([
      {
        $lookup: {
          from: 'agencies',
          localField: 'agencyId',
          foreignField: '_id',
          as: 'agency',
        },
      },
      {
        $unwind: {
          path: '$agency',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'tenants',
          localField: 'tenantId',
          foreignField: '_id',
          as: 'tenant',
        },
      },
      {
        $unwind: {
          path: '$tenant',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          agencyId: 1,
          tenantId: 1,
          clusterId: 1,
          messagingSessionName: 1,
          status: 1,
          agencyName: { $ifNull: ['$agency.name', 'Unknown Agency'] },
          agencySlug: { $ifNull: ['$agency.slug', 'unknown-agency'] },
          tenantName: { $ifNull: ['$tenant.name', 'Unknown Client'] },
          tenantSlug: { $ifNull: ['$tenant.slug', 'unknown-client'] },
        },
      },
      {
        $sort: {
          agencyName: 1,
          tenantName: 1,
          messagingSessionName: 1,
        },
      },
    ]).exec();

    const liveSessionsPayload = await proxyToMessaging('/api/sessions?all=true');
    const liveSessions = Array.isArray(liveSessionsPayload) ? liveSessionsPayload : [];
    const liveSessionMap = new Map<string, any>();

    for (const liveSession of liveSessions) {
      if (typeof liveSession?.name === 'string' && liveSession.name.length > 0) {
        liveSessionMap.set(liveSession.name, liveSession);
      }
    }

    const agencyMap = new Map<string, {
      agencyId: string;
      agencyName: string;
      agencySlug: string;
      clients: Map<string, {
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        sessions: Array<{
          id: string;
          name: string;
          status: string;
          phone: string | null;
          accountName: string;
          platform: string;
          server: string;
          metadata: {
            agencyId: string;
            tenantId: string;
            clusterId: string;
            sessionBindingId: string;
          };
        }>;
      }>;
    }>();

    for (const binding of bindings) {
      const sessionName = binding.messagingSessionName;
      const liveSession = liveSessionMap.get(sessionName);
      liveSessionMap.delete(sessionName);
      const agencyId = binding.agencyId.toString();
      const tenantId = binding.tenantId.toString();
      const sessionBindingId = binding._id.toString();
      const clusterId = binding.clusterId.toString();

      const sessionItem = {
        id: sessionBindingId,
        name: sessionName,
        status: typeof liveSession?.status === 'string' ? liveSession.status : toSessionStatus(binding.status),
        phone: typeof liveSession?.me?.id === 'string' ? liveSession.me.id.split('@')[0] : null,
        accountName: typeof liveSession?.me?.name === 'string' ? liveSession.me.name : 'Unknown User',
        platform: typeof liveSession?.config?.proxy === 'string' ? liveSession.config.proxy : 'WEBJS (2026.3.4 PLUS)',
        server: 'MessagingProvider',
        metadata: {
          agencyId,
          tenantId,
          clusterId,
          sessionBindingId,
        },
      };

      let agencyEntry = agencyMap.get(agencyId);
      if (!agencyEntry) {
        agencyEntry = {
          agencyId,
          agencyName: binding.agencyName,
          agencySlug: binding.agencySlug,
          clients: new Map(),
        };
        agencyMap.set(agencyId, agencyEntry);
      }

      let clientEntry = agencyEntry.clients.get(tenantId);
      if (!clientEntry) {
        clientEntry = {
          tenantId,
          tenantName: binding.tenantName,
          tenantSlug: binding.tenantSlug,
          sessions: [],
        };
        agencyEntry.clients.set(tenantId, clientEntry);
      }

      clientEntry.sessions.push(sessionItem);
    }

    if (liveSessionMap.size > 0) {
      const orphanedAgencyId = 'unassigned_agency';
      const orphanedTenantId = 'unassigned_tenant';
      let agencyEntry = agencyMap.get(orphanedAgencyId);
      if (!agencyEntry) {
        agencyEntry = {
          agencyId: orphanedAgencyId,
          agencyName: 'Unassigned / Orchestrator',
          agencySlug: 'unassigned',
          clients: new Map(),
        };
        agencyMap.set(orphanedAgencyId, agencyEntry);
      }

      let clientEntry = agencyEntry.clients.get(orphanedTenantId);
      if (!clientEntry) {
        clientEntry = {
          tenantId: orphanedTenantId,
          tenantName: 'MessagingProvider Direct Sessions',
          tenantSlug: 'messaging-direct',
          sessions: [],
        };
        agencyEntry.clients.set(orphanedTenantId, clientEntry);
      }

      for (const [sessionName, liveSession] of liveSessionMap.entries()) {
        clientEntry.sessions.push({
          id: sessionName,
          name: sessionName,
          status: typeof liveSession?.status === 'string' ? liveSession.status : 'UNKNOWN',
          phone: typeof liveSession?.me?.id === 'string' ? liveSession.me.id.split('@')[0] : null,
          accountName: typeof liveSession?.me?.name === 'string' ? liveSession.me.name : 'Unknown User',
          platform: typeof liveSession?.config?.proxy === 'string' ? liveSession.config.proxy : 'WEBJS',
          server: 'MessagingProvider',
          metadata: {
            agencyId: orphanedAgencyId,
            tenantId: orphanedTenantId,
            clusterId: 'unknown',
            sessionBindingId: sessionName,
          },
        });
      }
    }

    const payload = Array.from(agencyMap.values()).map((agency) => ({
      agencyId: agency.agencyId,
      agencyName: agency.agencyName,
      agencySlug: agency.agencySlug,
      clients: Array.from(agency.clients.values()),
    }));

    return reply.status(200).send(payload);
  });

  fastify.post('/api/v1/admin/sessions/:id/start', {
    schema: {
      description: 'Owner-only start MessagingProvider session binding by id',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = SessionIdParamsSchema.parse(request.params);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/start`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.post('/api/v1/admin/sessions/:id/stop', {
    schema: {
      description: 'Owner-only stop MessagingProvider session binding by id',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = SessionIdParamsSchema.parse(request.params);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/stop`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.post('/api/v1/admin/sessions/:id/logout', {
    schema: {
      description: 'Owner-only logout MessagingProvider session binding by id',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = SessionIdParamsSchema.parse(request.params);
    const resolved = await resolveMessagingSessionName(id);
    await proxyToMessaging(`/api/sessions/${resolved.sessionName}/logout`, { method: 'POST' });
    return reply.status(200).send({ success: true });
  });

  fastify.get('/api/v1/admin/sessions/:id/status', {
    schema: {
      description: 'Owner-only session status by binding id',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = SessionIdParamsSchema.parse(request.params);
    const resolved = await resolveMessagingSessionName(id);
    const status = await proxyToMessaging(`/api/sessions/${resolved.sessionName}`);
    return reply.status(200).send(status);
  });

  fastify.get('/api/v1/admin/sessions/:id/qr', {
    schema: {
      description: 'Owner-only QR payload by binding id',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = SessionIdParamsSchema.parse(request.params);
    const resolved = await resolveMessagingSessionName(id);
    try {
      const qrData = await proxyToMessaging(`/api/${resolved.sessionName}/auth/qr?format=raw`);
      return reply.status(200).send({ code: extractQrToken(qrData) });
    } catch (error: any) {
      if (error.status === 422) {
        return reply.status(200).send({
          code: '',
          message: 'Session already connected'
        });
      }
      throw error;
    }
  });

  fastify.post('/api/v1/admin/sessions/bootstrap', {
    schema: {
      description: 'Owner-only bootstrap a WhatsApp session for an agency/tenant pair',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['agencyId', 'tenantId'],
        properties: {
          agencyId: { type: 'string', example: 'agency_123' },
          tenantId: { type: 'string', example: 'tenant_456' },
          accountName: { type: 'string', example: 'Noxivo Sales' }
        }
      },
    },
  }, async (request, reply) => {
    await dbConnect();
    const body = MessagingSessionBootstrapRequestSchema.parse(request.body);
    const service = new MessagingSessionService();

    try {
      const result = await service.bootstrap(body.agencyId, body.tenantId, body.accountName);
      return reply.status(200).send({
        sessionName: result.sessionName,
        status: result.status,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to bootstrap session'
      });
    }
  });

  fastify.get('/api/v1/admin/workers/status', {
    schema: {
      description: 'Owner-only worker and queue status',
      tags: ['Admin'],
    },
  }, async (_request, reply) => {
    const queue = getWorkflowContinuationQueue();
    if (!queue) {
      return reply.status(503).send({ error: 'Queue system not initialized' });
    }

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

    return reply.status(200).send({
      queues: [{
        name: queue.name,
        ...counts,
      }],
    });
  });

  fastify.get('/api/v1/admin/events/stream', {
    schema: {
      description: 'Owner-only Mission Control event stream',
      tags: ['Admin'],
    },
  }, (request, reply) => {
    reply.sse((async function* eventGenerator() {
      yield { data: JSON.stringify({ type: 'system', message: 'Mission Control event stream attached' }) };

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        yield { data: JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }) };
      }
    })());
  });

  fastify.post('/api/v1/admin/login', {
    schema: {
      description: 'Owner-only login for standalone Admin SPA',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'owner@noxivo.ai' },
          password: { type: 'string', example: 'p@ssw0rd123' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', example: '64a1b2c3d4e5f6g7h8i9j0k1' },
                email: { type: 'string', example: 'owner@noxivo.ai' },
                name: { type: 'string', example: 'Noxivo Owner' },
                role: { type: 'string', example: 'owner' },
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
  }, async (request, reply) => {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(request.body);

    await dbConnect();
    const { UserModel, AuthSessionModel, normalizeStoredUserRole, verifyPassword } = await import('@noxivo/database');

    const user = await UserModel.findOne({ email }).lean();
    if (!user || !user.passwordHash || user.status !== 'active') {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Role check - only allow owners/admins to access the engine dashboard
    const role = normalizeStoredUserRole(user.role as string);
    if (role !== 'owner') {
      return reply.status(403).send({ error: 'Access denied: Requires platform owner role' });
    }

    // Resolve agencyId and tenantId for the session
    const agencyId = user.agencyId || user.memberships?.[0]?.agencyId;
    if (!agencyId) {
      return reply.status(500).send({ error: 'User does not belong to any agency' });
    }

    let tenantId = user.defaultTenantId || user.memberships?.[0]?.defaultTenantId || user.tenantIds?.[0] || user.memberships?.[0]?.tenantIds?.[0];
    if (!tenantId) {
      const { TenantModel } = await import('@noxivo/database');
      const fallbackTenant = await TenantModel.findOne({ agencyId }).lean();
      if (!fallbackTenant) {
        return reply.status(500).send({ error: 'No tenant found for user agency' });
      }
      tenantId = fallbackTenant._id;
    }

    // Create session
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await AuthSessionModel.create({
      userId: user._id,
      agencyId,
      tenantId,
      sessionTokenHash: hashSessionToken(sessionToken),
      expiresAt,
    });

    // Set cookie
    const isProd = process.env.NODE_ENV === 'production';
    reply.setCookie('noxivo_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      expires: expiresAt,
    });

    return reply.status(200).send({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.fullName,
        role,
      },
    });
  });
}
