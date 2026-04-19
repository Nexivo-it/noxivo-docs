import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';
import {
  SpaMediaStorageConfigModel,
  SpaServiceCategoryModel,
  SpaServiceModel,
} from '@noxivo/database';
import { createSpaAgency } from './helpers/create-spa-agency.js';

describe('spa catalog routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-catalog-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('returns active services with ImageKit-resolved image_url values', async () => {
    const agency = await createSpaAgency({
      name: 'Catalog Agency',
      slug: 'catalog-agency',
    });

    const category = await SpaServiceCategoryModel.create({
      agencyId: agency._id,
      name: 'Manicures',
      slug: 'manicures',
      isActive: true,
      sortOrder: 0,
    });

    await SpaMediaStorageConfigModel.create({
      agencyId: agency._id,
      provider: 'imagekit',
      isActive: true,
      publicBaseUrl: 'https://ik.imagekit.io/luxenail',
    });

    await SpaServiceModel.create({
      agencyId: agency._id,
      categoryId: category._id,
      name: 'Signature Manicure',
      slug: 'signature-manicure',
      description: 'Classic service',
      price: 65,
      durationLabel: '45 MINS',
      imageRef: '/services/signature.png',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/spa/catalog/services?agencyId=${String(agency._id)}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          name: 'Signature Manicure',
          image_url: 'https://ik.imagekit.io/luxenail/services/signature.png',
        }),
      ]);
    } finally {
      await server.close();
    }
  });

  it('filters public catalog services by agency', async () => {
    const agencyOne = await createSpaAgency({ name: 'Agency One Catalog', slug: 'agency-one-catalog' });
    const agencyTwo = await createSpaAgency({ name: 'Agency Two Catalog', slug: 'agency-two-catalog' });

    const categoryOne = await SpaServiceCategoryModel.create({ agencyId: agencyOne._id, name: 'One', slug: 'one', isActive: true, sortOrder: 0 });
    const categoryTwo = await SpaServiceCategoryModel.create({ agencyId: agencyTwo._id, name: 'Two', slug: 'two', isActive: true, sortOrder: 0 });

    await SpaServiceModel.create({
      agencyId: agencyOne._id,
      categoryId: categoryOne._id,
      name: 'Agency One Service',
      slug: 'agency-one-service',
      description: 'Agency one',
      price: 50,
      durationLabel: '30 MINS',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    await SpaServiceModel.create({
      agencyId: agencyTwo._id,
      categoryId: categoryTwo._id,
      name: 'Agency Two Service',
      slug: 'agency-two-service',
      description: 'Agency two',
      price: 60,
      durationLabel: '40 MINS',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/spa/catalog/services?agencyId=${String(agencyOne._id)}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({ name: 'Agency One Service' }),
      ]);
    } finally {
      await server.close();
    }
  });
});
