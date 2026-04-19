import { z } from 'zod';

export const MeterMetricSchema = z.enum([
  'inbound_message',
  'outbound_message',
  'plugin_execution',
  'ai_token_usage',
  'session_active_hour',
  'media_download'
]);

export const UsageMeterEventSchema = z.object({
  agencyId: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  metric: MeterMetricSchema,
  windowStart: z.string().datetime(),
  value: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(255)
}).strict();

export const BillingSyncStatusSchema = z.enum(['pending', 'synced', 'failed']);

export const BillingMeterWindowSchema = z.object({
  agencyId: z.string().min(1),
  metric: MeterMetricSchema,
  windowStart: z.string().datetime(),
  usageTotal: z.number().int().nonnegative(),
  syncStatus: BillingSyncStatusSchema,
  lastSyncedAt: z.string().datetime().nullable().optional(),
  stripeMeterEventId: z.string().min(1).nullable().optional()
}).strict();

export type MeterMetric = z.infer<typeof MeterMetricSchema>;
export type UsageMeterEvent = z.infer<typeof UsageMeterEventSchema>;
export type BillingMeterWindow = z.infer<typeof BillingMeterWindowSchema>;
export type BillingSyncStatus = z.infer<typeof BillingSyncStatusSchema>;

export function parseUsageMeterEvent(input: unknown): UsageMeterEvent {
  return UsageMeterEventSchema.parse(input);
}

export function parseBillingMeterWindow(input: unknown): BillingMeterWindow {
  return BillingMeterWindowSchema.parse(input);
}
