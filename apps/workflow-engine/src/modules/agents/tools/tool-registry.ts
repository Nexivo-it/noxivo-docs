import { z } from 'zod';
import type { Product } from './data-sources/types.js';

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  risk: z.enum(['read', 'write'])
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface ToolContext {
  agencyId: string;
  tenantId: string;
  conversationId: string;
  pluginId: string;
  dataSourceId?: string;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executedAt: string;
}

export type BeforeHook = (context: ToolContext, args: unknown) => unknown | null;
export type AfterHook = (
  context: ToolContext,
  args: unknown,
  result: ToolResult
) => ToolResult;

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private handlers = new Map<string, (context: ToolContext, args: unknown) => Promise<ToolResult>>();
  private beforeHooks: BeforeHook[] = [];
  private afterHooks: AfterHook[] = [];

  register(tool: ToolDefinition, handler: (context: ToolContext, args: unknown) => Promise<ToolResult>) {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  addBeforeHook(hook: BeforeHook) {
    this.beforeHooks.push(hook);
  }

  addAfterHook(hook: AfterHook) {
    this.afterHooks.push(hook);
  }

  resolve(name: string) {
    return this.tools.get(name);
  }

  listAvailable() {
    return Array.from(this.tools.values());
  }

  async execute(name: string, context: ToolContext, args: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool ${name} not found`, executedAt: new Date().toISOString() };
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      return { success: false, error: `Handler for ${name} not registered`, executedAt: new Date().toISOString() };
    }

    let processedArgs = args;
    for (const hook of this.beforeHooks) {
      const transformed = hook(context, processedArgs);
      if (transformed !== null) {
        processedArgs = transformed;
      }
    }

    const result = await handler(context, processedArgs);

    for (const hook of this.afterHooks) {
      return hook(context, processedArgs, result);
    }

    return result;
  }
}

export const toolRegistry = new ToolRegistry();

toolRegistry.register(
  {
    name: 'search_store',
    description: 'Search products in the e-commerce catalog',
    inputSchema: { query: 'string', limit: 'number' },
    outputSchema: { items: 'array' },
    risk: 'read'
  },
  async (context, args) => {
    const { query, limit = 5 } = args as { query: string; limit?: number };
    const { getDataSourceAdapter } = await import('./data-sources/factory.js');
    const adapter = await getDataSourceAdapter(context);

    try {
      const items = await adapter.searchProducts({ query, limit });
      return {
        success: true,
        result: { items: items as Product[] },
        executedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        executedAt: new Date().toISOString()
      };
    }
  }
);