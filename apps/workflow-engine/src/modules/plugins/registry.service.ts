import { PluginInstallationModel } from '@noxivo/database';
import {
  parsePluginExecutionResult,
  type PluginDefinition,
  type PluginExecutionResult
} from '@noxivo/contracts';
import { createCalendarBookingPlugin } from './builtin/calendar-booking.plugin.js';
import { createAirtablePlugin } from './builtin/airtable.plugin.js';
import { createGoogleSheetsPlugin } from './builtin/google-sheets.plugin.js';
import { createWebhookPlugin } from './builtin/webhook.plugin.js';
import { createHubSpotPlugin } from './builtin/hubspot.plugin.js';
import { createAiSalesAgentPlugin } from './builtin/ai-sales-agent.plugin.js';

export interface PluginExecutionRequest {
  pluginId: string;
  subject: {
    agencyId: string;
    tenantId: string;
  };
  payload: unknown;
}

export interface PluginRegistryOptions {
  registerBuiltIns?: boolean;
}

const MAX_VALIDATION_INPUT_BYTES = 16_384;

function assertInputWithinSizeLimit(label: string, input: unknown): void {
  const serialized = JSON.stringify(input ?? null);

  if (serialized.length > MAX_VALIDATION_INPUT_BYTES) {
    throw new Error(`${label} exceeds the maximum allowed size`);
  }
}

export class PluginRegistry {
  private readonly plugins = new Map<string, PluginDefinition>();

  constructor(options: PluginRegistryOptions = {}) {
    if (options.registerBuiltIns !== false) {
      this.register(createCalendarBookingPlugin());
      this.register(createAirtablePlugin());
      this.register(createGoogleSheetsPlugin());
      this.register(createWebhookPlugin());
      this.register(createHubSpotPlugin());
      this.register(createAiSalesAgentPlugin());
    }
  }

  register(plugin: PluginDefinition): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin ${plugin.manifest.id} is already registered`);
    }

    this.plugins.set(plugin.manifest.id, plugin);
  }

  resolve(pluginId: string): PluginDefinition {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not registered`);
    }

    return plugin;
  }

  validateConfig(pluginId: string, config: unknown): unknown {
    const plugin = this.resolve(pluginId);
    const result = plugin.configParser.safeParse(config);

    if (!result.success) {
      throw new Error(`Plugin config is invalid for ${pluginId}: ${result.error.message}`);
    }

    return result.data;
  }

  async execute(request: PluginExecutionRequest): Promise<PluginExecutionResult> {
    const plugin = this.resolve(request.pluginId);
    const installation = await PluginInstallationModel.findOne({
      agencyId: request.subject.agencyId,
      tenantId: request.subject.tenantId,
      pluginId: request.pluginId
    }).lean().exec();

    if (!installation || !installation.enabled) {
      throw new Error(`Plugin ${request.pluginId} is disabled for this tenant`);
    }

    if (installation.pluginVersion !== plugin.manifest.version) {
      throw new Error(
        `Plugin ${request.pluginId} version mismatch: installed ${installation.pluginVersion}, registered ${plugin.manifest.version}`
      );
    }

    assertInputWithinSizeLimit('Plugin config', installation.config ?? {});
    const config = this.validateConfig(request.pluginId, installation.config ?? {});

    assertInputWithinSizeLimit('Plugin payload', request.payload);
    const payloadResult = plugin.payloadParser.safeParse(request.payload);

    if (!payloadResult.success) {
      throw new Error(`Plugin payload is invalid for ${request.pluginId}: ${payloadResult.error.message}`);
    }

    const result = await plugin.execute({
      agencyId: request.subject.agencyId,
      tenantId: request.subject.tenantId,
      config,
      payload: payloadResult.data
    });

    return parsePluginExecutionResult(result);
  }
}

export function createDefaultPluginRegistry(): PluginRegistry {
  return new PluginRegistry();
}
