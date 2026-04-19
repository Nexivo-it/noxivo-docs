import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AgencyModel, TenantModel, MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';
import { ClusterAllocator, createMessagingSessionPayload } from '@noxivo/messaging-client';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('MessagingProvider Shared Cluster Registry and Allocator', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-cluster-tests'
    });
    await Promise.all([
      AgencyModel.init(),
      TenantModel.init(),
      MessagingClusterModel.init(),
      MessagingSessionBindingModel.init()
    ]);
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('selects an active cluster matching the agency region', async () => {
    await MessagingClusterModel.create([
      {
        name: 'EU Cluster 1',
        region: 'eu-west-1',
        baseUrl: 'https://messaging-eu-1.internal',
        dashboardUrl: 'https://messaging-eu-1.internal/dashboard',
        swaggerUrl: 'https://messaging-eu-1.internal/docs',
        capacity: 1000,
        activeSessionCount: 100,
        status: 'active',
        secretRefs: { webhookSecretVersion: 'v1' }
      },
      {
        name: 'US Cluster 1',
        region: 'us-east-1',
        baseUrl: 'https://messaging-us-1.internal',
        dashboardUrl: 'https://messaging-us-1.internal/dashboard',
        swaggerUrl: 'https://messaging-us-1.internal/docs',
        capacity: 1000,
        activeSessionCount: 50,
        status: 'active',
        secretRefs: { webhookSecretVersion: 'v1' }
      }
    ]);

    const agencyId = new mongoose.Types.ObjectId();
    const allocator = new ClusterAllocator();

    const cluster = await allocator.allocateCluster('us-east-1');
    expect(cluster).toBeDefined();
    expect(cluster?.name).toBe('US Cluster 1');
  });

  it('respects cluster hard-cap limit (throws if capacity reached)', async () => {
    await MessagingClusterModel.create({
      name: 'EU Cluster Full',
      region: 'eu-central-1',
      baseUrl: 'https://messaging-eu-full.internal',
      dashboardUrl: 'https://messaging-eu-full.internal/dashboard',
      swaggerUrl: 'https://messaging-eu-full.internal/docs',
      capacity: 10,
      activeSessionCount: 10,
      status: 'active',
      secretRefs: { webhookSecretVersion: 'v1' }
    });

    const allocator = new ClusterAllocator();

    await expect(allocator.allocateCluster('eu-central-1')).rejects.toThrow(/No available clusters found in region/i);
  });

  it('assigns metadata to MessagingProvider session payload with agencyId, tenantId, clusterId, and sessionBindingId', async () => {
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();
    const clusterId = new mongoose.Types.ObjectId();
    const sessionBindingId = new mongoose.Types.ObjectId();
    const sessionName = 'my-whatsapp';

    const payload = createMessagingSessionPayload({
      sessionName,
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      clusterId: clusterId.toString(),
      sessionBindingId: sessionBindingId.toString()
    });

    expect(payload.name).toBe(sessionName);
    
    // According to MessagingProvider docs metadata is kept for events
    expect(payload.config.metadata).toBeDefined();
    expect(payload.config.metadata.agencyId).toBe(agencyId.toString());
    expect(payload.config.metadata.tenantId).toBe(tenantId.toString());
    expect(payload.config.metadata.clusterId).toBe(clusterId.toString());
    expect(payload.config.metadata.sessionBindingId).toBe(sessionBindingId.toString());
  });

  it('webhook path is cluster-aware and idempotency-safe', () => {
    const clusterId = new mongoose.Types.ObjectId();
    const payload = createMessagingSessionPayload({
      sessionName: 'billing-session',
      agencyId: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      clusterId: clusterId.toString(),
      sessionBindingId: new mongoose.Types.ObjectId().toString(),
      webhookBaseUrl: 'https://api.noxivo.com',
      webhookSecret: 'webhook-secret',
      accountName: 'sales'
    });

    const webhookConfig = payload.config.webhooks[0];
    expect(webhookConfig).toBeDefined();
    expect(webhookConfig!.url).toContain('/v1/webhooks/messaging');
    expect(webhookConfig!.events).toEqual([
      'message',
      'message.any',
      'message.ack',
      'message.ack.group',
      'session.status'
    ]);
    expect(webhookConfig!.customHeaders).toBeDefined();
    expect(webhookConfig!.customHeaders).toEqual([
      { name: 'x-nexus-cluster-id', value: clusterId.toString() },
      { name: 'x-nexus-agency-id', value: payload.config.metadata.agencyId },
      { name: 'x-nexus-tenant-id', value: payload.config.metadata.tenantId },
      { name: 'x-nexus-session-binding-id', value: payload.config.metadata.sessionBindingId },
      { name: 'x-messaging-webhook-secret', value: 'webhook-secret' }
    ]);
    expect(payload.config.metadata.accountName).toBe('sales');
  });
});
