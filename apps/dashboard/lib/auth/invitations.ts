import { createHash, randomBytes } from 'crypto';

const INVITATION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export function createInvitationToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createInvitationExpiryDate(): Date {
  return new Date(Date.now() + INVITATION_DURATION_MS);
}
