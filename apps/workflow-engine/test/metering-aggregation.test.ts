import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AgencyModel, BillingMeterWindowModel, UsageMeterEventModel } from '@noxivo/database';
import {
  MeteringCounterService,
  type MeterCounterStore
} from '../src/modules/metering/counter.service.js';
import { MeteringAggregationWorker } from '../src/modules/metering/aggregation.worker.js';
import {
  AgencyEntitlementService,
  StripeSyncWorker,
  type StripeMeterClient
} from '../src/modules/billing/stripe-sync.worker.js';
import {
  METERING_AGGREGATION_JOB_NAME,
  createMeteringAggregationProcessor,
  scheduleHourlyAggregation,
  type MeteringAggregationQueue
} from '../src/modules/metering/aggregation.worker.js';
import { UsageCaptureService } from '../src/modules/metering/capture.service.js';
import { ConversationIngestService } from '../src/modules/conversations/ingest.service.js';
import { AiTokenUsageService } from '../src/modules/ai/token-usage.service.js';
import { SessionActiveHourReconciliationService } from '../src/modules/sessions/active-hour-reconciliation.service.js';
import { MediaDownloadService } from '../src/modules/media/download.service.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

class InMemoryMeterCounterStore implements MeterCounterStore {
  private readonly values = new Map<string, number>();

  async increment(key: string, amount: number): Promise<number> {
    const nextValue = (this.values.get(key) ?? 0) + amount;
    this.values.set(key, nextValue);
    return nextValue;
  }

  async listKeys(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }

  async get(key: string): Promise<number> {
    return this.values.get(key) ?? 0;
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

async function createAgency(overrides: Partial<{
  plan: 'reseller_basic' | 'reseller_pro' | 'enterprise';
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  billingStripeCustomerId: string | null;
  billingStripeSubscriptionId: string | null;
}> = {}) {
  const objectId = new mongoose.Types.ObjectId();
  const slugSuffix = objectId.toHexString();
  return AgencyModel.create({
    name: `Agency ${objectId.toHexString().slice(0, 6)}`,
    slug: `agency-${slugSuffix}`,
    plan: overrides.plan ?? 'reseller_pro',
    billingStripeCustomerId: overrides.billingStripeCustomerId ?? 'cus_test_123',
    billingStripeSubscriptionId: overrides.billingStripeSubscriptionId ?? 'sub_test_123',
    billingOwnerUserId: new mongoose.Types.ObjectId(),
    whiteLabelDefaults: {},
    usageLimits: {
      tenants: 10,
      activeSessions: 500
    },
    status: overrides.status ?? 'active'
  });
}

describe('Metering aggregation and billing sync', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-metering-tests'
    });
    await Promise.all([
      AgencyModel.init(),
      BillingMeterWindowModel.init(),
      UsageMeterEventModel.init()
    ]);
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('multiple Redis increments roll up into one persisted billing window', async () => {
    const store = new InMemoryMeterCounterStore();
    const counterService = new MeteringCounterService(store);
    const worker = new MeteringAggregationWorker(counterService);
    const windowStart = new Date('2026-01-01T10:00:00.000Z');

    const agencyId = new mongoose.Types.ObjectId().toString();
    await counterService.increment({
      agencyId,
      metric: 'inbound_message',
      amount: 2,
      occurredAt: windowStart
    });
    await counterService.increment({
      agencyId,
      metric: 'inbound_message',
      amount: 5,
      occurredAt: windowStart
    });

    const summary = await worker.flushWindow(windowStart);
    expect(summary).toMatchObject({
      windowsUpdated: 1,
      insertedEvents: 1,
      duplicateEvents: 0
    });

    const windows = await BillingMeterWindowModel.find({
      agencyId,
      metric: 'inbound_message',
      windowStart
    }).lean().exec();

    expect(windows).toHaveLength(1);
    expect(windows[0]?.usageTotal).toBe(7);
  });

  it('idempotencyKey prevents duplicate event insertion', async () => {
    const store = new InMemoryMeterCounterStore();
    const worker = new MeteringAggregationWorker(new MeteringCounterService(store));
    const windowStart = new Date('2026-01-01T11:00:00.000Z');
    const agencyId = new mongoose.Types.ObjectId().toString();
    const idempotencyKey = MeteringAggregationWorker.buildIdempotencyKey({
      agencyId,
      metric: 'plugin_execution',
      windowStart
    });

    const firstInsert = await worker.persistUsageEvent({
      agencyId,
      metric: 'plugin_execution',
      windowStart,
      value: 1,
      idempotencyKey
    });
    const secondInsert = await worker.persistUsageEvent({
      agencyId,
      metric: 'plugin_execution',
      windowStart,
      value: 1,
      idempotencyKey
    });

    expect(firstInsert).toBe('inserted');
    expect(secondInsert).toBe('duplicate');

    const eventCount = await UsageMeterEventModel.countDocuments({ idempotencyKey });
    expect(eventCount).toBe(1);
  });

