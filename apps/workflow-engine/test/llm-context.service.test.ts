import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmContextService } from '../src/modules/agents/llm-context.service.js';

const mockConversationRepo = {
  findRecentMessages: vi.fn()
};

const mockTenantRepo = {
  findById: vi.fn()
};

const mockWorkflowDefinitionRepo = {
  findById: vi.fn()
};

describe('LlmContextService', () => {
  let service: LlmContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LlmContextService({
      conversationRepo: mockConversationRepo as any,
      tenantRepo: mockTenantRepo as any,
      workflowDefinitionRepo: mockWorkflowDefinitionRepo as any
    });
  });

  it('converts recent messages into a strict prompt array', async () => {
    const mockMessages = [
      { id: 'msg-1', direction: 'inbound', content: 'Hello', timestamp: new Date('2026-01-01T10:00:00Z') },
      { id: 'msg-2', direction: 'outbound', content: 'Hi there!', timestamp: new Date('2026-01-01T10:01:00Z') },
      { id: 'msg-3', direction: 'inbound', content: 'What services do you offer?', timestamp: new Date('2026-01-01T10:02:00Z') }
    ];
    mockConversationRepo.findRecentMessages.mockResolvedValue(mockMessages);
    mockTenantRepo.findById.mockResolvedValue({ id: 'tenant-1', businessName: 'Acme Corp' });
    mockWorkflowDefinitionRepo.findById.mockResolvedValue({ id: 'wf-1', name: 'Sales Bot' });

    const result = await service.buildLlmContext({
      conversationId: 'conv-123',
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      maxMessages: 10
    });

    expect(result.messages).toHaveLength(3);
    const firstMsg = result.messages[0];
    const secondMsg = result.messages[1];
    const thirdMsg = result.messages[2];
    expect(firstMsg?.role).toBe('user');
    expect(secondMsg?.role).toBe('assistant');
    expect(thirdMsg?.role).toBe('user');
    expect(firstMsg?.content).toBe('Hello');
  });

  it('embeds tenant business context and workflow state in the system prompt', async () => {
    const mockMessages: never[] = [];
    mockConversationRepo.findRecentMessages.mockResolvedValue(mockMessages);
    mockTenantRepo.findById.mockResolvedValue({
      id: 'tenant-1',
      businessName: 'Acme Corp',
      businessDescription: 'Premium consulting services'
    });
    mockWorkflowDefinitionRepo.findById.mockResolvedValue({
      id: 'wf-1',
      name: 'Sales Bot',
      state: { currentStage: 'qualification' }
    });

    const result = await service.buildLlmContext({
      conversationId: 'conv-123',
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      maxMessages: 10
    });

    expect(result.systemPrompt).toContain('Acme Corp');
    expect(result.systemPrompt).toContain('Premium consulting services');
    expect(result.systemPrompt).toContain('Sales Bot');
    expect(result.systemPrompt).toContain('qualification');
  });

  it('maps inbound messages to user role and outbound to assistant role', async () => {
    const mockMessages = [
      { id: 'msg-1', direction: 'inbound', content: 'Hi', timestamp: new Date() },
      { id: 'msg-2', direction: 'outbound', content: 'Hello! How can I help?', timestamp: new Date() },
      { id: 'msg-3', direction: 'inbound', content: 'I need help', timestamp: new Date() },
      { id: 'msg-4', direction: 'outbound', content: 'Of course', timestamp: new Date() }
    ];
    mockConversationRepo.findRecentMessages.mockResolvedValue(mockMessages);
    mockTenantRepo.findById.mockResolvedValue({ id: 'tenant-1' });
    mockWorkflowDefinitionRepo.findById.mockResolvedValue({ id: 'wf-1' });

    const result = await service.buildLlmContext({
      conversationId: 'conv-123',
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      maxMessages: 10
    });

    const msg0 = result.messages[0];
    const msg1 = result.messages[1];
    const msg2 = result.messages[2];
    const msg3 = result.messages[3];
    expect(msg0?.role).toBe('user');
    expect(msg1?.role).toBe('assistant');
    expect(msg2?.role).toBe('user');
    expect(msg3?.role).toBe('assistant');
  });
});