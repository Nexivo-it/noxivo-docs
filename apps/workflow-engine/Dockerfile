# Base stage for shared configuration
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Add build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/messaging-client/package.json ./packages/messaging-client/
COPY apps/workflow-engine/package.json ./apps/workflow-engine/
# Allow bcrypt to run its install script
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/messaging-client/node_modules ./packages/messaging-client/node_modules
COPY --from=deps /app/apps/workflow-engine/node_modules ./apps/workflow-engine/node_modules

COPY . .
# Build dependencies first, then the app
RUN pnpm --filter @noxivo/contracts build && \
    pnpm --filter @noxivo/database build && \
    pnpm --filter @noxivo/messaging-client build && \
    pnpm --filter @noxivo/workflow-engine build

# Runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# curl is needed for the Docker healthcheck (CMD curl /health)
RUN apk add --no-cache curl

# Copy built app and required node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/messaging-client/package.json ./packages/messaging-client/
COPY --from=builder /app/packages/messaging-client/dist ./packages/messaging-client/dist
COPY --from=builder /app/apps/workflow-engine/package.json ./apps/workflow-engine/
COPY --from=builder /app/apps/workflow-engine/dist ./apps/workflow-engine/dist
# Admin mini-dashboard static files (served at /admin/)
COPY --from=builder /app/apps/workflow-engine/public ./apps/workflow-engine/public

# Copy OpenAPI spec for messaging provider (required by routes)
COPY --from=builder /app/messaging-openapi.json /app/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# PORT is injected by docker-compose; default to 3000 for bare `docker run`
ENV PORT=3000
ENV HOST="0.0.0.0"
ENV MESSAGING_PROVIDER_OPENAPI_PATH=/app/messaging-openapi.json
EXPOSE 3000

CMD ["node", "apps/workflow-engine/dist/index.js"]
