import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  AgencyModel,
  TenantModel,
  UserModel,
  ConversationModel,
  MessageModel,
  PluginInstallationModel
} from '@noxivo/database';
import { GET as getPlugins } from '../app/api/team-inbox/plugins/route.js';
import { GET as getStats } from '../app/api/team-inbox/stats/route.js';
import { GET as getBilling } from '../app/api/team-inbox/billing/route.js';
import { GET as getDeliveryHistory } from '../app/api/team-inbox/[conversationId]/delivery-history/route.js';
import { POST as resendMessage } from '../app/api/team-inbox/[conversationId]/messages/[messageId]/route.js';
import { POST as unhandoff } from '../app/api/team-inbox/[conversationId]/unhandoff/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn()
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

import {
  connectDashboardTestDb,
  disconnectDashboardTestDb
} from './helpers/mongo-memory.js';

describe('production smoke tests', () => {
  let agencyId: mongoose.Types.ObjectId;
  let tenantId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;
  let conversationId: mongoose.Types.ObjectId;
  let messageId: mongoose.Types.ObjectId;

  const mockSession = {
    actor: {
      agencyId: '',
      tenantId: '',
      userId: '',
      role: 'owner'
    }
  };

  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-smoke-tests' });

    agencyId = new mongoose.Types.ObjectId();
    tenantId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    conversationId = new mongoose.Types.ObjectId();
    messageId = new mongoose.Types.ObjectId();

    mockSession.actor.agencyId = agencyId.toString();
    mockSession.actor.tenantId = tenantId.toString();
    mockSession.actor.userId = userId.toString();

    await AgencyModel.create({
      _id: agencyId,
      name: 'Smoke Test Agency',
      slug: 'smoke-test',
      plan: 'reseller_pro',
      billingOwnerUserId: userId,
      whiteLabelDefaults: {},
      usageLimits: { tenants: 5, activeSessions: 10 },
      status: 'active'
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      name: 'Test Tenant',
      slug: 'test-tenant',
      billingMode: 'agency_pays',
      region: 'us-east-1',
      status: 'active'
    });

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15551234567@c.us',
      status: 'open',
      unreadCount: 0
    });

    await MessageModel.create({
      _id: messageId,
      conversationId,
      agencyId,
      tenantId,
      role: 'assistant',
      content: 'Test message for smoke testing',
      deliveryStatus: 'sent'
    });

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: 'test-plugin',
      pluginVersion: '1.0.0',
      enabled: true,
      config: { test: true }
    });

    mockGetCurrentSession.mockResolvedValue(mockSession);
  });

  afterAll(async () => {
    mockGetCurrentSession.mockRestore();
    await disconnectDashboardTestDb();
  });

  describe('plugin routes', () => {
    it('lists installed plugins', async () => {
      const request = new Request('http://localhost/api/team-inbox/plugins');
      const response = await getPlugins(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('pluginId');
      expect(data[0]).toHaveProperty('enabled');
    });

    it('filters plugins by pluginId', async () => {
      const request = new Request('http://localhost/api/team-inbox/plugins?pluginId=test-plugin');
      const response = await getPlugins(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(1);
      expect(data[0].pluginId).toBe('test-plugin');
    });
  });

  describe('stats routes', () => {
    it('returns agency statistics', async () => {
      const request = new Request('http://localhost/api/team-inbox/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('conversations');
      expect(data).toHaveProperty('messages');
      expect(data).toHaveProperty('users');
      expect(data).toHaveProperty('activeSessions');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('billing routes', () => {
    it('returns agency billing info', async () => {
      const request = new Request('http://localhost/api/team-inbox/billing');
      const response = await getBilling(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('plan');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('features');
      expect(data.features).toHaveProperty('crmIntegration');
    });
  });

  describe('delivery history route', () => {
    it('returns delivery events for conversation', async () => {
      const request = new Request(`http://localhost/api/team-inbox/${conversationId}/delivery-history`);
      
      const response = await getDeliveryHistory(
        request,
        { params: Promise.resolve({ conversationId: conversationId.toString() }) }
      );
      
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('unhandoff route', () => {
    it('returns 404 for non-handoff conversation', async () => {
      const request = new Request(`http://localhost/api/team-inbox/${conversationId}/unhandoff`, {
        method: 'POST'
      });
      
      const response = await unhandoff(
        request,
        { params: Promise.resolve({ conversationId: conversationId.toString() }) }
      );
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('not in handoff state');
    });
  });

  describe('authentication', () => {
    it('rejects unauthenticated requests to plugins', async () => {
      mockGetCurrentSession.mockResolvedValueOnce(null);
      
      const request = new Request('http://localhost/api/team-inbox/plugins');
      const response = await getPlugins(request);
      
      expect(response.status).toBe(401);
    });

    it('rejects unauthenticated requests to stats', async () => {
      mockGetCurrentSession.mockResolvedValueOnce(null);
      
      const request = new Request('http://localhost/api/team-inbox/stats');
      const response = await getStats(request);
      
      expect(response.status).toBe(401);
    });

    it('rejects unauthenticated requests to billing', async () => {
      mockGetCurrentSession.mockResolvedValueOnce(null);
      
      const request = new Request('http://localhost/api/team-inbox/billing');
      const response = await getBilling(request);
      
      expect(response.status).toBe(401);
    });
  });
});