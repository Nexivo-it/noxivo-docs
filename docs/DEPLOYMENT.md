# Noxivo SaaS Deployment Guide

This document outlines the standard procedures for preparing, deploying, and maintaining the Noxivo SaaS platform.

## 🛡️ Manual-Only Deployment Policy

To ensure stability and intentional releases, **automatic deployments are disabled** for the main production sites.

- **Objective**: Prevent accidental breaks during active development cycles.
- **Process**: Deployments must be triggered manually by an authorized developer or an agent (like Antigravity) only after successful verification.
- **Configuration**: Ensure "Auto-publishing" is set to "Off" in the Netlify site settings.

## 🚀 Backend Infrastructure (`workflow-engine`)

The backend is orchestrated using Docker Compose on **Dokploy**.

> [!TIP]
> For detailed instructions on managing the engine stack, ports, and networking on Dokploy, see the **[Dokploy Engine Guide](./DOKPLOY_ENGINE.md)**.

It requires a connection to a **Remote MessagingProvider instance**.

### Core Stack
- **Engine**: Fastify-based node service.
- **Database**: MongoDB (v7.0).
- **Cache**: Redis (v7.2).
- **MessagingProvider**: Remote instance (Plus or Core).

### Quick Start
1. Copy `.env.example` to `.env`.
2. Update the `MessagingProvider_PROXY_*` values with your remote instance credentials.
3. Run the stack:
   ```bash
   docker compose up -d
   ```

## 🎨 Frontend Deployment (Netlify)

The dashboard and landing pages are hosted on Netlify.

### Apps and URLs
- **Main Dashboard**: [noxivo-saas.netlify.app](https://noxivo-saas.netlify.app)
- **Admin Portal**: [noxivo-admin-portal.netlify.app](https://noxivo-admin-portal.netlify.app)
- **Landing Page**: [noxivo-landing-saas.netlify.app](https://noxivo-landing-saas.netlify.app)

### Manual Deployment Procedure
1. Build the specific app:
   ```bash
   pnpm --filter @noxivo/<app-name> build
   ```
2. Deploy via Netlify CLI (or using the `netlify` MCP tools):
   ```bash
   # Example for Admin Portal
   pnpm --filter @noxivo/dashboard-admin build
   # Use MCP tool: netlify-deploy-site --deployDirectory apps/dashboard-admin/dist --siteId <SITE_ID>
   ```

## 🛠️ MCP Tooling Reference

For AI agents assisting with operations, use the following MCP tools for deployment tasks:

- **`netlify` Server**:
  - `list_sites`: Get current site IDs and status.
  - `deploy_site`: Manually push a directory to production.
- **`chrome-devtools` Server**:
  - `take_screenshot`: Verify the live site appearance after deployment.
  - `lighthouse_audit`: Check performance and SEO metrics on the live URL.

## 🧪 Verification Checklist
- [ ] `pnpm build` passes for all packages.
- [ ] Backend health check `/health` returns 200.
- [ ] Remote MessagingProvider connection is stable (check logs: `docker compose logs workflow-engine`).
- [ ] Frontend routes are correctly redirected via `netlify.toml`.
