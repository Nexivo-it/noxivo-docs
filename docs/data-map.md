# Data Map

An overview of the primary entities mapping across the packages.

## `@noxivo/database/src/models`
- `agency.ts`: `name`, `slug`, `plan`, `billingStripeCustomerId`, `whiteLabelDefaults`.
- `tenant.ts`: `agencyId`, `whiteLabelOverrides`, `billingMode`.
- `user.ts`: `email`, `role`, `passwordHash`.
- `auth-session.ts`: `userId`, `token`, `expiresAt`.
- `messaging-cluster.ts`: `baseUrl`, `capacity`, `region`, `status`.
- `messaging-session-binding.ts`: `tenantId`, `clusterId`, `messagingSessionName`, `status`.
- `conversation.ts`: `tenantId`, `contactPhone`, `status` (active/handoff).
- `message.ts`: `conversationId`, `direction`, `type`, `content`, `ackStatus`.
- `contact-profile.ts`: CRM data projected from message activity.
- `workflow-definition.ts`: `editorGraph`, `compiledDag`, `isActive`.
- `workflow-run.ts`: `workflowId`, `state`, `suspension`.
- `plugin-installation.ts`: Tenant-specific plugin configs.
- `usage-meter-event.ts` & `billing-meter-window.ts`: Usage tracking.

## `@noxivo/contracts/src`
- `auth.ts`: Roles, Login/Signup schemas.
- `branding.ts`: `WhiteLabelConfigSchema`.
- `inbox.ts`: Realtime event schemas (`message.created`, `message.delivery_updated`), `ContactProfileSchema`.
- `internal-inbox.ts`: PSK headers, outbound send payload schemas.
- `metering.ts`: `UsageMeterEventSchema`.
- `plugin.ts`: `PluginManifestSchema`.
- `workflow.ts` & `workflow-editor.ts`: DAG node and edge schemas.