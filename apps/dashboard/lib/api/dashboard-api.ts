import type { CatalogItem } from '@/lib/catalog/types';
import { buildWorkflowEngineUrl, workflowEngineFetch } from './workflow-engine-client';

export interface Agency {
  id: string;
  name: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'draft';
  triggerCount: number;
}

export interface InboxMessage {
  id: string;
  from: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface Credential {
  id: string;
  type: string;
  name: string;
  valid: boolean;
}

export interface CreateAgencyInput {
  name: string;
  slug: string;
  plan: 'reseller_basic' | 'reseller_pro' | 'enterprise';
  ownerEmail?: string;
  ownerFullName?: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
}

export interface UpdateWorkflowInput {
  name: string;
  description?: string;
}

export interface WorkflowDefinitionSaveInput {
  editorGraph: {
    nodes: unknown[];
    edges: unknown[];
    viewport?: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  compiledDag: unknown;
}

export interface CreateCatalogItemInput {
  payload: {
    name: string;
    itemType: CatalogItem['itemType'];
    status?: CatalogItem['status'];
    priceAmount?: number;
    durationMinutes?: number;
    shortDescription?: string;
    categoryId?: string;
    customFields?: string;
    [key: string]: unknown;
  };
}

export interface CatalogAiHelpContext {
  itemType: CatalogItem['itemType'];
  name?: string;
  currentDescription?: string;
  title?: string;
  description?: string;
}

export interface CatalogAiHelpInput {
  mode: 'seo-only' | 'all';
  context: CatalogAiHelpContext;
}

export interface CatalogAiSuggestions {
  name?: string;
  shortDescription?: string;
  longDescription?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
}

export interface CatalogSettings {
  currency: string;
  timezone: string;
  businessName: string;
  accentColor: string;
  logoUrl: string;
  defaultDuration: number;
}

export interface StoragePublicConfig {
  publicKey?: string;
  urlEndpoint?: string;
  storageZoneName?: string;
  bucket?: string;
  accountId?: string;
  region?: string;
  cloudName?: string;
  apiKey?: string;
  path?: string;
}

export interface StorageSecretConfig {
  privateKey?: string;
  accessKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  apiSecret?: string;
}

export interface StorageInfo {
  provider: string;
  isActive: boolean;
  publicBaseUrl: string;
  publicConfig: StoragePublicConfig;
  secretConfig: StorageSecretConfig;
  pathPrefix: string;
}

export interface CatalogSettingsResponse {
  settings: CatalogSettings;
  storage: StorageInfo;
  storeUrl?: string;
}

export interface SaveCatalogSettingsInput {
  currency?: string;
  timezone?: string;
  businessName?: string;
  accentColor?: string;
  logoUrl?: string;
  defaultDuration?: number;
  storage?: StorageInfo;
}

export type SettingsCredentialUpsertInput = {
  provider: 'airtable' | 'google_sheets' | 'shopify' | 'woocommerce';
  displayName: string;
  secret: Record<string, string>;
  config: Record<string, unknown>;
};

export type SettingsShopUpdateInput = {
  provider: 'shopify' | 'woocommerce';
  enabled: boolean;
};

export type SettingsQrUpdateInput = {
  action: 'login' | 'regenerate';
};

export type WebhookInboxSourceCreateInput = {
  name: string;
  outboundUrl: string;
  outboundHeaders: Record<string, string>;
  inboundSecret: string;
};

export type WebhookInboxSourceUpdateInput = {
  name?: string;
  outboundUrl?: string;
  outboundHeaders?: Record<string, string>;
  inboundSecret?: string;
  status?: 'active' | 'disabled';
};

export type TeamInboxCrmMutationInput = {
  action: 'update_profile' | 'add_note' | 'link_record' | 'unlink_record';
  [key: string]: unknown;
};

export type TeamInboxConversationsQuery = {
  query?: string;
  source?: string;
  status?: string;
};

export type TeamInboxMessagesQuery = {
  paginated: 1;
  limit: number;
  cursor?: string;
  syncPages?: number;
};

export type TeamInboxSendMessageInput = {
  content: string;
  to: string;
};

export type TeamInboxActionInput = {
  action: string;
  payload?: Record<string, unknown>;
};

export type TeamInboxLeadsQuery = {
  query?: string;
};

export type CreateMemoryInput = {
  contactId: string;
  fact: string;
  category: string;
  source: string;
};

export interface AgencyDetail {
  id: string;
  name: string;
  slug: string;
  plan: 'reseller_basic' | 'reseller_pro' | 'enterprise';
  status: string;
  createdAt: string;
}

export interface AgencyTenant {
  id: string;
  agencyId: string;
  slug: string;
  name: string;
  region: string;
  status: string;
  billingMode: string;
  customDomain: string | null;
  createdAt: string;
}

export type AgencyInvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface AgencyInvitation {
  id: string;
  email: string;
  fullName: string | null;
  role: AgencyTeamRole;
  status: AgencyInvitationStatus;
  invitedAt: string;
  expiresAt: string;
  tenantIds: string[];
}

export type AgencyTeamRole = 'agency_owner' | 'agency_admin' | 'agency_member' | 'viewer';

export interface CreateTenantInput {
  name: string;
  slug: string;
  region: string;
  billingMode: string;
}

export interface CreateInvitationInput {
  email: string;
  fullName?: string;
  role: AgencyTeamRole;
  tenantIds?: string[];
}

export type DashboardNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
  createdAt: string;
  workflowName?: string | null;
  nodeId?: string | null;
};

export type DashboardNotificationsResponse = {
  notifications: DashboardNotification[];
  unreadCount: number;
};

export type AgencyWebhookPayload = {
  name: string;
  url: string;
  events: string[];
  secret?: string;
  isActive?: boolean;
};

export type AdminMessagingSession = {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  me: { id: string; pushName: string } | null;
  engine: { engine: string };
};

type AdminMessagingSessionTreeNode = {
  clients?: Array<{
    sessions?: Array<{
      id: string;
      name: string;
      status: string;
      phone?: string | null;
      accountName?: string;
      platform?: string;
      server?: string;
    }>;
  }>;
};

function flattenAdminMessagingSessions(payload: unknown): AdminMessagingSession[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const nodes = payload as AdminMessagingSessionTreeNode[];
  const sessions: AdminMessagingSession[] = [];

  for (const agencyNode of nodes) {
    for (const clientNode of agencyNode.clients ?? []) {
      for (const session of clientNode.sessions ?? []) {
        sessions.push({
          id: session.id,
          name: session.name,
          status: session.status,
          config: {
            proxy: session.platform ?? 'WEBJS',
            server: session.server ?? 'MessagingProvider',
          },
          me: session.phone
            ? {
                id: `${session.phone}@c.us`,
                pushName: session.accountName ?? session.name,
              }
            : null,
          engine: {
            engine: session.platform ?? 'WEBJS',
          },
        });
      }
    }
  }

  return sessions;
}

function buildTeamInboxSearchParams(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

export const dashboardApi = {
  async getAgencies(): Promise<{ agencies: Agency[] }> {
    return workflowEngineFetch<{ agencies: Agency[] }>('/api/v1/agencies');
  },

  async getAgency(agencyId: string): Promise<AgencyDetail> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    return workflowEngineFetch<AgencyDetail>(`/api/v1/agencies/${encodedAgencyId}`);
  },

  async getAgencyTenant(agencyId: string, tenantId: string): Promise<AgencyTenant> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    const encodedTenantId = encodeURIComponent(tenantId);
    return workflowEngineFetch<AgencyTenant>(`/api/v1/agencies/${encodedAgencyId}/tenants/${encodedTenantId}`);
  },

