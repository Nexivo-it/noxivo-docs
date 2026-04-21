import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  SpaMemberModel,
  SpaServiceCategoryModel,
} from '@noxivo/database';
import { createSpaAgency } from './helpers/create-spa-agency.js';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';

describe('spa admin routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-admin-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('rejects admin service creation without an admin session', async () => {
    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/admin/services',
        payload: {
          name: 'New Service',
          categoryName: 'Manicures',
          price: 99,
          duration: '45 MINS',
        },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('allows an admin to manage services, settings, gallery, customers, and ai config', async () => {
    const agency = await createSpaAgency({ name: 'Admin Agency', slug: 'admin-agency' });
    const category = await SpaServiceCategoryModel.create({
      agencyId: agency._id,
      name: 'Manicures',
      slug: 'manicures',
      isActive: true,
      sortOrder: 0,
    });

    const server = await buildServer({ logger: false });

    try {
      const signup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          agencyId: String(agency._id),
          email: 'spa.admin@example.com',
          password: 'supersecret123',
          fullName: 'Spa Admin',
        },
      });

      expect(signup.statusCode).toBe(201);

      await SpaMemberModel.updateOne(
        { email: 'spa.admin@example.com' },
        { $set: { role: 'admin' } },
      ).exec();

      const cookie = signup.headers['set-cookie'] as string;

      const createService = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/admin/services',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          categoryId: String(category._id),
          name: 'Signature Manicure',
          slug: 'signature-manicure-admin',
          description: 'Admin-created service',
          price: 65,
          duration: '45 MINS',
          imageRef: '/services/signature-admin.png',
          isActive: true,
          sortOrder: 0,
          kind: 'service',
        },
      });

      expect(createService.statusCode).toBe(201);
      const createdService = createService.json();

      const updateSettings = await server.inject({
        method: 'PUT',
        url: '/api/v1/spa/admin/site-settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          salonName: 'Spa Tique Nails',
          tagline: 'Luxury Nail Art & Spa Services',
          phone: '(561) 336-3507',
          email: 'spatiquenailsboynton@gmail.com',
          address: '10833 S Jog Rd, Boynton Beach, FL 33437',
        },
      });

      expect(updateSettings.statusCode).toBe(200);

      const createGallery = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/admin/gallery',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          url: '/gallery/nails-1.png',
          alt: 'Nail design',
          category: 'General',
          sortOrder: 0,
          isActive: true,
        },
      });

      expect(createGallery.statusCode).toBe(201);

      const updateAi = await server.inject({
        method: 'PUT',
        url: '/api/v1/spa/admin/ai-concierge',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          personaName: 'Aria',
          openingMessage: 'Welcome to Spa Tique',
          systemPrompt: 'Be warm and elegant.',
          model: 'gemini-pro',
          temperature: 0.7,
          webhookUrl: 'https://example.com/webhook',
          suggestedPrompts: ['Tell me about your services'],
          active: true,
        },
      });

      expect(updateAi.statusCode).toBe(200);

      const listCustomers = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/admin/customers',
        headers: { cookie },
      });

      expect(listCustomers.statusCode).toBe(200);
      expect(listCustomers.json()).toMatchObject({
        customers: expect.any(Array),
      });

      const listServices = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/admin/services',
        headers: { cookie },
      });

      expect(listServices.statusCode).toBe(200);
      expect(listServices.json()).toEqual([
        expect.objectContaining({ id: createdService.id, name: 'Signature Manicure' }),
      ]);

      const getSettings = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/admin/site-settings',
        headers: { cookie },
      });

      expect(getSettings.statusCode).toBe(200);
      expect(getSettings.json()).toMatchObject({ salonName: 'Spa Tique Nails' });

      const listGallery = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/admin/gallery',
        headers: { cookie },
      });

      expect(listGallery.statusCode).toBe(200);
      expect(listGallery.json()).toEqual([
        expect.objectContaining({ alt: 'Nail design' }),
      ]);

      const getAi = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/admin/ai-concierge',
        headers: { cookie },
      });

      expect(getAi.statusCode).toBe(200);
      expect(getAi.json()).toMatchObject({ personaName: 'Aria', active: true });
    } finally {
      await server.close();
    }
  });
});
