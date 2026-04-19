import { MessagingClusterModel, MessagingSessionBindingModel } from '@noxivo/database';

export function normalizeMessagingBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function getConfiguredMessagingBaseUrl(): string | null {
  const candidate = process.env.MESSAGING_PROVIDER_PROXY_BASE_URL ?? process.env.MESSAGING_PROVIDER_BASE_URL;
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? normalizeMessagingBaseUrl(trimmed) : null;
}

export async function resolveMessagingClusterBaseUrlBySessionName(sessionName: string): Promise<string | null> {
  const trimmedSessionName = sessionName.trim();
  if (trimmedSessionName.length === 0) {
    return null;
  }

  const binding = await MessagingSessionBindingModel.findOne({
    $or: [
      { messagingSessionName: trimmedSessionName },
      { sessionName: trimmedSessionName }
    ]
  }).lean();

  if (!binding) {
    return null;
  }

  const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();
  if (!cluster?.baseUrl) {
    return null;
  }

  return normalizeMessagingBaseUrl(cluster.baseUrl);
}

export async function resolveMessagingClusterBaseUrlByAgencyTenant(input: {
  agencyId: string;
  tenantId: string;
}): Promise<string | null> {
  const binding = await MessagingSessionBindingModel.findOne({
    agencyId: input.agencyId,
    tenantId: input.tenantId,
    status: { $in: ['active', 'pending'] }
  }).sort({ status: 1, updatedAt: -1 }).lean();

  if (!binding) {
    return null;
  }

  const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();
  if (!cluster?.baseUrl) {
    return null;
  }

  return normalizeMessagingBaseUrl(cluster.baseUrl);
}
