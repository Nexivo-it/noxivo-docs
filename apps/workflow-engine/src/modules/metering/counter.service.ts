import { z } from 'zod';
import { MeterMetricSchema, type MeterMetric } from '@noxivo/contracts';

const MeterCounterIncrementInputSchema = z.object({
  agencyId: z.string().min(1).max(128).regex(/^[^:]+$/),
  metric: MeterMetricSchema,
  amount: z.number().int().positive(),
  occurredAt: z.date().optional()
}).strict();

export interface MeterCounterStore {
  increment(key: string, amount: number): Promise<number>;
  listKeys(prefix: string): Promise<string[]>;
  get(key: string): Promise<number>;
  remove(key: string): Promise<void>;
}

export class RedisMeterCounterStore implements MeterCounterStore {
  constructor(private readonly redis: import('ioredis').Redis) {}

  async increment(key: string, amount: number): Promise<number> {
    return this.redis.incrby(key, amount);
  }

  async listKeys(prefix: string): Promise<string[]> {
    return this.redis.keys(`${prefix}*`);
  }

  async get(key: string): Promise<number> {
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  async remove(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export class NoopMeterCounterStore implements MeterCounterStore {
  async increment(_key: string, _amount: number): Promise<number> {
    return 0;
  }

  async listKeys(_prefix: string): Promise<string[]> {
    return [];
  }

  async get(_key: string): Promise<number> {
    return 0;
  }

  async remove(_key: string): Promise<void> {
    return;
  }
}

export interface MeterWindowCounter {
  agencyId: string;
  metric: MeterMetric;
  windowStart: Date;
  amount: number;
}

function utcHourToken(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}${month}${day}${hour}`;
}

function utcHourStart(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0
  ));
}

export class MeteringCounterService {
  constructor(private readonly store: MeterCounterStore) {}

  static createMeterKey(input: { agencyId: string; metric: MeterMetric; windowStart: Date }): string {
    return `meter:${input.agencyId}:${input.metric}:${utcHourToken(input.windowStart)}`;
  }

  async increment(input: {
    agencyId: string;
    metric: MeterMetric;
    amount: number;
    occurredAt?: Date;
  }): Promise<number> {
    const parsed = MeterCounterIncrementInputSchema.parse(input);
    const key = MeteringCounterService.createMeterKey({
      agencyId: parsed.agencyId,
      metric: parsed.metric,
      windowStart: parsed.occurredAt ?? new Date()
    });

    return this.store.increment(key, parsed.amount);
  }

  async drainWindow(windowStart: Date): Promise<MeterWindowCounter[]> {
    const normalizedWindowStart = utcHourStart(windowStart);
    const targetToken = utcHourToken(normalizedWindowStart);
    const keys = await this.store.listKeys('meter:');
    const counters: MeterWindowCounter[] = [];

    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length !== 4 || parts[0] !== 'meter') {
        continue;
      }

      const agencyId = parts[1];
      const metricCandidate = parts[2];
      const hourToken = parts[3];

      if (!agencyId || !metricCandidate || !hourToken) {
        continue;
      }

      if (hourToken !== targetToken) {
        continue;
      }

      const metric = MeterMetricSchema.safeParse(metricCandidate);
      if (!metric.success) {
        continue;
      }

      const amount = await this.store.get(key);
      await this.store.remove(key);

      if (amount <= 0) {
        continue;
      }

      counters.push({
        agencyId,
        metric: metric.data,
        windowStart: normalizedWindowStart,
        amount
      });
    }

    return counters;
  }
}
