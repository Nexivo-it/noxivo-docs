export interface EngineSession {
  id: string;
  name: string;
  status: 'WORKING' | 'SCAN_QR_CODE' | 'OFFLINE' | 'CONNECTING';
  phone?: string;
  accountName?: string;
  metadata: {
    agencyId: string;
    tenantId: string;
    clusterId: string;
  };
}

export interface EngineChat {
  id: string;
  contactId: string;
  contactName: string;
  lastMessage: string | null;
  updatedAt: string | null;
}

export interface EngineMessagingChatSummary {
  id: string;
  name: string | null;
  picture: string | null;
  lastMessage: {
    id: string;
    body: string | null;
    timestamp: number;
    fromMe: boolean;
  } | null;
  unreadCount: number;
}

export interface EngineMessagingMessage {
  id: string;
  from: string;
  fromMe: boolean;
  to: string;
  body: string | null;
  timestamp: number;
  ack: number;
  ackName: 'ERROR' | 'PENDING' | 'SERVER' | 'DEVICE' | 'READ' | 'PLAYED';
  hasMedia: boolean;
  media: {
    url: string;
    mimetype: string;
    filename: string | null;
  } | null;
}

class EngineClient {
  private normalizeLimit(value: number | undefined): number | undefined {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return Math.min(100, Math.max(1, Math.trunc(value as number)));
  }

  private normalizeOffset(value: number | undefined): number | undefined {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return Math.max(0, Math.trunc(value as number));
  }

  private get rawBaseUrl() {
    return (process.env.NEXT_PUBLIC_ENGINE_API_URL || process.env.ENGINE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
  }

  private get originUrl() {
    return this.rawBaseUrl.replace(/\/api\/v1$/, '');
  }

  private get baseUrl() {
    return `${this.originUrl}/api/v1`;
  }

  private get apiKey() {
    const apiKey = process.env.ENGINE_API_KEY;
    if (!apiKey) {
      throw new Error('ENGINE_API_KEY environment variable is required');
    }
    return apiKey;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return this.fetchAbsolute<T>(url, options);
  }

  private async fetchAbsolute<T>(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('X-API-Key', this.apiKey);
    headers.set('Content-Type', 'application/json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      const rawBody = await res.text();
      const trimmedBody = rawBody.trim();
      const parseJsonBody = (): unknown | null => {
        if (trimmedBody.length === 0) {
          return null;
        }

        try {
          return JSON.parse(trimmedBody) as unknown;
        } catch {
          return null;
        }
      };

      if (!res.ok) {
        const parsedErrorBody = parseJsonBody();
        const errorMessage = typeof parsedErrorBody === 'object'
          && parsedErrorBody
          && 'error' in parsedErrorBody
          && typeof (parsedErrorBody as { error?: unknown }).error === 'string'
          ? (parsedErrorBody as { error: string }).error
          : trimmedBody || res.statusText;
        throw new Error(errorMessage || `Engine API Error: ${res.status}`);
      }

      if (trimmedBody.length === 0) {
        return {} as T;
      }

      const parsedBody = parseJsonBody();
      if (parsedBody !== null) {
        return parsedBody as T;
      }

      return {
        ok: true,
        status: res.status,
        body: trimmedBody
      } as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async getSessions(): Promise<EngineSession[]> {
    return this.fetch('/sessions');
  }

  async getChats(input: {
    tenantId: string;
    limit?: number;
    offset?: number;
  }): Promise<EngineChat[]> {
    const searchParams = new URLSearchParams({
      tenantId: input.tenantId,
      ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      ...(input.offset !== undefined ? { offset: String(input.offset) } : {})
    });

    return this.fetch(`/chats?${searchParams.toString()}`);
  }

  async getMessagingInboxChats(input: {
    agencyId: string;
    tenantId: string;
    limit?: number;
    offset?: number;
    pages?: number;
  }): Promise<{
    chats: EngineMessagingChatSummary[];
    total: number;
    hasMore: boolean;
  }> {
    const normalizedLimit = this.normalizeLimit(input.limit);
    const normalizedOffset = this.normalizeOffset(input.offset);
    const searchParams = new URLSearchParams({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      ...(normalizedLimit !== undefined ? { limit: String(normalizedLimit) } : {}),
      ...(normalizedOffset !== undefined ? { offset: String(normalizedOffset) } : {}),
      ...(input.pages !== undefined ? { pages: String(input.pages) } : {})
    });

    return this.fetchAbsolute(`${this.originUrl}/v1/inbox/chats?${searchParams.toString()}`);
  }

  async getMessagingConversationMessages(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    limit?: number;
    offset?: number;
    pages?: number;
  }): Promise<{
    messages: EngineMessagingMessage[];
    hasMore: boolean;
  }> {
    const normalizedLimit = this.normalizeLimit(input.limit);
    const normalizedOffset = this.normalizeOffset(input.offset);
    const searchParams = new URLSearchParams({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      ...(normalizedLimit !== undefined ? { limit: String(normalizedLimit) } : {}),
      ...(normalizedOffset !== undefined ? { offset: String(normalizedOffset) } : {}),
      ...(input.pages !== undefined ? { pages: String(input.pages) } : {})
    });

    return this.fetchAbsolute(
      `${this.originUrl}/v1/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages?${searchParams.toString()}`
    );
  }

  async proxyMessaging<T>(input: {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
  }): Promise<T> {
    const trimmedPath = input.path.replace(/^\/+/, '');
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      searchParams.set(key, String(value));
    }

    const url = `${this.baseUrl}/${trimmedPath}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`;
    return this.fetchAbsolute<T>(url, {
      method: input.method ?? 'GET',
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {})
    });
  }

