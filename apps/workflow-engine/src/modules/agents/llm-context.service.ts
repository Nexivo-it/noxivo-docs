const ConversationRepoInterface = {
  findRecentMessages: {} as unknown as (conversationId: string, limit: number) => Promise<unknown[]>
};

const TenantRepoInterface = {
  findById: {} as unknown as (id: string) => Promise<unknown | null>
};

const WorkflowDefinitionRepoInterface = {
  findById: {} as unknown as (id: string) => Promise<unknown | null>
};

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface LlmContextInput {
  conversationId: string;
  tenantId: string;
  workflowId: string;
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
  private readonly conversationRepo: typeof ConversationRepoInterface;
  private readonly tenantRepo: typeof TenantRepoInterface;
  private readonly workflowDefinitionRepo: typeof WorkflowDefinitionRepoInterface;

  constructor(input: {
    conversationRepo: typeof ConversationRepoInterface;
    tenantRepo: typeof TenantRepoInterface;
    workflowDefinitionRepo: typeof WorkflowDefinitionRepoInterface;
  }) {
    this.conversationRepo = input.conversationRepo;
    this.tenantRepo = input.tenantRepo;
    this.workflowDefinitionRepo = input.workflowDefinitionRepo;
  }

  async buildLlmContext(input: LlmContextInput): Promise<LlmContextResult> {
    const maxMessages = input.maxMessages ?? 10;

    const messages = await this.conversationRepo.findRecentMessages(
      input.conversationId,
      maxMessages
    );

    const typedMessages = messages as Array<{
      id: string;
      direction: string;
      content: string;
      timestamp: Date;
    }>;

    const roleMappedMessages: LlmMessage[] = typedMessages.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.timestamp
    }));

    const tenant = await this.tenantRepo.findById(input.tenantId);
    const typedTenant = tenant as {
      id: string;
      businessName?: string;
      businessDescription?: string;
    } | null;

    const workflow = await this.workflowDefinitionRepo.findById(input.workflowId);
    const typedWorkflow = workflow as {
      id: string;
      name?: string;
      state?: Record<string, unknown>;
    } | null;

    const systemPrompt = this.buildSystemPrompt(typedTenant, typedWorkflow);

    return {
      systemPrompt,
      messages: roleMappedMessages,
      metadata: {
        tenantId: input.tenantId,
        workflowId: input.workflowId,
        conversationId: input.conversationId
      }
    };
  }

  private buildSystemPrompt(
    tenant: { id: string; businessName?: string; businessDescription?: string } | null,
    workflow: { id: string; name?: string; state?: Record<string, unknown> } | null
  ): string {
    const parts: string[] = [];

    if (tenant?.businessName) {
      parts.push(`You are representing ${tenant.businessName}.`);
    }

    if (tenant?.businessDescription) {
      parts.push(`Business context: ${tenant.businessDescription}.`);
    }

    if (workflow?.name) {
      parts.push(`You are operating as part of the "${workflow.name}" workflow.`);
    }

    if (workflow?.state?.currentStage) {
      parts.push(`Current workflow stage: ${workflow.state.currentStage}.`);
    }

    if (parts.length === 0) {
      return 'You are a helpful assistant.';
    }

    return parts.join(' ');
  }
}