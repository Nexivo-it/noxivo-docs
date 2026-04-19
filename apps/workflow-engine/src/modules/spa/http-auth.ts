import { type FastifyReply, type FastifyRequest } from 'fastify';
import { SpaMemberModel, SpaSessionModel } from '@noxivo/database';
import { hashSpaSessionToken } from './auth.service.js';

export const SPA_SESSION_COOKIE_NAME = 'spa_member_session';

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const fragment of cookieHeader.split(';')) {
    const [rawKey, ...rest] = fragment.split('=');
    if (!rawKey || rest.length === 0) {
      continue;
    }

    if (rawKey.trim() !== name) {
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

export async function getSpaMemberFromRequest(request: FastifyRequest) {
  const sessionToken = readCookieValue(request.headers.cookie, SPA_SESSION_COOKIE_NAME);
  if (!sessionToken) {
    return null;
  }

  const session = await SpaSessionModel.findOne({
    tokenHash: hashSpaSessionToken(sessionToken),
    expiresAt: { $gt: new Date() },
    revokedAt: null,
  }).lean();

  if (!session) {
    return null;
  }

  const member = await SpaMemberModel.findById(session.memberId).lean();
  if (!member || member.status !== 'active') {
    return null;
  }

  return member;
}

export async function requireSpaMember(request: FastifyRequest, reply: FastifyReply) {
  const member = await getSpaMemberFromRequest(request);
  if (!member) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return null;
  }

  return member;
}

export async function requireSpaAdmin(request: FastifyRequest, reply: FastifyReply) {
  const member = await requireSpaMember(request, reply);
  if (!member) {
    return null;
  }

  if (member.role !== 'admin') {
    await reply.status(403).send({ error: 'Forbidden' });
    return null;
  }

  return member;
}