  async getSessionByTenant(agencyId: string, tenantId: string): Promise<{ id: string; name?: string }> {
    return this.fetch(`/sessions/by-tenant?agencyId=${agencyId}&tenantId=${tenantId}`);
  }

  async getQr(sessionId: string): Promise<{ qr: string }> {
    return this.fetch(`/sessions/${sessionId}/qr`);
  }

  async getStatus(sessionId: string): Promise<{ status: string; me?: any }> {
    return this.fetch(`/sessions/${sessionId}/status`);
  }

  async getProfile(sessionId: string): Promise<any> {
    return this.fetch(`/sessions/${sessionId}/profile`);
  }

  async sendMessage(input: {
    to: string;
    text: string;
    agencyId: string;
    tenantId: string;
    sessionId?: string;
  }): Promise<{ id: string; status: string; timestamp: string }> {
    return this.fetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        to: input.to,
        text: input.text,
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        ...(input.sessionId ? { id: input.sessionId } : {})
      })
    });
  }

  async startSession(id: string) {
    return this.fetch('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  }

  async stopSession(id: string) {
    return this.fetch('/sessions/stop', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  }

  async restartSession(id: string) {
    return this.fetch('/sessions/restart', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  }

  async logoutSession(id: string) {
    return this.fetch('/sessions/logout', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  }

  async bootstrapSession(agencyId: string, tenantId: string, accountName?: string) {
    return this.fetch('/sessions/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ agencyId, tenantId, accountName })
    });
  }

  async assignConversation(input: {
    conversationId: string;
    agencyId: string;
    tenantId: string;
    assignedTo?: string | null;
  }): Promise<{ _id: string; assignedTo: string | null; status: string }> {
    return this.fetch(`/conversations/${encodeURIComponent(input.conversationId)}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        agencyId: input.agencyId,
        tenantId: input.tenantId,
        ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {})
      })
    });
  }

  async unhandoffConversation(input: {
    conversationId: string;
    agencyId: string;
    tenantId: string;
  }): Promise<{ conversationId: string; status: string }> {
    return this.fetch(`/conversations/${encodeURIComponent(input.conversationId)}/unhandoff`, {
      method: 'POST',
      body: JSON.stringify({
        agencyId: input.agencyId,
        tenantId: input.tenantId
      })
    });
  }

  async getInboxAiContext(input: {
    agencyId: string;
    tenantId: string;
    conversationId: string;
    maxMessages?: number;
  }): Promise<{
    systemPrompt: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    metadata: {
      tenantId: string;
      workflowId: string;
      conversationId: string;
    };
    memoryFacts: string[];
  }> {
    return this.fetch('/ai/inbox-context', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async getMemories(input: {
    agencyId: string;
    tenantId: string;
    contactId: string;
    category?: string;
    limit?: number;
  }): Promise<{
    memories: Array<{
      id: string;
      fact: string;
      category: string;
      source: string;
      confidence: number;
      createdAt: string;
    }>;
  }> {
    const searchParams = new URLSearchParams({
      agencyId: input.agencyId,
      tenantId: input.tenantId,
      contactId: input.contactId,
      ...(input.category ? { category: input.category } : {}),
      ...(input.limit !== undefined ? { limit: String(input.limit) } : {})
    });
    return this.fetch(`/memories?${searchParams.toString()}`);
  }

  async createMemory(input: {
    agencyId: string;
    tenantId: string;
    contactId: string;
    fact: string;
    category?: string;
    source?: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/memories', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async deleteMemory(input: {
    agencyId: string;
    tenantId: string;
    memoryId: string;
  }): Promise<{ success: boolean }> {
    return this.fetch('/memories', {
      method: 'DELETE',
      body: JSON.stringify(input)
    });
  }

  async getAiAgentState(input: {
    agencyId: string;
    tenantId: string;
  }): Promise<{
    enabled: boolean;
    mode: 'bot_active' | 'human_takeover';
  }> {
    return this.fetch('/ai-sales-agent/state', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async setAiAgentState(input: {
    agencyId: string;
    tenantId: string;
    enabled?: boolean;
    mode?: 'bot_active' | 'human_takeover';
  }): Promise<{ success: boolean }> {
    return this.fetch('/ai-sales-agent/state', {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  async getAiAgentPersona(input: {
    agencyId: string;
    tenantId: string;
  }): Promise<{
    agentName: string;
    modelChoice: string;
    systemPrompt: string;
    fallbackMessage: string;
    temperature: number;
    maxTokens: number;
    active: boolean;
  } | null> {
    return this.fetch('/ai-sales-agent/persona', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  async setAiAgentPersona(input: {
    agencyId: string;
    tenantId: string;
    agentName: string;
    modelChoice: string;
    systemPrompt: string;
    fallbackMessage: string;
    temperature?: number;
    maxTokens?: number;
    active?: boolean;
  }): Promise<{ success: boolean }> {
    return this.fetch('/ai-sales-agent/persona', {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  async getDeveloperApiKey(agencyId: string, tenantId: string): Promise<any> {
    return this.fetch(`/api-keys/me?agencyId=${agencyId}&tenantId=${tenantId}`);
  }

  async generateDeveloperApiKey(agencyId: string, tenantId: string): Promise<any> {
    return this.fetch('/api-keys/me', {
      method: 'POST',
      body: JSON.stringify({ agencyId, tenantId })
    });
  }

  async revokeDeveloperApiKey(agencyId: string, tenantId: string): Promise<any> {
    return this.fetch('/api-keys/me', {
      method: 'DELETE',
      body: JSON.stringify({ agencyId, tenantId })
    });
  }
}

export const engineClient = new EngineClient();