  async createAgencyTenant(agencyId: string, payload: CreateTenantInput): Promise<AgencyTenant> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    return workflowEngineFetch<AgencyTenant>(`/api/v1/agencies/${encodedAgencyId}/tenants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAgencyInvitations(agencyId: string): Promise<AgencyInvitation[]> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    return workflowEngineFetch<AgencyInvitation[]>(`/api/v1/agencies/${encodedAgencyId}/invitations`);
  },

  async createAgencyInvitation(agencyId: string, payload: CreateInvitationInput): Promise<AgencyInvitation> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    return workflowEngineFetch<AgencyInvitation>(`/api/v1/agencies/${encodedAgencyId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async revokeAgencyInvitation(agencyId: string, invitationId: string): Promise<{ success: boolean }> {
    const encodedAgencyId = encodeURIComponent(agencyId);
    const encodedInvitationId = encodeURIComponent(invitationId);
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/agencies/${encodedAgencyId}/invitations/${encodedInvitationId}`, {
      method: 'DELETE',
    });
  },

  async getWorkflows(): Promise<{ workflows: Workflow[] }> {
    return workflowEngineFetch<{ workflows: Workflow[] }>('/api/v1/workflows');
  },

  async getWorkflowDetail<TWorkflow = unknown>(workflowId: string): Promise<TWorkflow> {
    const encodedWorkflowId = encodeURIComponent(workflowId);
    return workflowEngineFetch<TWorkflow>(`/api/v1/workflows/${encodedWorkflowId}`);
  },

  async getWorkflowRuns<TRuns = unknown>(workflowId: string): Promise<TRuns> {
    const encodedWorkflowId = encodeURIComponent(workflowId);
    return workflowEngineFetch<TRuns>(`/api/v1/workflows/${encodedWorkflowId}/runs`);
  },

  async saveWorkflowDefinition<TResponse = { success: boolean }>(
    workflowId: string,
    payload: WorkflowDefinitionSaveInput
  ): Promise<TResponse> {
    const encodedWorkflowId = encodeURIComponent(workflowId);
    return workflowEngineFetch<TResponse>(`/api/v1/workflows/${encodedWorkflowId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async getCatalog(): Promise<{ items: CatalogItem[] }> {
    return workflowEngineFetch<{ items: CatalogItem[] }>('/api/v1/catalog');
  },

  async getTeamInbox(): Promise<{ messages: InboxMessage[] }> {
    return workflowEngineFetch<{ messages: InboxMessage[] }>('/api/v1/team-inbox');
  },

  async listTeamInboxConversations<TConversation>(query: TeamInboxConversationsQuery = {}): Promise<TConversation[]> {
    const serializedQuery = buildTeamInboxSearchParams({
      query: query.query,
      source: query.source,
      status: query.status
    });
    return workflowEngineFetch<TConversation[]>(`/api/v1/team-inbox${serializedQuery}`);
  },

  async getTeamInboxConversationMessages<TResponse>(
    conversationId: string,
    query: TeamInboxMessagesQuery
  ): Promise<TResponse> {
    const encodedConversationId = encodeURIComponent(conversationId);
    const serializedQuery = buildTeamInboxSearchParams({
      paginated: query.paginated,
      limit: query.limit,
      cursor: query.cursor,
      syncPages: query.syncPages
    });
    return workflowEngineFetch<TResponse>(`/api/v1/team-inbox/${encodedConversationId}/messages${serializedQuery}`);
  },

  async markTeamInboxConversationRead(conversationId: string): Promise<{ success?: boolean }> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<{ success?: boolean }>(`/api/v1/team-inbox/${encodedConversationId}/read`, {
      method: 'POST'
    });
  },

  async sendTeamInboxConversationMessage<TMessage>(
    conversationId: string,
    payload: TeamInboxSendMessageInput
  ): Promise<TMessage> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TMessage>(`/api/v1/team-inbox/${encodedConversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async assignTeamInboxConversation<TResponse>(
    conversationId: string,
    payload: Record<string, unknown> = {}
  ): Promise<TResponse> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TResponse>(`/api/v1/team-inbox/${encodedConversationId}/assign`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async unhandoffTeamInboxConversation<TResponse>(conversationId: string): Promise<TResponse> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TResponse>(`/api/v1/team-inbox/${encodedConversationId}/unhandoff`, {
      method: 'POST'
    });
  },

  async runTeamInboxConversationAction<TResponse>(
    conversationId: string,
    payload: TeamInboxActionInput
  ): Promise<TResponse> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TResponse>(`/api/v1/team-inbox/${encodedConversationId}/actions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async runTeamInboxMessageAction<TResponse>(
    conversationId: string,
    messageId: string,
    payload: TeamInboxActionInput
  ): Promise<TResponse> {
    const encodedConversationId = encodeURIComponent(conversationId);
    const encodedMessageId = encodeURIComponent(messageId);
    return workflowEngineFetch<TResponse>(
      `/api/v1/team-inbox/${encodedConversationId}/messages/${encodedMessageId}/actions`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  },

  async saveTeamInboxLead(conversationId: string): Promise<{ success?: boolean; error?: string }> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<{ success?: boolean; error?: string }>(`/api/v1/team-inbox/${encodedConversationId}/lead`, {
      method: 'POST'
    });
  },

  async deleteTeamInboxLead(conversationId: string): Promise<{ success?: boolean; error?: string }> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<{ success?: boolean; error?: string }>(`/api/v1/team-inbox/${encodedConversationId}/lead`, {
      method: 'DELETE'
    });
  },

  async listTeamInboxLeads<TLead>(query: TeamInboxLeadsQuery = {}): Promise<TLead[]> {
    const serializedQuery = buildTeamInboxSearchParams({ query: query.query });
    return workflowEngineFetch<TLead[]>(`/api/v1/team-inbox/leads${serializedQuery}`);
  },

  async getTeamInboxCrmProfile<TProfile>(conversationId: string): Promise<TProfile> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TProfile>(`/api/v1/team-inbox/${encodedConversationId}/crm`);
  },

  async patchTeamInboxCrmProfile<TProfile>(conversationId: string, mutation: TeamInboxCrmMutationInput): Promise<TProfile> {
    const encodedConversationId = encodeURIComponent(conversationId);
    return workflowEngineFetch<TProfile>(`/api/v1/team-inbox/${encodedConversationId}/crm`, {
      method: 'PATCH',
      body: JSON.stringify(mutation),
    });
  },

  async getMemories<TMemory>(contactId: string): Promise<{ memories: TMemory[] }> {
    const encodedContactId = encodeURIComponent(contactId);
    return workflowEngineFetch<{ memories: TMemory[] }>(`/api/v1/memories?contactId=${encodedContactId}`);
  },

  async createMemory(payload: CreateMemoryInput): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>('/api/v1/memories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteMemory(memoryId: string): Promise<{ success: boolean }> {
    const encodedMemoryId = encodeURIComponent(memoryId);
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/memories?memoryId=${encodedMemoryId}`, {
      method: 'DELETE',
    });
  },

  async getSettingsCredentials(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/credentials');
  },

  async getNotifications(): Promise<DashboardNotificationsResponse> {
    return workflowEngineFetch<DashboardNotificationsResponse>('/api/v1/settings/notifications');
  },

  async markNotificationAsRead(notificationId: string): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>('/api/v1/settings/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'markAsRead', notificationId }),
    });
  },

  async markAllNotificationsAsRead(): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>('/api/v1/settings/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'markAllAsRead' }),
    });
  },

  async getImagekitAuth(): Promise<{ signature: string; token: string; expire: number; publicKey: string }> {
    return workflowEngineFetch<{ signature: string; token: string; expire: number; publicKey: string }>('/api/v1/settings/imagekit-auth');
  },

  async listAgencyWebhooks<TWebhook = unknown>(): Promise<TWebhook[]> {
    return workflowEngineFetch<TWebhook[]>('/api/v1/agency/webhooks');
  },

  async createAgencyWebhook<TWebhook = unknown>(payload: AgencyWebhookPayload): Promise<TWebhook> {
    return workflowEngineFetch<TWebhook>('/api/v1/agency/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateAgencyWebhook<TWebhook = unknown>(webhookId: string, payload: AgencyWebhookPayload): Promise<TWebhook> {
    return workflowEngineFetch<TWebhook>(`/api/v1/agency/webhooks/${webhookId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteAgencyWebhook(webhookId: string): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/agency/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  },

  async listAdminMessagingSessions(): Promise<AdminMessagingSession[]> {
    const payload = await workflowEngineFetch<unknown>('/api/v1/admin/sessions');
    return flattenAdminMessagingSessions(payload);
  },

  async controlAdminMessagingSession(sessionId: string, action: 'start' | 'stop' | 'restart' | 'logout'): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/admin/sessions/${sessionId}/${action}`, {
      method: 'POST',
    });
  },

  async deleteAdminMessagingSession(sessionId: string): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/admin/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },

  async getAdminMessagingQr(sessionId: string): Promise<{ code: string; message?: string }> {
    return workflowEngineFetch<{ code: string; message?: string }>(`/api/v1/admin/sessions/${sessionId}/qr`);
  },

  async getAdminMessagingStatus<TStatus = unknown>(sessionId: string): Promise<TStatus> {
    return workflowEngineFetch<TStatus>(`/api/v1/admin/sessions/${sessionId}/status`);
  },

  async upsertSettingsCredential(payload: SettingsCredentialUpsertInput): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/credentials', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getSettingsShop(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/shop');
  },

  async updateSettingsShop(payload: SettingsShopUpdateInput): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/shop', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getSettingsQr(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/qr');
  },

  async updateSettingsQr(payload: SettingsQrUpdateInput): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/qr', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteSettingsQr(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/qr', {
      method: 'DELETE',
    });
  },

  async getSettingsDeveloperApi(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/developer-api');
  },

  async updateSettingsDeveloperApi(method: 'POST' | 'DELETE'): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/developer-api', {
      method,
    });
  },

  async getWebhookInboxActivation(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/webhook-inbox-activation');
  },

  async postWebhookInboxActivation(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/webhook-inbox-activation', {
      method: 'POST',
    });
  },

  async deleteWebhookInboxActivation(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/webhook-inbox-activation', {
      method: 'DELETE',
    });
  },

  async getWebhookInboxSources(): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/webhook-inbox-sources');
  },

  async createWebhookInboxSource(payload: WebhookInboxSourceCreateInput): Promise<unknown> {
    return workflowEngineFetch<unknown>('/api/v1/settings/webhook-inbox-sources', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateWebhookInboxSource(sourceId: string, payload: WebhookInboxSourceUpdateInput): Promise<unknown> {
    return workflowEngineFetch<unknown>(`/api/v1/settings/webhook-inbox-sources/${sourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async createAgency(payload: CreateAgencyInput): Promise<{ id: string }> {
    return workflowEngineFetch<{ id: string }>('/api/v1/agencies', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createWorkflow(payload: CreateWorkflowInput): Promise<{ id: string; name: string }> {
    return workflowEngineFetch<{ id: string; name: string }>('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateWorkflow(workflowId: string, payload: UpdateWorkflowInput): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/workflows/${workflowId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteWorkflow(workflowId: string): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/workflows/${workflowId}`, {
      method: 'DELETE',
    });
  },

  async toggleWorkflow(workflowId: string): Promise<{ success: boolean; isActive: boolean }> {
    return workflowEngineFetch<{ success: boolean; isActive: boolean }>(`/api/v1/workflows/${workflowId}/toggle`, {
      method: 'POST',
    });
  },

  async cloneWorkflow(templateId: string): Promise<{ success: boolean; workflowId: string; error?: string }> {
    return workflowEngineFetch<{ success: boolean; workflowId: string; error?: string }>('/api/v1/workflows/clone', {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
  },

  async createCatalogItem(payload: CreateCatalogItemInput): Promise<{ item: CatalogItem }> {
    return workflowEngineFetch<{ item: CatalogItem }>('/api/v1/catalog', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCatalogItem(itemId: string, payload: Partial<CatalogItem>): Promise<CatalogItem> {
    return workflowEngineFetch<CatalogItem>(`/api/v1/catalog/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteCatalogItem(itemId: string): Promise<{ success: boolean }> {
    return workflowEngineFetch<{ success: boolean }>(`/api/v1/catalog/${itemId}`, {
      method: 'DELETE',
    });
  },

  async getCatalogAiHelp(payload: CatalogAiHelpInput): Promise<{ suggestions: CatalogAiSuggestions }> {
    return workflowEngineFetch<{ suggestions: CatalogAiSuggestions }>('/api/v1/catalog/ai-help', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getCatalogSettings(): Promise<CatalogSettingsResponse> {
    return workflowEngineFetch<CatalogSettingsResponse>('/api/v1/catalog/settings');
  },

  async saveCatalogSettings(payload: SaveCatalogSettingsInput): Promise<CatalogSettingsResponse> {
    return workflowEngineFetch<CatalogSettingsResponse>('/api/v1/catalog/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadCatalogAsset(formData: FormData): Promise<{
    url: string;
    filename?: string;
    type?: string;
    isImage?: boolean;
    isPdf?: boolean;
    needsReview?: boolean;
    aiAnalysis?: Array<{
      name?: string;
      price?: number;
      duration?: number;
      description?: string;
      category?: string;
    }>;
    serviceCount?: number;
  }> {
    const response = await fetch(buildWorkflowEngineUrl('/api/v1/catalog/upload'), {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const rawBody = await response.text();
    const trimmedBody = rawBody.trim();

    const parseJsonBody = (): unknown | null => {
      if (trimmedBody.length === 0) {
        return null;
      }
      try {
        return JSON.parse(trimmedBody);
      } catch {
        return null;
      }
    };

    if (!response.ok) {
      const parsedErrorBody = parseJsonBody();
      const errorMessage =
        typeof parsedErrorBody === 'object' &&
        parsedErrorBody !== null &&
        'error' in parsedErrorBody &&
        typeof (parsedErrorBody as { error?: unknown }).error === 'string'
          ? (parsedErrorBody as { error: string }).error
          : trimmedBody || response.statusText;
      throw new Error(errorMessage || `Workflow Engine Error: ${response.status}`);
    }

    if (trimmedBody.length === 0) {
      throw new Error('Empty response body');
    }

    const parsedBody = parseJsonBody();
    if (typeof parsedBody === 'object' && parsedBody !== null) {
      return parsedBody as {
        url: string;
        filename?: string;
        type?: string;
        isImage?: boolean;
        isPdf?: boolean;
        needsReview?: boolean;
        aiAnalysis?: Array<{
          name?: string;
          price?: number;
          duration?: number;
          description?: string;
          category?: string;
        }>;
        serviceCount?: number;
      };
    }

    throw new Error(`Failed to parse response as JSON: ${trimmedBody}`);
  },
};
