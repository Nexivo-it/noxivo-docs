# Environment Configuration

The Noxivo Engine is configured using environment variables. These can be defined in a `.env.engine` file for local development or within your container orchestration platform.

## Configuration Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB connection string. | `mongodb://localhost:27017/noxivo` |
| `REDIS_URL` | Redis connection string. | `redis://localhost:6379` |
| `ADAPTER_API_KEY` | Secret key for internal messaging adapter communication. | *Required* |
| `ADAPTER_WEBHOOK_SECRET` | Secret used to sign outgoing webhooks from the adapter. | *Required* |
| `MESSAGING_PROVIDER_BASE_URL` | Base URL for the WhatsApp messaging provider service. | `https://api-workflow-engine.noxivo.app` |
| `MESSAGING_PROVIDER_API_KEY` | API Key for authenticating with the messaging provider. | *Required* |
| `ENGINE_API_KEY` | Default public API key for the engine (legacy). | *Optional* |
| `WORKFLOW_ENGINE_INTERNAL_PSK` | Pre-Shared Key for dashboard-to-engine trusted calls. | *Required* |
| `ENGINE_PORT` | The port the engine server listens on. | `3200` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`). | `development` |

## Security Best Practices

1.  **Never Commit Secrets**: Do not commit `.env` files or hardcoded keys to version control.
2.  **Rotate Keys**: Regularly rotate `ADAPTER_API_KEY` and `WORKFLOW_ENGINE_INTERNAL_PSK`.
3.  **Production Scoping**: In production, ensure MongoDB and Redis are not accessible from the public internet.
