import type { FastifyInstance } from 'fastify';
import { registerWorkflowsRoutes } from './workflows.routes.js';

export async function workflowsRoutes(fastify: FastifyInstance) {
  await registerWorkflowsRoutes(fastify);
}
