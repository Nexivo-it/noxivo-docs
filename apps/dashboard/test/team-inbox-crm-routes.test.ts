import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  AgencyModel,
  ConversationModel,
  TenantModel
} from '@noxivo/database';
import { GET as getCrmProfile, PATCH as patchCrmProfile } from '../app/api/team-inbox/[conversationId]/crm/route.js';

const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn()
}));

vi.mock('../lib/auth/session', () => ({
  getCurrentSession: mockGetCurrentSession
}));

import {
  connectDashboardTestDb,
  disconnectDashboardTestDb,
  resetDashboardTestDb
} from './helpers/mongo-memory.js';

describe('team inbox CRM routes', () => {
  let agencyId: mongoose.Types.ObjectId;
  let tenantId: mongoose.Types.ObjectId;
  let conversationId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectDashboardTestDb({ dbName: 'noxivo-dashboard-team-inbox-crm-routes-tests' });
  });

  afterEach(async () => {
    mockGetCurrentSession.mockReset();
    vi.unstubAllGlobals();
    delete process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL;
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    await resetDashboardTestDb();
  });

  afterAll(async () => {
    await disconnectDashboardTestDb();
  });

  async function seedConversation() {
    agencyId = new mongoose.Types.ObjectId();
    tenantId = new mongoose.Types.ObjectId();
    conversationId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();

    await AgencyModel.create({
      _id: agencyId,
      name: 'CRM Agency',
      slug: 'crm-agency',
      plan: 'enterprise',
      billingStripeCustomerId: null,
      billingStripeSubscriptionId: null,
      billingOwnerUserId: new mongoose.Types.ObjectId(),
      whiteLabelDefaults: {
        customDomain: null,
        logoUrl: null,
        primaryColor: '#6366F1',
        supportEmail: 'ops@crm.test',
        hidePlatformBranding: false
      },
      usageLimits: { tenants: 5, activeSessions: 20 },
      status: 'active'
    });

    await TenantModel.create({
      _id: tenantId,
      agencyId,
      slug: 'crm-main',
      name: 'CRM Main',
      region: 'us-east-1',
      status: 'active',
      billingMode: 'agency_pays',
      whiteLabelOverrides: {},
      effectiveBrandingCache: {}
    });

    await ConversationModel.create({
      _id: conversationId,
      agencyId,
      tenantId,
      contactId: '15550007777@c.us',
      contactName: 'CRM Contact',
      status: 'open',
      unreadCount: 0
    });

    mockGetCurrentSession.mockResolvedValue({
      id: 'session-id',
      actor: {
        userId: userId.toString(),
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString(),
        email: 'owner@example.com',
        fullName: 'Owner User',
        role: 'agency_owner',
        status: 'active'
      },
      expiresAt: new Date(Date.now() + 60000)
    });
  }

  it('proxies CRM profile fetches through the workflow-engine internal route', async () => {
    await seedConversation();
    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      contactId: '15550007777@c.us',
      crmTags: [{ label: 'vip' }],
      externalLinks: []
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await getCrmProfile(new Request('http://localhost/api/team-inbox/crm'), {
      params: Promise.resolve({ conversationId: conversationId.toString() })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      contactId: '15550007777@c.us',
      crmTags: [expect.objectContaining({ label: 'vip' })]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://workflow-engine.internal/v1/internal/crm/conversations/${conversationId.toString()}/profile?agencyId=${agencyId.toString()}&tenantId=${tenantId.toString()}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-nexus-internal-psk': 'internal-psk'
        })
      })
    );
  });

  it('proxies CRM mutations and injects the operator user as the note author', async () => {
    await seedConversation();
    process.env.WORKFLOW_ENGINE_INTERNAL_BASE_URL = 'http://workflow-engine.internal';
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'internal-psk';

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      crmNotes: [{ body: 'Call back tomorrow' }],
      crmOwner: { externalOwnerId: 'owner-1' }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await patchCrmProfile(
      new Request('http://localhost/api/team-inbox/crm', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add_note',
          provider: 'custom',
          note: {
            body: 'Call back tomorrow'
          }
        })
      }),
      { params: Promise.resolve({ conversationId: conversationId.toString() }) }
    );

    expect(response.status).toBe(200);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeTruthy();
    if (!firstCall) {
      throw new Error('Expected CRM fetch call');
    }

    const call = firstCall as unknown[];
    const init = call[1] as RequestInit | undefined;
    expect(init).toBeTruthy();
    if (!init) {
      throw new Error('Expected CRM fetch init');
    }
    expect(JSON.parse(String(init.body))).toMatchObject({
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      action: 'add_note',
      note: {
        body: 'Call back tomorrow',
        authorUserId: userId.toString()
      }
    });
  });
});
