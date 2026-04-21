import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { GET as getDeveloperApiKey, POST as postDeveloperApiKey, DELETE as deleteDeveloperApiKey } from '../app/api/settings/developer-api/route.js';

const { mockGetCurrentSession, mockEngineClient } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockEngineClient: {
    getDeveloperApiKey: vi.fn(),
    generateDeveloperApiKey: vi.fn(),
    revokeDeveloperApiKey: vi.fn(),
  }
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession,
}));

vi.mock('../lib/api/engine-client', () => ({
  engineClient: mockEngineClient,
}));

describe('settings developer-api route', () => {
  beforeEach(() => {
    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: new mongoose.Types.ObjectId().toString(),
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        tenantIds: [new mongoose.Types.ObjectId().toString()],
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active',
      },
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterEach(() => {
    mockGetCurrentSession.mockReset();
    mockEngineClient.getDeveloperApiKey.mockReset();
    mockEngineClient.generateDeveloperApiKey.mockReset();
    mockEngineClient.revokeDeveloperApiKey.mockReset();
  });

  it('returns 503 when session lookup fails before developer-api resolution starts', async () => {
    mockGetCurrentSession.mockRejectedValue(new Error('MongoDB connection timed out after 10s'));

    const response = await getDeveloperApiKey();
    const payload = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Dashboard session store unavailable. Please verify MONGODB_URI.');
  });

  it('passes through engine results on GET', async () => {
    mockEngineClient.getDeveloperApiKey.mockResolvedValue({ key: 'dev-key' });

    const response = await getDeveloperApiKey();
    const payload = await response.json() as { key: string };

    expect(response.status).toBe(200);
    expect(payload.key).toBe('dev-key');
  });

  it('passes through engine results on POST and DELETE', async () => {
    mockEngineClient.generateDeveloperApiKey.mockResolvedValue({ key: 'new-key' });
    mockEngineClient.revokeDeveloperApiKey.mockResolvedValue({ success: true });

    const postResponse = await postDeveloperApiKey();
    const postPayload = await postResponse.json() as { key: string };
    expect(postResponse.status).toBe(200);
    expect(postPayload.key).toBe('new-key');

    const deleteResponse = await deleteDeveloperApiKey();
    const deletePayload = await deleteResponse.json() as { success: boolean };
    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.success).toBe(true);
  });
});
