import type { FastifyInstance } from 'fastify';
import { registerAgencyRoutes } from './agency.routes.js';
import { registerAgencySingleRoutes } from './agency-single.routes.js';
import { registerTenantsRoutes } from './tenants.routes.js';
import { registerTenantSingleRoutes } from './tenant-single.routes.js';
import { registerTeamRoutes } from './team.routes.js';
import { registerTeamUserRoutes } from './team-user.routes.js';
import { registerInvitationsRoutes } from './invitations.routes.js';
import { registerInvitationSingleRoutes } from './invitation-single.routes.js';

export async function agencyRoutes(fastify: FastifyInstance) {
  await registerAgencyRoutes(fastify);
  await registerAgencySingleRoutes(fastify);
  await registerTenantsRoutes(fastify);
  await registerTenantSingleRoutes(fastify);
  await registerTeamRoutes(fastify);
  await registerTeamUserRoutes(fastify);
  await registerInvitationsRoutes(fastify);
  await registerInvitationSingleRoutes(fastify);
}
