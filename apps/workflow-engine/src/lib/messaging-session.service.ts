import { MessagingSessionBindingModel, MessagingClusterModel, TenantModel, AgencyModel } from '@noxivo/database';
import { createMessagingSessionPayload } from '@noxivo/messaging-client';
import mongoose from 'mongoose';
import { getConfiguredMessagingBaseUrl, normalizeMessagingBaseUrl, resolveMessagingClusterBaseUrlBySessionName } from './messaging-base-url.js';

export interface MessagingProfile {
  id: string;
  pushName: string | null;
  profilePicUrl: string | null;
}

export interface BootstrapResult {
  sessionName: string;
  status: 'WORKING' | 'SCAN_QR_CODE';
}

type ExistingBinding = {
  _id: mongoose.Types.ObjectId;
  clusterId: mongoose.Types.ObjectId;
  sessionName: string;
  messagingSessionName: string;
  status: 'pending' | 'active' | 'failed' | 'stopped';
  accountName?: string | null;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function normalizeNamePart(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

function createSessionName(agencyLabel: string): string {
  const normalizedAgency = normalizeNamePart(agencyLabel) || 'agency';
  return `${normalizedAgency}-whatsapp`;
}

function buildDefaultClusterName(region: string): string {
  return `default-${region}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MessagingProvider request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class MessagingSessionService {
  private messagingBaseUrl: string;
  private serverAuthToken: string;
  private webhookBaseUrl: string | undefined;
  private webhookSecret: string | undefined;

  constructor() {
    const baseUrl = getConfiguredMessagingBaseUrl();
    if (!baseUrl) {
      throw new Error('MESSAGING_PROVIDER_PROXY_BASE_URL or MESSAGING_PROVIDER_BASE_URL environment variable is required');
    }
    this.messagingBaseUrl = baseUrl;

    const apiKey = process.env.MESSAGING_PROVIDER_PROXY_AUTH_TOKEN ?? process.env.MESSAGING_PROVIDER_API_KEY;
    if (!apiKey) {
      throw new Error('MESSAGING_PROVIDER_PROXY_AUTH_TOKEN or MESSAGING_PROVIDER_API_KEY environment variable is required');
    }
    this.serverAuthToken = apiKey;

    this.webhookBaseUrl = process.env.MESSAGING_PROVIDER_WEBHOOK_BASE_URL;
    this.webhookSecret = process.env.MESSAGING_PROVIDER_WEBHOOK_SECRET;
  }

  private async resolveMessagingBaseUrlForSessionName(sessionName: string): Promise<string> {
    return (await resolveMessagingClusterBaseUrlBySessionName(sessionName)) ?? this.messagingBaseUrl;
  }

  private async provisionBinding(params: {
    binding: ExistingBinding;
    agencyId: string;
    tenantId: string;
    accountName: string | null;
    releaseClusterId?: mongoose.Types.ObjectId;
  }): Promise<void> {
    const { binding, agencyId, tenantId, accountName, releaseClusterId } = params;

    const messagingPayload = createMessagingSessionPayload({
      sessionName: binding.sessionName,
      agencyId,
      tenantId,
      clusterId: binding.clusterId.toString(),
      sessionBindingId: binding._id.toString(),
      accountName,
      ...(this.webhookBaseUrl ? { webhookBaseUrl: this.webhookBaseUrl } : {}),
      ...(this.webhookSecret ? { webhookSecret: this.webhookSecret } : {})
    });
    const sessionPayload = { start: true, ...messagingPayload };

    const cluster = await MessagingClusterModel.findById(binding.clusterId).lean();
    const baseMessagingUrl = normalizeBaseUrl(cluster?.baseUrl ? normalizeMessagingBaseUrl(cluster.baseUrl) : this.messagingBaseUrl);
    const messagingHeaders = { 'x-api-key': this.serverAuthToken, 'content-type': 'application/json' };
    const checkUrl = `${baseMessagingUrl}/api/sessions/${encodeURIComponent(binding.sessionName)}`;

    try {
      const checkResponse = await fetchWithTimeout(checkUrl, { method: 'GET', headers: { 'x-api-key': this.serverAuthToken } }, 6000).catch(() => null);
      const messagingSessionExists = checkResponse !== null && checkResponse.ok;

      let sessionResponse: Response;

      if (messagingSessionExists) {
        sessionResponse = await fetchWithTimeout(
          checkUrl,
          { method: 'PUT', headers: messagingHeaders, body: JSON.stringify(messagingPayload) },
          10000
        );

        if (sessionResponse.ok) {
          await fetchWithTimeout(
            `${baseMessagingUrl}/api/sessions/${encodeURIComponent(binding.sessionName)}/start`,
            { method: 'POST', headers: { 'x-api-key': this.serverAuthToken } },
            10000
          ).catch(() => null);
        }
      } else {
        sessionResponse = await fetchWithTimeout(
          `${baseMessagingUrl}/api/sessions`,
          { method: 'POST', headers: messagingHeaders, body: JSON.stringify(sessionPayload) },
          10000
        );
      }

      if (!sessionResponse.ok) {
        let messagingErrorDetail = '';
        try {
          const errBody = await sessionResponse.json() as { message?: string };
          messagingErrorDetail = errBody.message ? `: ${errBody.message}` : '';
        } catch {
          // Ignore JSON parse errors for non-JSON responses.
        }
        throw new Error(`MessagingProvider session bootstrap failed with ${sessionResponse.status}${messagingErrorDetail}`);
      }

      try {
        const sessionData = await sessionResponse.json() as { name?: string };
        if (sessionData.name) {
          await MessagingSessionBindingModel.updateOne(
            { _id: binding._id },
            { $set: { messagingSessionName: sessionData.name, status: 'pending' } }
          );
        } else {
          await MessagingSessionBindingModel.updateOne({ _id: binding._id }, { $set: { status: 'pending' } });
        }
      } catch {
        await MessagingSessionBindingModel.updateOne({ _id: binding._id }, { $set: { status: 'pending' } });
      }
    } catch (error) {
      await MessagingSessionBindingModel.updateOne({ _id: binding._id }, { $set: { status: 'failed' } });
      if (releaseClusterId) {
        await MessagingClusterModel.updateOne({ _id: releaseClusterId }, { $inc: { activeSessionCount: -1 } });
      }

      if (error instanceof Error) {
        throw error;
      }
      throw new Error('MessagingProvider session bootstrap failed');
    }
  }

  async getProfile(sessionName: string): Promise<MessagingProfile | null> {
    const baseUrl = normalizeBaseUrl(await this.resolveMessagingBaseUrlForSessionName(sessionName));
    const profileUrl = `${baseUrl}/api/${encodeURIComponent(sessionName)}/profile`;
    try {
      const response = await fetchWithTimeout(profileUrl, { cache: 'no-store', headers: { 'x-api-key': this.serverAuthToken } }, 6000);
      if (response.ok) {
        const data = await response.json() as { id?: string; name?: string; picture?: string; me?: { id?: string; pushName?: string; profilePicUrl?: string } };
        
        // Try flat attributes first (Standard MessagingProvider /profile response)
        if (data.id) {
          return {
            id: data.id,
            pushName: data.name ?? null,
            profilePicUrl: data.picture ?? null
          };
        }
        
        // Fallback for nested .me object if it exists
        if (data.me && data.me.id) {
          return {
            id: data.me.id,
            pushName: data.me.pushName ?? null,
            profilePicUrl: data.me.profilePicUrl ?? null
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  async getDiagnostics(sessionName: string): Promise<Record<string, unknown> | null> {
    const baseUrl = normalizeBaseUrl(await this.resolveMessagingBaseUrlForSessionName(sessionName));
    const sessionUrl = `${baseUrl}/api/sessions/${encodeURIComponent(sessionName)}`;
    try {
      const response = await fetchWithTimeout(sessionUrl, { cache: 'no-store', headers: { 'x-api-key': this.serverAuthToken } }, 6000);
      if (response.ok) {
        return await response.json() as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  async bootstrap(agencyId: string, tenantId: string, accountName?: string | null): Promise<BootstrapResult> {
    const isAgencyIdHex = /^[a-fA-F0-9]{24}$/.test(agencyId);
    const isTenantIdHex = /^[a-fA-F0-9]{24}$/.test(tenantId);

    let agencyObjectId: mongoose.Types.ObjectId;
    if (isAgencyIdHex) {
      agencyObjectId = new mongoose.Types.ObjectId(agencyId);
    } else {
      const agencyResult = await AgencyModel.findOne({ slug: agencyId }, { _id: 1 }).lean();
      if (!agencyResult) throw new Error('Agency not found by slug');
      agencyObjectId = agencyResult._id;
    }

    let tenantObjectId: mongoose.Types.ObjectId;
    if (isTenantIdHex) {
      tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    } else {
      const tenantResult = await TenantModel.findOne({ agencyId: agencyObjectId, slug: tenantId }, { _id: 1 }).lean();
      if (!tenantResult) throw new Error('Tenant not found by slug');
      tenantObjectId = tenantResult._id;
    }

    const [tenant, agency] = await Promise.all([
      TenantModel.findOne({ _id: tenantObjectId, agencyId: agencyObjectId }).select({ region: 1 }).lean(),
      AgencyModel.findById(agencyObjectId).select({ slug: 1, name: 1 }).lean()
    ]);

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const agencyLabel = agency?.slug ?? agency?.name ?? agencyId;
    const sessionName = createSessionName(agencyLabel);

    const existingBinding = await MessagingSessionBindingModel.findOne<ExistingBinding>({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId,
      status: { $in: ['active', 'pending'] }
    }).sort({ status: 1, updatedAt: -1 }).select({
      _id: 1,
      clusterId: 1,
      sessionName: 1,
      messagingSessionName: 1,
      status: 1,
      accountName: 1
    }).lean();

    if (existingBinding) {
      if (existingBinding.status === 'pending') {
        await this.provisionBinding({
          binding: existingBinding,
          agencyId,
          tenantId,
          accountName: accountName ?? existingBinding.accountName ?? null
        });
      }

      return {
        sessionName: existingBinding.sessionName,
        status: existingBinding.status === 'active' ? 'WORKING' : 'SCAN_QR_CODE'
      };
    }

    let allocatedCluster = await MessagingClusterModel.findOneAndUpdate(
      { region: tenant.region, status: 'active', $expr: { $lt: ['$activeSessionCount', '$capacity'] } },
      { $inc: { activeSessionCount: 1 } },
      { new: true, sort: { activeSessionCount: 1 }, select: { _id: 1, baseUrl: 1 } }
    ).lean();

    if (!allocatedCluster) {
      await MessagingClusterModel.findOneAndUpdate(
        { region: tenant.region, baseUrl: normalizeBaseUrl(this.messagingBaseUrl) },
        { $setOnInsert: { name: buildDefaultClusterName(tenant.region), region: tenant.region, baseUrl: normalizeBaseUrl(this.messagingBaseUrl), capacity: 100, activeSessionCount: 0, status: 'active' } },
        { upsert: true, new: true }
      );
      allocatedCluster = await MessagingClusterModel.findOneAndUpdate(
        { region: tenant.region, status: 'active', $expr: { $lt: ['$activeSessionCount', '$capacity'] } },
        { $inc: { activeSessionCount: 1 } },
        { new: true, sort: { activeSessionCount: 1 }, select: { _id: 1, baseUrl: 1 } }
      ).lean();
      if (!allocatedCluster) {
        throw new Error(`No available MessagingProvider cluster in region ${tenant.region}`);
      }
    }

    const binding = await MessagingSessionBindingModel.findOneAndUpdate(
      { agencyId: agencyObjectId, tenantId: tenantObjectId },
      { accountName: accountName ?? null, clusterId: allocatedCluster._id, sessionName, messagingSessionName: sessionName, routingMetadata: { agencyId, tenantId, clusterId: allocatedCluster._id.toString() }, status: 'pending' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select({
      _id: 1,
      clusterId: 1,
      sessionName: 1,
      messagingSessionName: 1,
      status: 1,
      accountName: 1
    }).lean<ExistingBinding>();

    if (!binding) {
      throw new Error('Failed to create session binding');
    }

    await this.provisionBinding({
      binding,
      agencyId,
      tenantId,
      accountName: accountName ?? null,
      releaseClusterId: allocatedCluster._id
    });

    return { sessionName: binding.sessionName, status: 'SCAN_QR_CODE' };
  }

  async getQr(sessionName: string): Promise<{ qr: string | null }> {
    const messagingUrl = `${normalizeBaseUrl(await this.resolveMessagingBaseUrlForSessionName(sessionName))}/api/${encodeURIComponent(sessionName)}/auth/qr?format=raw`;
    try {
      const response = await fetchWithTimeout(messagingUrl, { cache: 'no-store', headers: { 'x-api-key': this.serverAuthToken } }, 6000);
      if (!response.ok) return { qr: null };
      const data = await response.json();
      
      let qrValue: string | null = null;
      if (typeof data === 'string') {
        qrValue = data;
      } else if (data && typeof data === 'object') {
        const candidate = data.qr ?? data.value ?? data.qrValue;
        if (typeof candidate === 'string') {
          qrValue = candidate;
        } else if (candidate && typeof candidate === 'object' && 'value' in candidate && typeof candidate.value === 'string') {
          qrValue = candidate.value;
        }
      }
      
      return { qr: qrValue };
    } catch {
      return { qr: null };
    }
  }

  async getActiveBinding(agencyId: string, tenantId: string) {
    const isAgencyIdHex = /^[a-fA-F0-9]{24}$/.test(agencyId);
    const isTenantIdHex = /^[a-fA-F0-9]{24}$/.test(tenantId);

    let agencyObjectId: mongoose.Types.ObjectId | undefined;
    if (isAgencyIdHex) {
      agencyObjectId = new mongoose.Types.ObjectId(agencyId);
    } else {
      const agencyResult = await AgencyModel.findOne({ slug: agencyId }, { _id: 1 }).lean();
      if (agencyResult) agencyObjectId = agencyResult._id;
    }

    let tenantObjectId: mongoose.Types.ObjectId | undefined;
    if (isTenantIdHex && agencyObjectId) {
      tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    } else if (agencyObjectId) {
      const tenantResult = await TenantModel.findOne({ agencyId: agencyObjectId, slug: tenantId }, { _id: 1 }).lean();
      if (tenantResult) tenantObjectId = tenantResult._id;
    }

    if (!agencyObjectId || !tenantObjectId) return null;

    return await MessagingSessionBindingModel.findOne({
      agencyId: agencyObjectId,
      tenantId: tenantObjectId,
      status: { $in: ['active', 'pending'] }
    }).sort({ status: 1, updatedAt: -1 }).lean();
  }
}
