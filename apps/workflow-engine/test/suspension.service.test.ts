import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuspensionService } from '../src/modules/agents/suspension.service.js';

const mockWorkflowRunRepo = {
  findById: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn()
};

const mockWorkflowDefinitionRepo = {
  findById: vi.fn()
};

describe('SuspensionService', () => {
  let service: SuspensionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SuspensionService({
      workflowRunRepo: mockWorkflowRunRepo as any,
      workflowDefinitionRepo: mockWorkflowDefinitionRepo as any
    });
  });

  it('suspends a run and generates a task token', async () => {
    const mockRun = {
      id: 'run-123',
      status: 'running',
      tenantId: 'tenant-1',
      workflowId: 'workflow-1',
      conversationId: 'conv-1',
      currentNodeId: 'node-delay-1'
    };
    mockWorkflowRunRepo.findById.mockResolvedValue(mockRun);
    mockWorkflowRunRepo.findOneAndUpdate.mockResolvedValue({
      ...mockRun,
      status: 'suspended',
      suspension: {
        taskToken: expect.any(String),
        expectedEvent: 'timer.fire',
        suspendedAt: expect.any(Date)
      }
    });

    const result = await service.suspend('run-123', 'timer.fire');

    expect(result.taskToken).toEqual(expect.any(String));
    expect(result.status).toBe('suspended');
    expect(mockWorkflowRunRepo.findOneAndUpdate).toHaveBeenCalled();
  });

  it('marks the run with the expected event', async () => {
    const mockRun = {
      id: 'run-456',
      status: 'running',
      tenantId: 'tenant-1'
    };
    mockWorkflowRunRepo.findById.mockResolvedValue(mockRun);
    mockWorkflowRunRepo.findOneAndUpdate.mockResolvedValue({
      ...mockRun,
      status: 'suspended',
      suspension: {
        expectedEvent: 'webhook.received',
        taskToken: expect.any(String)
      }
    });

    const result = await service.suspend('run-456', 'webhook.received');

    expect(result.suspension?.expectedEvent).toBe('webhook.received');
  });

  it('resumes validates the token before waking the run', async () => {
    const mockRun = {
      id: 'run-789',
      status: 'suspended',
      suspension: {
        taskToken: 'valid-token-123',
        expectedEvent: 'timer.fire'
      }
    };
    mockWorkflowRunRepo.findOneAndUpdate.mockResolvedValue({
      ...mockRun,
      status: 'running',
      suspension: null
    });

    const result = await service.resume('valid-token-123', 'timer.fire', {});

    expect(result).not.toBeNull();
    expect(result!.status).toBe('running');
    expect(result!.suspension).toBeNull();
  });

  it('rejects resume when token is invalid', async () => {
    mockWorkflowRunRepo.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.resume('wrong-token', 'timer.fire', {});

    expect(result).toBeNull();
  });

  it('rejects resume when event type does not match expected', async () => {
    const mockRun = {
      id: 'run-abc',
      status: 'suspended',
      suspension: {
        taskToken: 'token-xyz',
        expectedEvent: 'timer.fire'
      }
    };
    mockWorkflowRunRepo.findOneAndUpdate.mockResolvedValue(null);

    const result = await service.resume('token-xyz', 'webhook.received', {});

    expect(result).toBeNull();
  });
});