import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { dbConnect } from '../../lib/mongodb.js';
import {
  SpaAdminServiceInputSchema,
  SpaAiConciergeConfigInputSchema,
  SpaBookingCreateInputSchema,
  SpaGalleryImageInputSchema,
  SpaLoginInputSchema,
  SpaMediaStorageConfigSchema,
  SpaSignupInputSchema,
  SpaSiteSettingsInputSchema,
} from '@noxivo/contracts';
import {
  SpaAiConciergeConfigModel,
  AgencyModel,
  SpaBookingModel,
  SpaCustomerProfileModel,
  SpaGalleryImageModel,
  SpaMediaStorageConfigModel,
  SpaMemberModel,
  SpaSiteSettingsModel,
  SpaServiceCategoryModel,
  SpaServiceModel,
  SpaSessionModel,
} from '@noxivo/database';
import {
  createSpaMember,
  createSpaSession,
  findSpaMemberByCredentials,
  hashSpaSessionToken,
  serializeSpaMember,
} from '../../modules/spa/auth.service.js';
import { getSpaMemberFromRequest, requireSpaAdmin, requireSpaMember, SPA_SESSION_COOKIE_NAME } from '../../modules/spa/http-auth.js';
import { serializeSpaService } from '../../modules/spa/serializers.js';
import { upsertSpaCustomerProjectionFromBooking } from '../../modules/spa/customer-profile.service.js';

function redactMediaConfig(config: {
  _id?: unknown;
  provider: string;
  isActive: boolean;
  publicBaseUrl?: string | null;
  publicConfig?: Record<string, string | number | boolean | null> | null;
  pathPrefix?: string | null;
}) {
  return {
    ...(config._id ? { id: String(config._id) } : {}),
    provider: config.provider,
    isActive: config.isActive,
    publicBaseUrl: config.publicBaseUrl,
    publicConfig: config.publicConfig ?? {},
    pathPrefix: config.pathPrefix ?? '',
  };
}

function getStringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidate = record[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function getAgencyIdFromRequest(request: FastifyRequest): string | null {
  const fromHeader = request.headers['x-agency-id'];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) {
    return fromHeader;
  }

  return request.context?.agencyId
    ?? getStringProperty(request.query, 'agencyId')
    ?? getStringProperty(request.body, 'agencyId');
}

async function requireSpaAgency(request: FastifyRequest, reply: { status(code: number): { send(payload: { error: string }): unknown } }) {
  const agencyId = getAgencyIdFromRequest(request);
  if (!agencyId) {
    await reply.status(400).send({ error: 'agencyId is required' });
    return null;
  }

  const agency = await AgencyModel.findById(agencyId).lean();
  if (!agency) {
    await reply.status(404).send({ error: 'Agency not found' });
    return null;
  }

  return agency;
}

