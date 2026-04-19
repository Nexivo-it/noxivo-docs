import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TenantCredentialModel } from '@noxivo/database';
import { createAirtablePlugin } from '../src/modules/plugins/builtin/airtable.plugin.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb
} from './helpers/mongo-memory.js';

describe('plugin credential tenant scoping', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({
      dbName: 'noxivo-plugin-credential-scope-tests'
    });
  }, 60_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  }, 60_000);

  it('loads Airtable credentials by active tenant context', async () => {
    const plugin = createAirtablePlugin();
    const agencyId = new mongoose.Types.ObjectId().toString();
    const tenantA = new mongoose.Types.ObjectId().toString();
    const tenantB = new mongoose.Types.ObjectId().toString();

    await TenantCredentialModel.create([
      {
        agencyId,
        tenantId: tenantA,
        provider: 'airtable',
        displayName: 'Airtable A',
        encryptedData: JSON.stringify({ apiKey: 'key-tenant-a' }),
        config: {},
        status: 'active'
      },
      {
        agencyId,
        tenantId: tenantB,
        provider: 'airtable',
        displayName: 'Airtable B',
        encryptedData: JSON.stringify({ apiKey: 'key-tenant-b' }),
        config: {},
        status: 'active'
      }
    ]);

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authHeader = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify({
        records: [
          { id: 'rec-1', fields: { authHeader } }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const resultA = await plugin.execute({
      agencyId,
      tenantId: tenantA,
      config: { baseId: 'app1', tableId: 'tbl1' },
      payload: { action: 'lookupRecord', filterByFormula: '{id}=1' }
    });

    const resultB = await plugin.execute({
      agencyId,
      tenantId: tenantB,
      config: { baseId: 'app1', tableId: 'tbl1' },
      payload: { action: 'lookupRecord', filterByFormula: '{id}=1' }
    });

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    expect((resultA.output as { authHeader?: string } | null)?.authHeader).toBe('Bearer key-tenant-a');
    expect((resultB.output as { authHeader?: string } | null)?.authHeader).toBe('Bearer key-tenant-b');
  });

  it('returns explicit error when tenant has no Airtable credentials', async () => {
    const plugin = createAirtablePlugin();

    const result = await plugin.execute({
      agencyId: new mongoose.Types.ObjectId().toString(),
      tenantId: new mongoose.Types.ObjectId().toString(),
      config: { baseId: 'app1', tableId: 'tbl1' },
      payload: { action: 'lookupRecord', filterByFormula: '{id}=1' }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Airtable credentials not found for this tenant');
  });
});
