import {
  BillingMeterWindowModel,
  UsageMeterEventModel
} from '@noxivo/database';
import { z } from 'zod';
import { type MeterMetric } from '@noxivo/contracts';
import { MeteringCounterService } from './counter.service.js';

export const METERING_AGGREGATION_JOB_NAME = 'metering.aggregate-hour';

const MeteringAggregationJobDataSchema = z.object({
  windowStartIso: z.string().datetime()
}).strict();

export interface MeteringAggregationJobData {
  windowStartIso: string;
}

export interface MeteringAggregationQueue {
  add(
    name: string,
    data: MeteringAggregationJobData,
    options?: {
      repeat?: { pattern: string };
      jobId?: string;
    }
  ): Promise<unknown>;
}

interface UsageEventInput {
  agencyId: string;
  metric: MeterMetric;
  windowStart: Date;
  value: number;
  idempotencyKey: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof (error as { code?: unknown }).code === 'number'
    && (error as { code: number }).code === 11000;
}

export class MeteringAggregationWorker {
  constructor(private readonly counterService: MeteringCounterService) {}

  static buildIdempotencyKey(input: {
    agencyId: string;
    metric: MeterMetric;
    windowStart: Date;
  }): string {
    return `meter:${input.agencyId}:${input.metric}:${input.windowStart.toISOString()}`;
  }

  async persistUsageEvent(input: UsageEventInput): Promise<'inserted' | 'duplicate'> {
    try {
      await UsageMeterEventModel.create({
        agencyId: input.agencyId,
        metric: input.metric,
        windowStart: input.windowStart,
        value: input.value,
        idempotencyKey: input.idempotencyKey
      });

      return 'inserted';
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return 'duplicate';
      }

      throw error;
    }
  }

  async flushWindow(windowStart: Date): Promise<{
    windowsUpdated: number;
    insertedEvents: number;
    duplicateEvents: number;
  }> {
    const counters = await this.counterService.drainWindow(windowStart);
    let windowsUpdated = 0;
    let insertedEvents = 0;
    let duplicateEvents = 0;

    for (const counter of counters) {
      const idempotencyKey = MeteringAggregationWorker.buildIdempotencyKey({
        agencyId: counter.agencyId,
        metric: counter.metric,
        windowStart: counter.windowStart
      });

      const inserted = await this.persistUsageEvent({
        agencyId: counter.agencyId,
        metric: counter.metric,
        windowStart: counter.windowStart,
        value: counter.amount,
        idempotencyKey
      });

      if (inserted === 'duplicate') {
        duplicateEvents += 1;
        continue;
      }

      insertedEvents += 1;

      await BillingMeterWindowModel.findOneAndUpdate(
        {
          agencyId: counter.agencyId,
          metric: counter.metric,
          windowStart: counter.windowStart
        },
        {
          $setOnInsert: {
            agencyId: counter.agencyId,
            metric: counter.metric,
            windowStart: counter.windowStart
          },
          $set: {
            syncStatus: 'pending'
          },
          $inc: {
            usageTotal: counter.amount
          }
        },
        {
          upsert: true,
          new: true
        }
      ).exec();

      windowsUpdated += 1;
    }

    return {
      windowsUpdated,
      insertedEvents,
      duplicateEvents
    };
  }

  async processHourlyAggregation(input: MeteringAggregationJobData): Promise<{
    windowsUpdated: number;
    insertedEvents: number;
    duplicateEvents: number;
  }> {
    const parsed = MeteringAggregationJobDataSchema.parse(input);
    return this.flushWindow(new Date(parsed.windowStartIso));
  }
}

export function createMeteringAggregationProcessor(worker: MeteringAggregationWorker) {
  return async (job: { data: MeteringAggregationJobData }) => {
    return worker.processHourlyAggregation(job.data);
  };
}

export async function scheduleHourlyAggregation(queue: MeteringAggregationQueue): Promise<void> {
  await queue.add(
    METERING_AGGREGATION_JOB_NAME,
    {
      windowStartIso: new Date().toISOString()
    },
    {
      repeat: {
        pattern: '0 * * * *'
      },
      jobId: METERING_AGGREGATION_JOB_NAME
    }
  );
}