export async function registerSpaRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/spa/bookings', async (request, reply) => {
    await dbConnect();
    const input = SpaBookingCreateInputSchema.parse(request.body);
    const member = await getSpaMemberFromRequest(request);
    const agency = member
      ? await AgencyModel.findById(member.agencyId).lean()
      : await requireSpaAgency(request, reply);
    if (!agency) {
      return;
    }

    const services = await SpaServiceModel.find({
      agencyId: agency._id,
      _id: { $in: input.serviceIds },
      isActive: true,
    }).lean();

    if (services.length !== input.serviceIds.length) {
      return reply.status(404).send({ error: 'One or more services were not found' });
    }

    const selectedServices = services.map((service) => ({
      serviceId: String(service._id),
      name: service.name,
      price: service.price,
      duration: service.durationLabel,
    }));
    const totalPrice = selectedServices.reduce((sum, service) => sum + service.price, 0);

    const booking = await SpaBookingModel.create({
      agencyId: agency._id,
      memberId: member?._id ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      appointmentDateIso: input.appointmentDateIso,
      appointmentDateLabel: input.appointmentDateLabel,
      appointmentTime: input.appointmentTime,
      selectedServices,
      totalPrice,
      status: 'pending',
      notes: input.notes ?? '',
      source: member ? 'member' : 'guest',
    });

    await upsertSpaCustomerProjectionFromBooking({
      agencyId: agency._id,
      memberId: member?._id ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      customerPhone: input.customerPhone ?? null,
      bookingStatus: 'pending',
      appointmentDateLabel: input.appointmentDateLabel,
      bookedAt: booking.createdAt,
    });

    return reply.status(201).send({
      booking: {
        id: String(booking._id),
        appointmentDateIso: booking.appointmentDateIso,
        appointmentDateLabel: booking.appointmentDateLabel,
        appointmentTime: booking.appointmentTime,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        services: booking.selectedServices,
        totalPrice: booking.totalPrice,
        status: booking.status,
        notes: booking.notes,
      },
    });
  });

  fastify.get('/api/v1/spa/catalog/services', async (_request, reply) => {
    await dbConnect();
    const request = _request;
    const agency = await requireSpaAgency(request, reply);
    if (!agency) {
      return;
    }

    const [services, categories, mediaConfig] = await Promise.all([
      SpaServiceModel.find({ agencyId: agency._id, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      SpaServiceCategoryModel.find({ agencyId: agency._id, isActive: true }).lean(),
      SpaMediaStorageConfigModel.findOne({ agencyId: agency._id, isActive: true }).sort({ updatedAt: -1 }).lean(),
    ]);

    const categoryNames = new Map(
      categories.map((category: { _id: unknown; name: string }) => [String(category._id), category.name]),
    );
    const activeMediaConfig = mediaConfig
      ? {
          provider: mediaConfig.provider,
          publicBaseUrl: typeof mediaConfig.publicBaseUrl === 'string' ? mediaConfig.publicBaseUrl : null,
          pathPrefix: typeof mediaConfig.pathPrefix === 'string' ? mediaConfig.pathPrefix : null,
        }
      : null;
    const serialized = services.map((service: { categoryId: unknown; _id: { toString(): string } | string | number | bigint | boolean | null | undefined; name: string; description?: string | null; price?: number | null; durationLabel?: string | null; imageRef?: string | null }) =>
      serializeSpaService(service, categoryNames.get(String(service.categoryId)) ?? null, activeMediaConfig),
    );

    return reply.status(200).send(serialized);
  });

  fastify.post('/api/v1/spa/auth/sign-up', async (request, reply) => {
    await dbConnect();
    const input = SpaSignupInputSchema.parse(request.body);
    const agency = await AgencyModel.findById(input.agencyId).lean();
    if (!agency) {
      return reply.status(404).send({ error: 'Agency not found' });
    }

    const existing = await SpaMemberModel.findOne({ agencyId: agency._id, email: input.email }).lean();
    if (existing) {
      return reply.status(409).send({ error: 'Member already exists' });
    }

    const member = await createSpaMember({
      agencyId: agency._id,
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      phone: input.phone,
    });
    const { token, expiresAt } = await createSpaSession({
      agencyId: agency._id,
      memberId: member._id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    reply.setCookie(SPA_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return reply.status(201).send({ user: serializeSpaMember(member) });
  });

  fastify.post('/api/v1/spa/auth/sign-in', async (request, reply) => {
    await dbConnect();
    const input = SpaLoginInputSchema.parse(request.body);
    const agency = await AgencyModel.findById(input.agencyId).lean();
    if (!agency) {
      return reply.status(404).send({ error: 'Agency not found' });
    }

    const member = await findSpaMemberByCredentials({
      agencyId: agency._id,
      email: input.email,
      password: input.password,
    });

    if (!member || member.status !== 'active') {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const { token, expiresAt } = await createSpaSession({
      agencyId: agency._id,
      memberId: member._id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    reply.setCookie(SPA_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return reply.status(200).send({ user: serializeSpaMember(member) });
  });

  fastify.post('/api/v1/spa/auth/sign-out', async (request, reply) => {
    await dbConnect();
    const member = await requireSpaMember(request, reply);
    if (!member) {
      return;
    }

    const cookieHeader = request.headers.cookie;
    const cookieMatch = cookieHeader?.match(/(?:^|;\s*)spa_member_session=([^;]+)/);
    if (cookieMatch?.[1]) {
      await SpaSessionModel.updateOne(
        { tokenHash: hashSpaSessionToken(decodeURIComponent(cookieMatch[1])) },
        { $set: { revokedAt: new Date() } },
      ).exec();
    }

    reply.clearCookie(SPA_SESSION_COOKIE_NAME, { path: '/' });
    return reply.status(200).send({ success: true });
  });

  fastify.get('/api/v1/spa/auth/me', async (request, reply) => {
    await dbConnect();
    const member = await requireSpaMember(request, reply);
    if (!member) {
      return;
    }

    return reply.status(200).send({ user: serializeSpaMember(member) });
  });

  fastify.get('/api/v1/spa/account/bookings', async (request, reply) => {
    await dbConnect();
    const member = await requireSpaMember(request, reply);
    if (!member) {
      return;
    }

    const agencyBookings = await SpaBookingModel.find({
      agencyId: member.agencyId,
      memberId: member._id,
    }).sort({ createdAt: -1 }).lean();
    return reply.status(200).send({
      bookings: agencyBookings.map((booking) => ({
        id: String(booking._id),
        appointmentDateIso: booking.appointmentDateIso,
        appointmentDateLabel: booking.appointmentDateLabel,
        appointmentTime: booking.appointmentTime,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        services: booking.selectedServices,
        totalPrice: booking.totalPrice,
        status: booking.status,
        notes: booking.notes,
      })),
    });
  });

  fastify.get('/api/v1/spa/account/profile', async (request, reply) => {
    await dbConnect();
    const member = await requireSpaMember(request, reply);
    if (!member) {
      return;
    }

    return reply.status(200).send({
      profile: {
        displayName: member.fullName,
        email: member.email,
        phone: member.phone ?? '',
        avatarUrl: member.avatarUrl ?? '',
        hasProfile: true,
      },
    });
  });

  fastify.put('/api/v1/spa/account/profile', async (request, reply) => {
    await dbConnect();
    const member = await requireSpaMember(request, reply);
    if (!member) {
      return;
    }

    const body = request.body as { displayName?: string; phone?: string };
    const updated = await SpaMemberModel.findByIdAndUpdate(
      member._id,
      {
        $set: {
          fullName: body.displayName?.trim() || member.fullName,
          phone: body.phone?.trim() || null,
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    await SpaCustomerProfileModel.findOneAndUpdate(
      { agencyId: member.agencyId, memberId: member._id },
      {
        $set: {
          fullName: updated.fullName,
          phone: updated.phone ?? null,
          email: updated.email,
        },
      },
      { new: true },
    ).exec();

    return reply.status(200).send({
      profile: {
        displayName: updated.fullName,
        email: updated.email,
        phone: updated.phone ?? '',
        avatarUrl: updated.avatarUrl ?? '',
        hasProfile: true,
      },
    });
  });

  fastify.get('/api/v1/spa/admin/customers', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const customers = await SpaCustomerProfileModel.find({ agencyId: admin.agencyId }).sort({ updatedAt: -1 }).lean();
    return reply.status(200).send({
      customers: customers.map((customer) => ({
        id: String(customer._id),
        name: customer.fullName,
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        bookingCount: customer.bookingCount,
        lastBookingLabel: customer.lastBookingLabel ?? '',
        lastStatus: customer.lastBookingStatus,
        avatarUrl: '',
      })),
    });
  });

  fastify.get('/api/v1/spa/admin/services', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const [services, categories, mediaConfig] = await Promise.all([
      SpaServiceModel.find({ agencyId: admin.agencyId }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      SpaServiceCategoryModel.find({ agencyId: admin.agencyId }).lean(),
      SpaMediaStorageConfigModel.findOne({ agencyId: admin.agencyId, isActive: true }).sort({ updatedAt: -1 }).lean(),
    ]);

    const categoryNames = new Map(categories.map((category) => [String(category._id), category.name]));
    const activeMediaConfig = mediaConfig
      ? {
          provider: mediaConfig.provider,
          publicBaseUrl: typeof mediaConfig.publicBaseUrl === 'string' ? mediaConfig.publicBaseUrl : null,
          pathPrefix: typeof mediaConfig.pathPrefix === 'string' ? mediaConfig.pathPrefix : null,
        }
      : null;

    return reply.status(200).send(
      services.map((service) => ({
        ...serializeSpaService(service, categoryNames.get(String(service.categoryId)) ?? null, activeMediaConfig),
        categoryId: String(service.categoryId),
        slug: service.slug,
        isActive: service.isActive,
        sortOrder: service.sortOrder,
        kind: service.kind,
        imageRef: service.imageRef ?? null,
      })),
    );
  });

  fastify.post('/api/v1/spa/admin/services', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const input = SpaAdminServiceInputSchema.parse(request.body);
    const category = await SpaServiceCategoryModel.findOne({
      _id: input.categoryId,
      agencyId: admin.agencyId,
    }).lean();
    if (!category) {
      return reply.status(404).send({ error: 'Category not found' });
    }

    const service = await SpaServiceModel.create({
      agencyId: admin.agencyId,
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      price: input.price,
      durationLabel: input.duration,
      imageRef: input.imageRef ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      kind: input.kind,
    });

    return reply.status(201).send({
      id: String(service._id),
      name: service.name,
    });
  });

  fastify.put('/api/v1/spa/admin/media-storage', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const input = SpaMediaStorageConfigSchema.parse(request.body);
    const config = await SpaMediaStorageConfigModel.findOneAndUpdate(
      { agencyId: admin.agencyId },
      {
        $set: {
          agencyId: admin.agencyId,
          provider: input.provider,
          isActive: input.isActive,
          publicBaseUrl: input.publicBaseUrl,
          publicConfig: input.publicConfig,
          secretConfig: input.secretConfig,
          pathPrefix: input.pathPrefix,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return reply.status(200).send(redactMediaConfig(config));
  });

  fastify.get('/api/v1/spa/admin/media-storage', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const config = await SpaMediaStorageConfigModel.findOne({ agencyId: admin.agencyId }).lean();
    return reply.status(200).send(config ? redactMediaConfig(config) : null);
  });

  fastify.put('/api/v1/spa/admin/site-settings', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const input = SpaSiteSettingsInputSchema.parse(request.body);
    const settings = await SpaSiteSettingsModel.findOneAndUpdate(
      { agencyId: admin.agencyId },
      { $set: { ...input, agencyId: admin.agencyId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return reply.status(200).send(settings);
  });

  fastify.get('/api/v1/spa/admin/site-settings', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const settings = await SpaSiteSettingsModel.findOne({ agencyId: admin.agencyId }).lean();
    return reply.status(200).send(settings ?? {});
  });

  fastify.post('/api/v1/spa/admin/gallery', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const input = SpaGalleryImageInputSchema.parse(request.body);
    const image = await SpaGalleryImageModel.create({
      agencyId: admin.agencyId,
      ...input,
    });
    return reply.status(201).send({
      id: String(image._id),
      url: image.url,
      alt: image.alt,
      category: image.category,
      sortOrder: image.sortOrder,
      isActive: image.isActive,
    });
  });

  fastify.get('/api/v1/spa/admin/gallery', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const gallery = await SpaGalleryImageModel.find({ agencyId: admin.agencyId }).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return reply.status(200).send(gallery.map((image) => ({
      id: String(image._id),
      url: image.url,
      alt: image.alt,
      category: image.category,
      sortOrder: image.sortOrder,
      isActive: image.isActive,
    })));
  });

  fastify.put('/api/v1/spa/admin/ai-concierge', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const input = SpaAiConciergeConfigInputSchema.parse(request.body);
    const config = await SpaAiConciergeConfigModel.findOneAndUpdate(
      { agencyId: admin.agencyId },
      { $set: { ...input, agencyId: admin.agencyId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return reply.status(200).send(config);
  });

  fastify.get('/api/v1/spa/admin/ai-concierge', async (request, reply) => {
    await dbConnect();
    const admin = await requireSpaAdmin(request, reply);
    if (!admin) {
      return;
    }

    const config = await SpaAiConciergeConfigModel.findOne({ agencyId: admin.agencyId }).lean();
    return reply.status(200).send(config ?? {});
  });
}
