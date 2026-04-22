import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticateUser, getAgencyBrandingBySlug, signupWithAgency } from '../service.js';
import {
  AUTH_SESSION_COOKIE_NAME,
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  getCurrentSession,
} from '../session.js';

type AuthErrorContext = 'login' | 'signup' | 'logout' | 'session';

const SIGNUP_DOMAIN_ERROR_MESSAGES = new Set([
  'An account with this email already exists',
  'Invitation is invalid or expired',
  'Invitation email does not match the signup email',
  'Invited agency has no available tenant access',
  'Agency name is required',
]);

const REQUEST_DOMAIN_ERROR_MESSAGES = new Set([
  'No workspace assigned. Please contact your administrator.',
  'AuthSession validation failed: agencyId is required',
  'AuthSession validation failed: tenantId is required',
]);

function isValidationError(error: Error): boolean {
  return error.name === 'ZodError';
}

export function mapDashboardAuthError(error: unknown, context: AuthErrorContext): { statusCode: number; message: string } {
  if (!(error instanceof Error)) {
    return { statusCode: 500, message: 'Internal server error' };
  }

  if (error.message === 'Invalid email or password') {
    return { statusCode: 401, message: 'Invalid email or password' };
  }

  if (isValidationError(error) || REQUEST_DOMAIN_ERROR_MESSAGES.has(error.message)) {
    return { statusCode: 400, message: 'Invalid request' };
  }

  if (context === 'signup' && SIGNUP_DOMAIN_ERROR_MESSAGES.has(error.message)) {
    return { statusCode: 400, message: error.message };
  }

  return { statusCode: 500, message: 'Internal server error' };
}

function sendMappedAuthError(reply: FastifyReply, error: unknown, context: AuthErrorContext) {
  const mapped = mapDashboardAuthError(error, context);
  return reply.status(mapped.statusCode).send({ error: mapped.message });
}

function firstHeaderValue(headerValue: string | string[] | undefined): string | null {
  if (typeof headerValue === 'string') {
    return headerValue;
  }
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }
  return null;
}

export async function dashboardAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/branding/:agencySlug', async (request, reply) => {
    try {
      const rawAgencySlug =
        request.params && typeof request.params === 'object' && !Array.isArray(request.params)
          ? (request.params as { agencySlug?: unknown }).agencySlug
          : undefined;

      if (typeof rawAgencySlug !== 'string' || rawAgencySlug.trim().length === 0) {
        return reply.status(400).send({ error: 'Invalid request' });
      }

      const branding = await getAgencyBrandingBySlug(rawAgencySlug);
      if (!branding) {
        return reply.status(404).send({ error: 'Not found' });
      }

      return reply.status(200).send(branding);
    } catch (error) {
      request.log.error({ error }, 'Dashboard auth branding lookup failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/login', async (request, reply) => {
    try {
      const user = await authenticateUser(request.body);
      const { token, expiresAt } = await createSession({
        userId: user.id,
        agencyId: user.agencyId,
        tenantId: user.tenantId,
        ipAddress: firstHeaderValue(request.headers['x-forwarded-for']) ?? request.ip,
        userAgent: firstHeaderValue(request.headers['user-agent']),
      });

      attachSessionCookie(reply, token, expiresAt);
      return reply.status(200).send({ user });
    } catch (error) {
      request.log.error({ error }, 'Dashboard auth login failed');
      return sendMappedAuthError(reply, error, 'login');
    }
  });

  fastify.post('/signup', async (request, reply) => {
    try {
      const user = await signupWithAgency(request.body);
      const { token, expiresAt } = await createSession({
        userId: user.id,
        agencyId: user.agencyId,
        tenantId: user.tenantId,
        ipAddress: firstHeaderValue(request.headers['x-forwarded-for']) ?? request.ip,
        userAgent: firstHeaderValue(request.headers['user-agent']),
      });

      attachSessionCookie(reply, token, expiresAt);
      return reply.status(200).send({ user });
    } catch (error) {
      request.log.error({ error }, 'Dashboard auth signup failed');
      return sendMappedAuthError(reply, error, 'signup');
    }
  });

  fastify.post('/logout', async (request, reply) => {
    try {
      const token = request.cookies?.[AUTH_SESSION_COOKIE_NAME];
      if (token) {
        await deleteSessionByToken(token);
      }

      clearSessionCookie(reply);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      request.log.error({ error }, 'Dashboard auth logout failed');
      return sendMappedAuthError(reply, error, 'logout');
    }
  });

  fastify.get('/session', async (request, reply) => {
    try {
      const session = await getCurrentSession(request);
      if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      return reply.status(200).send({ user: session.actor });
    } catch (error) {
      request.log.error({ error }, 'Dashboard auth session lookup failed');
      return sendMappedAuthError(reply, error, 'session');
    }
  });
}
