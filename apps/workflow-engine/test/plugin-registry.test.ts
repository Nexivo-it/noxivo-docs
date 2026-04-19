import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PluginInstallationModel } from '@noxivo/database';
import { PluginRegistry, createDefaultPluginRegistry } from '../src/modules/plugins/registry.service.js';
import { createCalendarBookingPlugin } from '../src/modules/plugins/builtin/calendar-booking.plugin.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('Plugin registry and tenant enablement', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-plugin-tests'
    });
    await PluginInstallationModel.init();
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('rejects duplicate plugin ids', () => {
    const registry = new PluginRegistry({ registerBuiltIns: false });
    const plugin = createCalendarBookingPlugin();

    registry.register(plugin);

    expect(() => registry.register(plugin)).toThrow(/already registered/i);
  });

  it('rejects invalid manifest categories and semantic versions', () => {
    expect(() => createCalendarBookingPlugin({ version: '1.0', category: 'booking' })).toThrow(/version/i);
    expect(() => createCalendarBookingPlugin({ version: '1.0.0', category: 'invalid-category' })).toThrow(/category/i);
  });

  it('validates tenant config against the plugin config schema before execution', async () => {
    const registry = createDefaultPluginRegistry();
    const plugin = registry.resolve('calendar-booking');
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      enabled: true,
      config: {
        provider: 'google-calendar'
      }
    });

    await expect(
      registry.execute({
        pluginId: plugin.manifest.id,
        subject: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString()
        },
        payload: {
          customerEmail: 'ada@example.com',
          customerName: 'Ada Lovelace',
          startTime: '2026-04-11T09:00:00.000Z'
        }
      })
    ).rejects.toThrow(/config/i);
  });

  it('prevents disabled plugins from executing for a tenant', async () => {
    const registry = createDefaultPluginRegistry();
    const plugin = registry.resolve('calendar-booking');
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      enabled: false,
      config: {
        provider: 'google-calendar',
        calendarId: 'primary',
        defaultDurationMinutes: 30
      }
    });

    await expect(
      registry.execute({
        pluginId: plugin.manifest.id,
        subject: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString()
        },
        payload: {
          customerEmail: 'ada@example.com',
          customerName: 'Ada Lovelace',
          startTime: '2026-04-11T09:00:00.000Z'
        }
      })
    ).rejects.toThrow(/disabled/i);
  });

  it('executes an enabled built-in plugin with valid config and payload', async () => {
    const registry = createDefaultPluginRegistry();
    const plugin = registry.resolve('calendar-booking');
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      enabled: true,
      config: {
        provider: 'google-calendar',
        calendarId: 'primary',
        defaultDurationMinutes: 30
      }
    });

    const result = await registry.execute({
      pluginId: plugin.manifest.id,
      subject: {
        agencyId: agencyId.toString(),
        tenantId: tenantId.toString()
      },
      payload: {
        customerEmail: 'ada@example.com',
        customerName: 'Ada Lovelace',
        startTime: '2026-04-11T09:00:00.000Z'
      }
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.output).toMatchObject({
      bookingId: `${tenantId.toString()}:2026-04-11T09:00:00.000Z`,
      provider: 'google-calendar',
      calendarId: 'primary',
      customerEmail: 'ada@example.com',
      customerName: 'Ada Lovelace',
      startTime: '2026-04-11T09:00:00.000Z'
    });
  });

  it('rejects execution when the installed plugin version does not match the registered plugin version', async () => {
    const registry = createDefaultPluginRegistry();
    const plugin = registry.resolve('calendar-booking');
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: plugin.manifest.id,
      pluginVersion: '0.9.0',
      enabled: true,
      config: {
        provider: 'google-calendar',
        calendarId: 'primary',
        defaultDurationMinutes: 30
      }
    });

    await expect(
      registry.execute({
        pluginId: plugin.manifest.id,
        subject: {
          agencyId: agencyId.toString(),
          tenantId: tenantId.toString()
        },
        payload: {
          customerEmail: 'ada@example.com',
          customerName: 'Ada Lovelace',
          startTime: '2026-04-11T09:00:00.000Z'
        }
      })
    ).rejects.toThrow(/version mismatch/i);
  });

  it('does not execute a tenant installation for a different tenant subject', async () => {
    const registry = createDefaultPluginRegistry();
    const plugin = registry.resolve('calendar-booking');
    const agencyId = new mongoose.Types.ObjectId();
    const installedTenantId = new mongoose.Types.ObjectId();
    const otherTenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId: installedTenantId,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      enabled: true,
      config: {
        provider: 'google-calendar',
        calendarId: 'primary',
        defaultDurationMinutes: 30
      }
    });

    await expect(
      registry.execute({
        pluginId: plugin.manifest.id,
        subject: {
          agencyId: agencyId.toString(),
          tenantId: otherTenantId.toString()
        },
        payload: {
          customerEmail: 'ada@example.com',
          customerName: 'Ada Lovelace',
          startTime: '2026-04-11T09:00:00.000Z'
        }
      })
    ).rejects.toThrow(/disabled/i);
  });
});
