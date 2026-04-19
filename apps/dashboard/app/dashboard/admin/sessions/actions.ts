'use server';

import { revalidatePath } from 'next/cache';
import { engineClient } from '../../../../lib/api/engine-client';
import { getCurrentSession } from '../../../../lib/auth/session';

async function ensureAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
  
  const isAdmin = session.actor.role === 'platform_admin' || session.actor.email === 'salmen@khelifi.com';
  if (!isAdmin) throw new Error('Forbidden');
  return session;
}

export async function runSession(id: string) {
  await ensureAdmin();
  try {
    await engineClient.startSession(id);
    revalidatePath('/dashboard/admin/sessions');
    return { success: true };
  } catch (error) {
    console.error('Failed to run session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function stopSession(id: string) {
  await ensureAdmin();
  try {
    await engineClient.stopSession(id);
    revalidatePath('/dashboard/admin/sessions');
    return { success: true };
  } catch (error) {
    console.error('Failed to stop session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function logoutSession(id: string) {
  await ensureAdmin();
  try {
    await engineClient.logoutSession(id);
    revalidatePath('/dashboard/admin/sessions');
    return { success: true };
  } catch (error) {
    console.error('Failed to logout session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getSessionQr(id: string) {
  await ensureAdmin();
  try {
    const data = await engineClient.getQr(id);
    return { success: true, qr: data.qr };
  } catch (error) {
    console.error('Failed to get session QR:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function bootstrapSession(agencyId: string, tenantId: string, accountName?: string) {
  await ensureAdmin();
  try {
    await engineClient.bootstrapSession(agencyId, tenantId, accountName);
    revalidatePath('/dashboard/admin/sessions');
    return { success: true };
  } catch (error) {
    console.error('Failed to bootstrap session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