  it('captures required usage metrics in production-facing services', async () => {
    const store = new InMemoryMeterCounterStore();
    const counterService = new MeteringCounterService(store);
    const captureService = new UsageCaptureService(counterService);
    const aggregationWorker = new MeteringAggregationWorker(counterService);
    const windowStart = new Date('2026-01-01T15:00:00.000Z');

    const ingestService = new ConversationIngestService(captureService);
    const tokenUsageService = new AiTokenUsageService(captureService);
    const sessionReconciliationService = new SessionActiveHourReconciliationService(captureService);
    const mediaDownloadService = new MediaDownloadService(captureService);

    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId().toString();

    await ingestService.ingestInboundMessage({
      agencyId,
      tenantId,
      conversationId,
      content: 'hello inbound',
      receivedAt: windowStart
    });

    await captureService.captureOutboundMessage({
      agencyId,
      occurredAt: windowStart
    });
    await captureService.capturePluginExecution({
      agencyId,
      occurredAt: windowStart
    });

    await tokenUsageService.recordTokenUsage({
      agencyId,
      tokenCount: 42,
      usedAt: windowStart
    });

    await sessionReconciliationService.reconcileActiveSessionHour({
      agencyId,
      sessionId: 'session-1',
      observedAt: windowStart
    });

    await mediaDownloadService.recordDownload({
      agencyId,
      mediaUrl: 'https://cdn.example.com/media.mp4',
      downloadedAt: windowStart
    });

    await aggregationWorker.flushWindow(windowStart);

    const windows = await BillingMeterWindowModel.find({
      agencyId,
      windowStart
    }).lean().exec();

    const metricTotals = Object.fromEntries(windows.map((window) => [window.metric, window.usageTotal]));

    expect(metricTotals.inbound_message).toBe(1);
    expect(metricTotals.outbound_message).toBe(1);
    expect(metricTotals.plugin_execution).toBe(1);
    expect(metricTotals.ai_token_usage).toBe(42);
    expect(metricTotals.session_active_hour).toBe(1);
    expect(metricTotals.media_download).toBe(1);
  });

  it('schedules an hourly BullMQ aggregation job and processes queued window data', async () => {
    const store = new InMemoryMeterCounterStore();
    const counterService = new MeteringCounterService(store);
    const worker = new MeteringAggregationWorker(counterService);
    const processor = createMeteringAggregationProcessor(worker);
    const queue: MeteringAggregationQueue = {
      add: vi.fn().mockResolvedValue(undefined)
    };

    await scheduleHourlyAggregation(queue);
    expect(queue.add).toHaveBeenCalledWith(
      METERING_AGGREGATION_JOB_NAME,
      expect.objectContaining({ windowStartIso: expect.any(String) }),
      expect.objectContaining({
        repeat: { pattern: '0 * * * *' },
        jobId: METERING_AGGREGATION_JOB_NAME
      })
    );

    const windowStart = new Date('2026-01-01T14:00:00.000Z');
    const agencyId = new mongoose.Types.ObjectId().toString();
    await counterService.increment({
      agencyId,
      metric: 'media_download',
      amount: 4,
      occurredAt: windowStart
    });

    const result = await processor({
      data: {
        windowStartIso: windowStart.toISOString()
      }
    });

    expect(result).toMatchObject({
      windowsUpdated: 1,
      insertedEvents: 1,
      duplicateEvents: 0
    });
  });

  it('Stripe sync sends one meter event per (agencyId, metric, windowStart)', async () => {
    const agency = await createAgency();
    const windowStartA = new Date('2026-01-01T12:00:00.000Z');
    const windowStartB = new Date('2026-01-01T13:00:00.000Z');

    await BillingMeterWindowModel.create({
      agencyId: agency._id.toString(),
      metric: 'outbound_message',
      windowStart: windowStartA,
      usageTotal: 12,
      syncStatus: 'pending'
    });

    await BillingMeterWindowModel.create({
      agencyId: agency._id.toString(),
      metric: 'plugin_execution',
      windowStart: windowStartB,
      usageTotal: 3,
      syncStatus: 'pending'
    });

    const stripeClient: StripeMeterClient = {
      createMeterEvent: vi.fn().mockImplementation(async (input: { identifier: string }) => {
        return { id: `evt_${input.identifier}` };
      })
    };

    const worker = new StripeSyncWorker(stripeClient);

    const firstSync = await worker.syncPendingWindows();
    expect(firstSync.synced).toBe(2);
    expect(stripeClient.createMeterEvent).toHaveBeenCalledTimes(2);

    const identifiers = (stripeClient.createMeterEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { identifier: string }).identifier
    );
    expect(new Set(identifiers).size).toBe(2);

    const secondSync = await worker.syncPendingWindows();
    expect(secondSync.synced).toBe(0);
    expect(stripeClient.createMeterEvent).toHaveBeenCalledTimes(2);
  });

  it('delinquent agencies fail entitlement checks for premium features but not webhook ingestion', async () => {
    const delinquentAgency = await createAgency({
      plan: 'reseller_pro',
      status: 'suspended',
      billingStripeCustomerId: 'cus_test_123',
      billingStripeSubscriptionId: 'sub_test_123'
    });

    const basicAgency = await createAgency({
      plan: 'reseller_basic',
      status: 'active',
      billingStripeCustomerId: 'cus_basic_123',
      billingStripeSubscriptionId: 'sub_basic_123'
    });

    const premiumAgency = await createAgency({
      plan: 'enterprise',
      status: 'active',
      billingStripeCustomerId: 'cus_ent_123',
      billingStripeSubscriptionId: 'sub_ent_123'
    });

    const entitlement = new AgencyEntitlementService();
    const premiumAllowed = await entitlement.canUsePremiumFeature(delinquentAgency._id.toString());
    const basicPremiumAllowed = await entitlement.canUsePremiumFeature(basicAgency._id.toString());
    const enterprisePremiumAllowed = await entitlement.canUsePremiumFeature(premiumAgency._id.toString());
    const webhookAllowed = entitlement.canIngestWebhook();

    expect(premiumAllowed).toBe(false);
    expect(basicPremiumAllowed).toBe(false);
    expect(enterprisePremiumAllowed).toBe(true);
    expect(webhookAllowed).toBe(true);
  });
});
