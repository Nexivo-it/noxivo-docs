import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  SpaBookingModel,
  SpaCustomerProfileModel,
  SpaMemberModel,
  SpaServiceCategoryModel,
  SpaServiceModel,
} from '@noxivo/database';
import { buildServer } from '../src/server.js';
import {
  connectWorkflowEngineTestDb,
  disconnectWorkflowEngineTestDb,
  resetWorkflowEngineTestDb,
} from './helpers/mongo-memory.js';
import { createSpaAgency } from './helpers/create-spa-agency.js';

describe('spa booking routes', () => {
  beforeAll(async () => {
    await connectWorkflowEngineTestDb({ dbName: 'noxivo-spa-booking-tests' });
  });

  afterEach(async () => {
    await resetWorkflowEngineTestDb();
  });

  afterAll(async () => {
    await disconnectWorkflowEngineTestDb();
  });

  it('creates a guest booking with service snapshots and customer projection', async () => {
    const agency = await createSpaAgency({ name: 'Booking Agency', slug: 'booking-agency' });
    const category = await SpaServiceCategoryModel.create({
      agencyId: agency._id,
      name: 'Pedicures',
      slug: 'pedicures',
      isActive: true,
      sortOrder: 0,
    });

    const service = await SpaServiceModel.create({
      agencyId: agency._id,
      categoryId: category._id,
      name: 'Silk Pedicure',
      slug: 'silk-pedicure',
      description: 'Hydrating service',
      price: 85,
      durationLabel: '60 MINS',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/bookings',
        payload: {
          agencyId: String(agency._id),
          customerName: 'Guest Booker',
          customerEmail: 'guest@example.com',
          customerPhone: '+15550001111',
          appointmentDateIso: '2026-04-21',
          appointmentDateLabel: 'Tuesday, April 21, 2026',
          appointmentTime: '1:30 PM',
          serviceIds: [String(service._id)],
          notes: 'First visit',
        },
      });

      expect(response.statusCode).toBe(201);

      const booking = await SpaBookingModel.findOne({ customerEmail: 'guest@example.com' }).lean();
      expect(booking?.selectedServices).toHaveLength(1);
      expect(booking?.selectedServices?.[0]).toMatchObject({
        name: 'Silk Pedicure',
        price: 85,
        duration: '60 MINS',
      });
      expect(booking?.totalPrice).toBe(85);

      const customer = await SpaCustomerProfileModel.findOne({ email: 'guest@example.com' }).lean();
      expect(customer).toMatchObject({
        fullName: 'Guest Booker',
        bookingCount: 1,
        lastBookingStatus: 'pending',
      });
    } finally {
      await server.close();
    }
  });

  it('returns member account bookings and updates member profile', async () => {
    const agency = await createSpaAgency({ name: 'Member Agency', slug: 'member-agency' });
    const category = await SpaServiceCategoryModel.create({
      agencyId: agency._id,
      name: 'Artistry',
      slug: 'artistry',
      isActive: true,
      sortOrder: 0,
    });

    const service = await SpaServiceModel.create({
      agencyId: agency._id,
      categoryId: category._id,
      name: 'Custom Artistry',
      slug: 'custom-artistry',
      description: 'Bespoke design service',
      price: 120,
      durationLabel: '90 MINS',
      isActive: true,
      sortOrder: 0,
      kind: 'service',
    });

    const server = await buildServer({ logger: false });

    try {
      const signup = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/auth/sign-up',
        payload: {
          agencyId: String(agency._id),
          email: 'member.bookings@example.com',
          password: 'supersecret123',
          fullName: 'Booking Member',
        },
      });

      expect(signup.statusCode).toBe(201);
      const cookie = signup.headers['set-cookie'] as string;

      const createBooking = await server.inject({
        method: 'POST',
        url: '/api/v1/spa/bookings',
        headers: { cookie },
        payload: {
          agencyId: String(agency._id),
          customerName: 'Booking Member',
          customerEmail: 'member.bookings@example.com',
          customerPhone: '+15552223333',
          appointmentDateIso: '2026-04-22',
          appointmentDateLabel: 'Wednesday, April 22, 2026',
          appointmentTime: '3:00 PM',
          serviceIds: [String(service._id)],
        },
      });

      expect(createBooking.statusCode).toBe(201);

      const bookings = await server.inject({
        method: 'GET',
        url: '/api/v1/spa/account/bookings',
        headers: { cookie },
      });

      expect(bookings.statusCode).toBe(200);
      expect(bookings.json()).toMatchObject({
        bookings: [
          expect.objectContaining({
            customerName: 'Booking Member',
            totalPrice: 120,
          }),
        ],
      });

      const updateProfile = await server.inject({
        method: 'PUT',
        url: '/api/v1/spa/account/profile',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        payload: {
          displayName: 'Updated Member',
          phone: '+15554445555',
        },
      });

      expect(updateProfile.statusCode).toBe(200);
      expect(updateProfile.json()).toMatchObject({
        profile: {
          displayName: 'Updated Member',
          email: 'member.bookings@example.com',
          phone: '+15554445555',
        },
      });

      const member = await SpaMemberModel.findOne({ email: 'member.bookings@example.com' }).lean();
      expect(member).toMatchObject({
        fullName: 'Updated Member',
        phone: '+15554445555',
      });
    } finally {
      await server.close();
    }
  });
});
