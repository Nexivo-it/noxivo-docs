import { redirect } from 'next/navigation';
import { getCurrentSession, type SessionRecord } from './session';

export async function requireCurrentSession(): Promise<SessionRecord> {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/auth/login');
  }

  return session;
}

export async function getOptionalCurrentSession(): Promise<SessionRecord | null> {
  return getCurrentSession();
}
