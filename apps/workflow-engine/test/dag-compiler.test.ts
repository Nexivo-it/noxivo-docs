import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PluginInstallationModel } from '@noxivo/database';
import { createDefaultPluginRegistry } from '../src/modules/plugins/registry.service.js';
import { DagCompiler } from '../src/modules/agents/dag-compiler.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('DAG compiler', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-dag-compiler-tests'
    });
    await PluginInstallationModel.init();
  }, 60000);

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60000);

  it('compiles React Flow nodes and edges into a normalized DAG', async () => {
    const registry = createDefaultPluginRegistry();
    const compiler = new DagCompiler({ pluginRegistry: registry });
    const agencyId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await PluginInstallationModel.create({
      agencyId,
      tenantId,
      pluginId: 'calendar-booking',
      pluginVersion: '1.0.0',
      enabled: true,
      config: {
        provider: 'google-calendar',
        calendarId: 'primary',
        defaultDurationMinutes: 30
      }
    });

    const graph = {
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: { event: 'message.received' } },
        { id: 'plugin-1', type: 'plugin', position: { x: 200, y: 0 }, data: { pluginId: 'calendar-booking' } },
        { id: 'condition-1', type: 'condition', position: { x: 400, y: 0 }, data: { operator: 'equals' } },
        { id: 'action-1', type: 'action', position: { x: 600, y: -100 }, data: { action: 'send-message' } },
        { id: 'delay-1', type: 'delay', position: { x: 600, y: 100 }, data: { delayMs: 300000 } }
      ],
      edges: [
        { id: 'edge-1', source: 'trigger-1', target: 'plugin-1' },
        { id: 'edge-2', source: 'plugin-1', target: 'condition-1' },
        { id: 'edge-3', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-1' },
        { id: 'edge-4', source: 'condition-1', sourceHandle: 'onFalse', target: 'delay-1' }
      ]
    };

    const compiled = await compiler.compile({
      agencyId: agencyId.toString(),
      tenantId: tenantId.toString(),
      graph,
      version: '1.0.0'
    });

    expect(compiled.entryNodeId).toBe('trigger-1');
    expect(compiled.topologicalOrder).toEqual(['trigger-1', 'plugin-1', 'condition-1', 'action-1', 'delay-1']);
    expect(compiled.nodes).toEqual([
      expect.objectContaining({ id: 'trigger-1', type: 'trigger', next: ['plugin-1'] }),
      expect.objectContaining({ id: 'plugin-1', type: 'plugin', next: ['condition-1'], input: expect.objectContaining({ pluginId: 'calendar-booking' }) }),
      expect.objectContaining({ id: 'condition-1', type: 'condition', next: ['action-1', 'delay-1'], onTrue: 'action-1', onFalse: 'delay-1' }),
      expect.objectContaining({ id: 'action-1', type: 'action', next: [] }),
      expect.objectContaining({ id: 'delay-1', type: 'delay', next: [], input: expect.objectContaining({ delayMs: 300000 }) })
    ]);
  });

  it('rejects cycles', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'action-1', type: 'action', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-2', type: 'action', position: { x: 400, y: 0 }, data: {} }
          ],
          edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
            { id: 'edge-2', source: 'action-1', target: 'action-2' },
            { id: 'edge-3', source: 'action-2', target: 'action-1' }
          ]
        }
      })
    ).rejects.toThrow(/cycle/i);
  });

  it('rejects disconnected action nodes', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'action-1', type: 'action', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-2', type: 'action', position: { x: 400, y: 0 }, data: {} }
          ],
          edges: [{ id: 'edge-1', source: 'trigger-1', target: 'action-1' }]
        }
      })
    ).rejects.toThrow(/disconnected/i);
  });

  it('rejects missing target nodes', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [{ id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} }],
          edges: [{ id: 'edge-1', source: 'trigger-1', target: 'missing-action' }]
        }
      })
    ).rejects.toThrow(/missing target/i);
  });

  it('produces stable and deterministic topological order', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });
    const graph = {
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'action-b', type: 'action', position: { x: 200, y: -50 }, data: {} },
        { id: 'action-a', type: 'action', position: { x: 200, y: 50 }, data: {} }
      ],
      edges: [
        { id: 'edge-1', source: 'trigger-1', target: 'action-b' },
        { id: 'edge-2', source: 'trigger-1', target: 'action-a' }
      ]
    };

    const first = await compiler.compile({
      agencyId: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      version: '1.0.0',
      graph
    });

    const second = await compiler.compile({
      agencyId: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      version: '1.0.0',
      graph
    });

    expect(first.topologicalOrder).toEqual(['trigger-1', 'action-a', 'action-b']);
    expect(second.topologicalOrder).toEqual(first.topologicalOrder);
  });

  it('rejects duplicate onTrue branches for a condition node', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'condition-1', type: 'condition', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-a', type: 'action', position: { x: 400, y: -100 }, data: {} },
            { id: 'action-b', type: 'action', position: { x: 400, y: 0 }, data: {} },
            { id: 'action-c', type: 'action', position: { x: 400, y: 100 }, data: {} }
          ],
          edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
            { id: 'edge-2', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-a' },
            { id: 'edge-3', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-b' },
            { id: 'edge-4', source: 'condition-1', sourceHandle: 'onFalse', target: 'action-c' }
          ]
        }
      })
    ).rejects.toThrow(/exactly one onTrue/i);
  });

  it('rejects duplicate onFalse branches for a condition node', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'condition-1', type: 'condition', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-a', type: 'action', position: { x: 400, y: -100 }, data: {} },
            { id: 'action-b', type: 'action', position: { x: 400, y: 0 }, data: {} },
            { id: 'action-c', type: 'action', position: { x: 400, y: 100 }, data: {} }
          ],
          edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
            { id: 'edge-2', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-a' },
            { id: 'edge-3', source: 'condition-1', sourceHandle: 'onFalse', target: 'action-b' },
            { id: 'edge-4', source: 'condition-1', sourceHandle: 'onFalse', target: 'action-c' }
          ]
        }
      })
    ).rejects.toThrow(/exactly one onFalse/i);
  });

  it('rejects unexpected condition branch handles', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'condition-1', type: 'condition', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-a', type: 'action', position: { x: 400, y: -100 }, data: {} },
            { id: 'action-b', type: 'action', position: { x: 400, y: 100 }, data: {} }
          ],
          edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
            { id: 'edge-2', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-a' },
            { id: 'edge-3', source: 'condition-1', sourceHandle: 'maybe', target: 'action-b' }
          ]
        }
      })
    ).rejects.toThrow(/unsupported branch handle/i);
  });

  it('rejects missing onFalse branch for a condition node', async () => {
    const compiler = new DagCompiler({ pluginRegistry: createDefaultPluginRegistry() });

    await expect(
      compiler.compile({
        agencyId: new mongoose.Types.ObjectId().toString(),
        tenantId: new mongoose.Types.ObjectId().toString(),
        version: '1.0.0',
        graph: {
          nodes: [
            { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
            { id: 'condition-1', type: 'condition', position: { x: 200, y: 0 }, data: {} },
            { id: 'action-a', type: 'action', position: { x: 400, y: -100 }, data: {} }
          ],
          edges: [
            { id: 'edge-1', source: 'trigger-1', target: 'condition-1' },
            { id: 'edge-2', source: 'condition-1', sourceHandle: 'onTrue', target: 'action-a' }
          ]
        }
      })
    ).rejects.toThrow(/exactly one onFalse/i);
  });
});
