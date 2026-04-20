# Dokploy Engine Deployment Guide ("Composer Gid")

This guide explains the specialized configuration for the Noxivo Engine stack (Workflow Engine, MongoDB, Redis) when deployed via Dokploy.

## 🚀 The "Method 1" Standard

We utilize **Dokploy Method 1 (UI-Managed Domains)**. This means Dokploy/Traefik handles the SSL and public routing entirely through the UI configuration, rather than manual labels in the compose file.

### ⚓ Docker Compose Rules (`docker-compose.engine.yml`)

1.  **Use `expose` instead of `ports`**:
    -   **Rule**: Never map ports to the host (e.g., `"3200:3000"`) for the engine service.
    -   **Why**: Traefik routes traffic internally over the `dokploy-network`. Exposing to the host creates security risks and potential port conflicts on the VPS.
    -   **Config**:
        ```yaml
        expose:
          - "3000"
        ```

2.  **Environment Sync (`env_file`)**:
    -   **Rule**: Always include `env_file: - .env`.
    -   **Why**: When you update environment variables in the Dokploy UI (Environment Tab), Dokploy writes them to a local `.env` file. This line ensures they are injected into your containers automatically.

3.  **Explicit Secret Validation**:
    -   **Rule**: Use `${VAR:?error}` for mandatory secrets.
    -   **Why**: Prevents a broken deployment from starting if a critical variable (like `MONGO_PASSWORD`) is missing from the UI.

4.  **Networking**:
    -   **Internal (`engine-net`)**: Private bridge for Engine <-> Mongo <-> Redis communication.
    -   **External (`dokploy-network`)**: Required for the Engine service to be reachable by Traefik.

## 🛠️ Operational Tasks

### How to Redeploy
1.  Push changes to `main` branch.
2.  Go to **Dokploy Dashboard** -> **Stacks** -> **Noxivo Engine**.
3.  Click **Deploy**.

### How to Verify Readiness
Check the health endpoint via the public domain:
- **Public Health**: `https://api-workflow-engine.noxivo.app/health` (Checks DB/Redis).
- **Upstream Health**: `https://api-workflow-engine.noxivo.app/api/v1/health/messaging` (Checks MessagingProvider connection, requires `X-API-Key`).

### Handling CORS
If the frontend cannot reach the engine, update the `ALLOWED_CORS_ORIGINS` in the Dokploy Environment tab:
- **Format**: `https://app1.com,https://app2.com` (Comma separated, NO trailing slashes).
