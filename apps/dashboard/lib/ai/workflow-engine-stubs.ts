export interface EntitlementInput {
  agencyId: string;
  feature: string;
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

export class EntitlementService {
  constructor(_options: { agencyRepo: { findById: (...args: unknown[]) => Promise<unknown> } }) {}

  async checkEntitlement(input: EntitlementInput): Promise<EntitlementResult> {
    if (input.feature === 'ai_action') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Unknown feature' };
  }
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmContextInput {
  conversationId: string;
  tenantId: string;
  workflowId?: string;
  maxMessages?: number;
}

export interface LlmContextResult {
  systemPrompt: string;
  messages: LlmMessage[];
  metadata: {
    tenantId: string;
    workflowId: string;
    conversationId: string;
  };
}

export class LlmContextService {
  constructor(_options: {
    conversationRepo: { findRecentMessages: (conversationId: string, limit: number) => Promise<unknown[]> };
    tenantRepo: { findById: (tenantId: string) => Promise<unknown> };
    workflowDefinitionRepo: { findById: (workflowId: string) => Promise<unknown> };
  }) {}

  async buildLlmContext(input: LlmContextInput): Promise<LlmContextResult> {
    return {
      systemPrompt: 'You are a helpful assistant.',
      messages: [],
      metadata: {
        tenantId: input.tenantId,
        workflowId: input.workflowId ?? 'default',
        conversationId: input.conversationId
      }
    };
  }
}