FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── deps: install all workspace deps so pnpm links packages correctly ──────────
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/
COPY packages/messaging-client/package.json ./packages/messaging-client/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN pnpm install --frozen-lockfile

# ── builder: compile packages then Next.js ────────────────────────────────────
FROM base AS builder
WORKDIR /app
# Copy root node_modules (hoisted deps — includes zod, mongoose, etc.)
COPY --from=deps /app/node_modules ./node_modules
# Copy per-package node_modules (peer/non-hoisted deps)
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/messaging-client/node_modules ./packages/messaging-client/node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY . .
RUN pnpm --filter @noxivo/contracts build && \
    pnpm --filter @noxivo/database build && \
    pnpm --filter @noxivo/messaging-client build && \
    pnpm --filter @noxivo/dashboard build

# ── runner: minimal image that runs the Next.js standalone server ─────────────
FROM base AS runner
WORKDIR /app
RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone output — already contains its own traced node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

# Workspace packages (dist only — their deps come from root node_modules below)
COPY --from=builder --chown=nextjs:nodejs /app/packages/contracts/package.json ./packages/contracts/
COPY --from=builder --chown=nextjs:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/messaging-client/package.json ./packages/messaging-client/
COPY --from=builder --chown=nextjs:nodejs /app/packages/messaging-client/dist ./packages/messaging-client/dist

# Root node_modules (hoisted deps)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Per-package node_modules — pnpm may not hoist all deps (e.g. mongoose, zod)
# so the packages need their own node_modules available at runtime too
COPY --from=builder --chown=nextjs:nodejs /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/node_modules ./packages/database/node_modules

# Seed script — runs before Next.js to ensure platform owner user exists
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/scripts ./apps/dashboard/scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

# Seed platform owner + default agency, then start Next.js standalone server.
# Default credentials (override via env): PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_PASSWORD
CMD ["node", "apps/dashboard/scripts/seed-before-start.js"]
