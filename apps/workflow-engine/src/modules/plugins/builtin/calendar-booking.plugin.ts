import { z } from 'zod';
import {
  parsePluginManifest,
  type PluginCategory,
  type PluginDefinition,
  type PluginManifest
} from '@noxivo/contracts';

const CalendarBookingConfigSchema = z.object({
  provider: z.enum(['google-calendar', 'caldotcom']),
  calendarId: z.string().min(1),
  defaultDurationMinutes: z.number().int().min(15).max(480)
}).strict();

const CalendarBookingPayloadSchema = z.object({
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  startTime: z.string().datetime()
}).strict();

export interface CalendarBookingPluginOverrides {
  version?: string;
  category?: string;
}

function buildCalendarBookingManifest(overrides: CalendarBookingPluginOverrides = {}): PluginManifest {
  return parsePluginManifest({
    id: 'calendar-booking',
    version: overrides.version ?? '1.0.0',
    displayName: 'Calendar Booking',
    configSchema: {
      provider: {
        type: 'enum',
        values: ['google-calendar', 'caldotcom']
      },
      calendarId: {
        type: 'string',
        minLength: 1
      },
      defaultDurationMinutes: {
        type: 'integer',
        minimum: 15,
        maximum: 480
      }
    },
    actionSchema: {
      createBooking: {
        customerEmail: 'email',
        customerName: 'string',
        startTime: 'datetime'
      }
    },
    category: (overrides.category ?? 'booking') as PluginCategory
  });
}

export function createCalendarBookingPlugin(
  overrides: CalendarBookingPluginOverrides = {}
): PluginDefinition {
  const manifest = buildCalendarBookingManifest(overrides);

  return {
    manifest,
    configParser: CalendarBookingConfigSchema,
    payloadParser: CalendarBookingPayloadSchema,
    async execute(context) {
      const payload = CalendarBookingPayloadSchema.parse(context.payload);
      const config = CalendarBookingConfigSchema.parse(context.config);

      return {
        success: true,
        output: {
          bookingId: `${context.tenantId}:${payload.startTime}`,
          provider: config.provider,
          calendarId: config.calendarId,
          customerEmail: payload.customerEmail,
          customerName: payload.customerName,
          startTime: payload.startTime
        },
        error: null,
        executedAt: new Date().toISOString()
      };
    }
  };
}
