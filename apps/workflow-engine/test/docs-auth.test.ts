import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signDocsToken(secret: string, payload: Record<string, unknown>): string {
  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = toBase64Url(serializedPayload);
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

describe('workflow-engine docs auth bridge', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-docs-auth-tests' });
  });

  beforeEach(() => {
    process.env.WORKFLOW_ENGINE_INTERNAL_PSK = 'shared-docs-secret';
    process.env.DASHBOARD_PUBLIC_BASE_URL = 'https://noxivo.app';
  });

  afterEach(async () => {
    delete process.env.WORKFLOW_ENGINE_INTERNAL_PSK;
    delete process.env.DASHBOARD_PUBLIC_BASE_URL;
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('redirects anonymous docs requests to the dashboard docs entrypoint', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: '/docs',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://noxivo.app/dashboard/engine-docs?returnTo=%2Fdocs');
    } finally {
      await server.close();
    }
  });

  it('mints a docs cookie from a valid dashboard bridge token and then serves /docs/json', async () => {
    const server = await buildServer({ logger: false });

    try {
      const token = signDocsToken(process.env.WORKFLOW_ENGINE_INTERNAL_PSK as string, {
        sub: 'user-1',
        email: 'owner@example.com',
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      const authorizeResponse = await server.inject({
        method: 'GET',
        url: `/docs/authorize?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent('/docs')}`,
      });

      expect(authorizeResponse.statusCode).toBe(302);
      expect(authorizeResponse.headers.location).toBe('/docs');
      const setCookie = authorizeResponse.headers['set-cookie'];
      expect(setCookie).toContain('noxivo_docs_access=');

      const docsJsonResponse = await server.inject({
        method: 'GET',
        url: '/docs/json',
        headers: {
          cookie: Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie as string),
        },
      });

      expect(docsJsonResponse.statusCode).toBe(200);
      expect(docsJsonResponse.json()).toMatchObject({
        openapi: expect.any(String),
        info: expect.objectContaining({
          title: 'Noxivo Engine API',
        }),
      });
    } finally {
      await server.close();
    }
  });
});
