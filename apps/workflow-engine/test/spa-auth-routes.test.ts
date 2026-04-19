import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';
import { createSpaAgency } from './helpers/create-spa-agency.js';

describe('spa auth routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-auth-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('signs up a member and returns the current member session', async () => {
    const agency = await createSpaAgency({
      name: 'Spa Agency One',
      slug: 'spa-agency-one',
    });

    const server = await buildServer({ logger: false });

    try {
      const signup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          agencyId: String(agency._id),
          email: 'member@example.com',
          password: 'supersecret123',
          fullName: 'Spa Member',
        },
      });

      expect(signup.statusCode).toBe(201);
      const cookie = signup.headers['set-cookie'];
      expect(cookie).toContain('spa_member_session=');

      const me = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/auth/me',
        headers: { cookie: cookie as string },
      });

      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        user: {
          email: 'member@example.com',
          fullName: 'Spa Member',
          role: 'member',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('allows the same email to exist in different agencies', async () => {
    const agencyOne = await createSpaAgency({ name: 'Agency One', slug: 'agency-one-spa' });
    const agencyTwo = await createSpaAgency({ name: 'Agency Two', slug: 'agency-two-spa' });
    const server = await buildServer({ logger: false });

    try {
      const firstSignup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          agencyId: String(agencyOne._id),
          email: 'shared@example.com',
          password: 'supersecret123',
          fullName: 'Shared Member',
        },
      });

      const secondSignup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          agencyId: String(agencyTwo._id),
          email: 'shared@example.com',
          password: 'supersecret123',
          fullName: 'Shared Member Two',
        },
      });

      expect(firstSignup.statusCode).toBe(201);
      expect(secondSignup.statusCode).toBe(201);
    } finally {
      await server.close();
    }
  });
});
