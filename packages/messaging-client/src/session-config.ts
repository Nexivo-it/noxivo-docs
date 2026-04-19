export interface SessionConfigOptions {
  sessionName: string;
  agencyId: string;
  tenantId: string;
  clusterId: string;
  sessionBindingId: string;
  accountName?: string | null;
  webhookBaseUrl?: string;
  webhookSecret?: string;
}

function buildWebhookCustomHeaders(options: SessionConfigOptions): Array<{ name: string; value: string }> {
  const headers = [
    { name: 'x-nexus-cluster-id', value: options.clusterId },
    { name: 'x-nexus-agency-id', value: options.agencyId },
    { name: 'x-nexus-tenant-id', value: options.tenantId },
    { name: 'x-nexus-session-binding-id', value: options.sessionBindingId }
  ];

  if (options.webhookSecret) {
    headers.push({ name: 'x-messaging-webhook-secret', value: options.webhookSecret });
  }

  return headers;
}

export function createMessagingSessionPayload(options: SessionConfigOptions) {
  const webhooks = [];
  
  if (options.webhookBaseUrl) {
    webhooks.push({
      url: `${options.webhookBaseUrl.replace(/\/$/, '')}/v1/webhooks/messaging`,
      events: ['message', 'message.any', 'message.ack', 'message.ack.group', 'session.status'],
      customHeaders: buildWebhookCustomHeaders(options)
    });
  }

  return {
    name: options.sessionName,
    config: {
      metadata: {
        agencyId: options.agencyId,
        tenantId: options.tenantId,
        clusterId: options.clusterId,
        sessionBindingId: options.sessionBindingId,
        ...(options.accountName
          ? {
            accountName: options.accountName
          }
          : {})
      },
      webhooks
    }
  };
}
