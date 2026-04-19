import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { WebhookInboxSourceModel } from '@noxivo/database';
import {
  GET as listWebhookInboxSources,
  POST as createWebhookInboxSource,
} from '../app/api/settings/webhook-inbox-sources/route.js';
import {
  PATCH as updateWebhookInboxSource,
} from '../app/api/settings/webhook-inbox-sources/[sourceId]/route.js';
import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb,
} from './helpers/mongo-memory.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

type WebhookInboxSourceDto = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  inboundPath: string;
  outboundUrl: string;
  outboundHeaders: Record<string, string>;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  inboundSecretHash?: string;
  inboundSecret?: string;
};

function makeRequest(method: 'GET' | 'POST' | 'PATCH', body?: unknown): Request {
  return new Request('http://localhost/api/settings/webhook-inbox-sources', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function makePatchContext(sourceId: string): { params: Promise<{ sourceId: string }> } {
  return {
    params: Promise.resolve({ sourceId }),
  };
}

describe('settings webhook inbox sources routes', () => {
  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-settings-webhook-inbox-sources-tests' });
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

    const response = await listWebhookInboxSources();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('returns 403 when actor lacks credential management scope', async () => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'agent@example.com',
        fullName: 'Agent User',
        role: 'agency_member',
        scopeRole: 'agent',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await listWebhookInboxSources();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });

  it('creates and lists webhook inbox sources without leaking inbound secret hashes', async () => {
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId,
        tenantId,
        tenantIds: [tenantId],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const createResponse = await createWebhookInboxSource(makeRequest('POST', {
      name: 'Website Chatbot',
      outboundUrl: 'https://example.com/outbound',
      inboundSecret: 'test-secret',
      outboundHeaders: {
        Authorization: 'Bearer outbound-token',
      },
    }));
    const createPayload = await createResponse.json() as { source: WebhookInboxSourceDto };

    expect(createResponse.status).toBe(201);
    expect(createPayload.source).toMatchObject({
      name: 'Website Chatbot',
      status: 'active',
      outboundUrl: 'https://example.com/outbound',
      outboundHeaders: {
        Authorization: 'Bearer outbound-token',
      },
    });
    expect(createPayload.source.inboundPath).toBeTruthy();
    expect(createPayload.source.inboundSecretHash).toBeUndefined();
    expect(createPayload.source.inboundSecret).toBeUndefined();

    const storedSource = await WebhookInboxSourceModel.findOne({
      agencyId,
      tenantId,
      name: 'Website Chatbot',
    }).lean().exec();

    expect(storedSource).toBeTruthy();
    expect(storedSource?.outboundUrl).toBe('https://example.com/outbound');
    expect(storedSource?.outboundHeaders).toMatchObject({
      Authorization: 'Bearer outbound-token',
    });
    expect(storedSource?.inboundSecretHash).toBeTruthy();
    expect(storedSource?.inboundSecretHash).not.toBe('test-secret');

    const listResponse = await listWebhookInboxSources();
    const listPayload = await listResponse.json() as { sources: WebhookInboxSourceDto[] };

    expect(listResponse.status).toBe(200);
    expect(listPayload.sources).toEqual([
      expect.objectContaining({
        id: storedSource?._id.toString(),
        name: 'Website Chatbot',
        status: 'active',
      }),
    ]);
    expect(listPayload.sources[0]?.inboundSecretHash).toBeUndefined();
    expect(listPayload.sources[0]?.inboundSecret).toBeUndefined();
  });

  it('updates webhook inbox source metadata and rotates the inbound secret hash', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const source = await WebhookInboxSourceModel.create({
      agencyId,
      tenantId,
      name: 'Website Chatbot',
      status: 'active',
      inboundPath: 'website-chatbot',
      inboundSecretHash: 'old-hash',
      outboundUrl: 'https://example.com/outbound',
      outboundHeaders: {
        Authorization: 'Bearer original-token',
      },
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        tenantIds: [tenantId.toString()],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await updateWebhookInboxSource(
      makeRequest('PATCH', {
        name: 'Support Widget',
        outboundUrl: 'https://example.com/widget-outbound',
        inboundSecret: 'rotated-secret',
        outboundHeaders: {
          Authorization: 'Bearer rotated-token',
          'X-Source': 'support-widget',
        },
      }),
      makePatchContext(source._id.toString()),
    );
    const payload = await response.json() as { source: WebhookInboxSourceDto };

    expect(response.status).toBe(200);
    expect(payload.source).toMatchObject({
      id: source._id.toString(),
      name: 'Support Widget',
      status: 'active',
      outboundUrl: 'https://example.com/widget-outbound',
      outboundHeaders: {
        Authorization: 'Bearer rotated-token',
        'X-Source': 'support-widget',
      },
    });
    expect(payload.source.inboundSecretHash).toBeUndefined();

    const storedSource = await WebhookInboxSourceModel.findById(source._id).lean().exec();
    expect(storedSource?.name).toBe('Support Widget');
    expect(storedSource?.outboundUrl).toBe('https://example.com/widget-outbound');
    expect(storedSource?.outboundHeaders).toMatchObject({
      Authorization: 'Bearer rotated-token',
      'X-Source': 'support-widget',
    });
    expect(storedSource?.inboundSecretHash).toBeTruthy();
    expect(storedSource?.inboundSecretHash).not.toBe('old-hash');
    expect(storedSource?.inboundSecretHash).not.toBe('rotated-secret');
  });

  it('disables a webhook inbox source in the current tenant scope', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const source = await WebhookInboxSourceModel.create({
      agencyId,
      tenantId,
      name: 'Website Chatbot',
      status: 'active',
      inboundPath: 'website-chatbot',
      inboundSecretHash: 'secret-hash',
      outboundUrl: 'https://example.com/outbound',
      outboundHeaders: {},
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        tenantIds: [tenantId.toString()],
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'agency_admin',
        scopeRole: 'agency_admin',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await updateWebhookInboxSource(
      makeRequest('PATCH', { status: 'disabled' }),
      makePatchContext(source._id.toString()),
    );
    const payload = await response.json() as { source: WebhookInboxSourceDto };

    expect(response.status).toBe(200);
    expect(payload.source.status).toBe('disabled');
    expect(payload.source.disabledAt).toBeTruthy();

    const storedSource = await WebhookInboxSourceModel.findById(source._id).lean().exec();
    expect(storedSource?.status).toBe('disabled');
    expect(storedSource?.disabledAt).toBeInstanceOf(Date);
  });
});
