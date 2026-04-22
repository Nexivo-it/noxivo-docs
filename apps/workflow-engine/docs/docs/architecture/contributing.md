# Contributing Guide

This guide covers the standards and patterns for extending the Noxivo Workflow Engine.

## Local Development

### 1. Prerequisites
- **Node.js**: v20 or newer
- **pnpm**: v9 or newer
- **Docker**: For running MongoDB and Redis locally

### 2. Setup
```bash
# Install dependencies
pnpm install

# Start infrastructure
docker-compose up -d mongodb redis

# Run engine in watch mode
pnpm --filter @noxivo/workflow-engine dev
```

---

## Adding a New Route

We use a "Schema-First" approach. Every route must have a validation schema.

### 1. Define the Schema
In your route file (e.g., `src/routes/v1/my-feature.routes.ts`):

```typescript
const MySchema = {
  summary: 'My New Action',
  description: 'Does something awesome.',
  tags: ['Features'],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', example: 'Noxivo' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' }
      }
    }
  }
};
```

### 2. Register the Route
```typescript
export async function registerMyRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/my-action', { schema: MySchema }, async (request, reply) => {
    // Controller logic here
    return { success: true };
  });
}
```

---

## Coding Standards

1.  **Strict Typing**: Always use TypeScript. Avoid `any`.
2.  **Async/Await**: Use modern async patterns. Handle errors explicitly or let the global error handler catch them.
3.  **Validation**: Never trust client input. Always use Fastify schemas.
4.  **Logging**: Use `request.log` for route-specific logging and `fastify.log` for global system logs.
5.  **Documentation**: If you add a route, ensure its OpenAPI metadata (summary, description, examples) is complete so it appears correctly in the SDK Docs.

---

## Testing

We use **Vitest** for testing.
-   **Unit Tests**: Place in `test/` folder or alongside the file.
-   **Integration Tests**: Use `fastify.inject()` to test routes without actually binding to a port.

```bash
pnpm --filter @noxivo/workflow-engine test
```
