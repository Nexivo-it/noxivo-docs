import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { WebhookModel } from '@noxivo/database';
import { GET as listAgencyWebhooks, POST as createAgencyWebhook } from '../app/api/v1/agency/webhooks/route.js';
import { PUT as updateAgencyWebhook, DELETE as deleteAgencyWebhook } from '../app/api/v1/agency/webhooks/[webhookId]/route.js';
import { connectDashboardTestDb, disconnectDashboardTestDb, resetDashboardTestDb } from './helpers/mongo-memory.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

function makeRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown): Request {
  return new Request('http://localhost/api/v1/agency/webhooks', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function makeWebhookContext(webhookId: string): { params: Promise<{ webhookId: string }> } {
  return { params: Promise.resolve({ webhookId }) };
}

describe('agency webhooks routes', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-agency-webhooks-tests' });
  });

  beforeEach(() => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockGetCurrentSession.mockResolvedValue(null);

    const response = await listAgencyWebhooks();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('creates, lists, updates, and deletes agency webhooks in the current agency scope', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const createResponse = await createAgencyWebhook(makeRequest('POST', {
      name: 'Bookings Webhook',
      url: 'https://example.com/webhook',
      events: ['booking.created'],
      secret: 'super-secret',
      isActive: true,
    }));
    const created = await createResponse.json() as { id: string; name: string; url: string; events: string[]; isActive: boolean };

    expect(createResponse.status).toBe(201);
    expect(created).toMatchObject({
      name: 'Bookings Webhook',
      url: 'https://example.com/webhook',
      events: ['booking.created'],
      isActive: true,
    });

    const listResponse = await listAgencyWebhooks();
    const listed = await listResponse.json() as Array<Record<string, unknown>>;
    expect(listResponse.status).toBe(200);
    expect(listed).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Bookings Webhook',
        secret: '***REDACTED***',
      }),
    ]);

    const storedWebhook = await WebhookModel.findById(created.id).lean().exec();
    expect(storedWebhook?.agencyId.toString()).toBe(agencyId);
    expect(storedWebhook?.secret).toBe('super-secret');

    const updateResponse = await updateAgencyWebhook(
      makeRequest('PUT', {
        name: 'Updated Webhook',
        url: 'https://example.com/updated',
        events: ['booking.updated'],
        secret: '',
        isActive: false,
      }),
      makeWebhookContext(created.id),
    );
    const updated = await updateResponse.json() as { id: string; name: string; url: string; events: string[]; isActive: boolean };
    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      name: 'Updated Webhook',
      url: 'https://example.com/updated',
      events: ['booking.updated'],
      isActive: false,
    });

    const afterUpdate = await WebhookModel.findById(created.id).lean().exec();
    expect(afterUpdate?.secret).toBe('super-secret');

    const deleteResponse = await deleteAgencyWebhook(makeRequest('DELETE'), makeWebhookContext(created.id));
    const deleted = await deleteResponse.json() as { success: boolean };
    expect(deleteResponse.status).toBe(200);
    expect(deleted.success).toBe(true);
    expect(await WebhookModel.findById(created.id).lean().exec()).toBeNull();
  });
});
