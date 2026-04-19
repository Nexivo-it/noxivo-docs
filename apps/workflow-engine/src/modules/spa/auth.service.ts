import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type mongoose from 'mongoose';
import { SpaMemberModel, SpaSessionModel } from '@noxivo/database';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function hashSpaSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function serializeSpaMember(member: {
  _id: mongoose.Types.ObjectId | string;
  email: string;
  fullName: string;
  role: 'member' | 'admin';
  status: 'active' | 'suspended';
}) {
  return {
    id: String(member._id),
    email: member.email,
    fullName: member.fullName,
    role: member.role,
    status: member.status,
  };
}

export async function createSpaMember(input: {
  agencyId: mongoose.Types.ObjectId;
  email: string;
  password: string;
  fullName: string;
  phone?: string | undefined;
}) {
  const member = await SpaMemberModel.create({
    agencyId: input.agencyId,
    email: input.email,
    passwordHash: hashPassword(input.password),
    fullName: input.fullName,
    phone: input.phone ?? null,
    role: 'member',
    status: 'active',
  });

  return member;
}

export async function createSpaSession(input: {
  agencyId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await SpaSessionModel.create({
    agencyId: input.agencyId,
    memberId: input.memberId,
    tokenHash: hashSpaSessionToken(token),
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return { token, expiresAt };
}

export async function findSpaMemberByCredentials(input: {
  agencyId: mongoose.Types.ObjectId;
  email: string;
  password: string;
}) {
  const member = await SpaMemberModel.findOne({ agencyId: input.agencyId, email: input.email }).exec();
  if (!member) {
    return null;
  }

  if (!verifyPassword(input.password, member.passwordHash)) {
    return null;
  }

  return member;
}
