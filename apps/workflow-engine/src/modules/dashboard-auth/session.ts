import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthSessionModel, UserModel } from '@noxivo/database';
import { dbConnect } from '../../lib/mongodb.js';
import { getSessionFromRequest, type SessionRecord } from '../agency/session-auth.js';

export const AUTH_SESSION_COOKIE_NAME = 'noxivo_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(input: {
  userId: string;
  agencyId: string;
  tenantId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  if (!input.agencyId || !input.agencyId.trim()) {
    throw new Error('AuthSession validation failed: agencyId is required');
  }
  if (!input.tenantId || !input.tenantId.trim()) {
    throw new Error('No workspace assigned. Please contact your administrator.');
  }

  await dbConnect();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await AuthSessionModel.create({
    userId: input.userId,
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
    lastSeenAt: new Date(),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  await UserModel.findByIdAndUpdate(input.userId, { lastLoginAt: new Date() }).exec();

  return { token, expiresAt };
}

export function attachSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  const isProd = process.env.NODE_ENV === 'production';
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  const isProd = process.env.NODE_ENV === 'production';
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    expires: new Date(0),
  });
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await dbConnect();
  await AuthSessionModel.deleteOne({ sessionTokenHash: hashSessionToken(token) }).exec();
}

export async function getCurrentSession(request: FastifyRequest): Promise<SessionRecord | null> {
  return getSessionFromRequest(request);
}
