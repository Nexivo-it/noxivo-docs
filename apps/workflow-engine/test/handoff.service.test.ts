import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HandoffService } from '../src/modules/conversations/handoff.service.js';

describe('HandoffService', () => {
  const conversationFindOneAndUpdate = vi.fn();
  const workflowRunFind = vi.fn();
  const workflowRunUpdateMany = vi.fn();
  const cancelContinuationJob = vi.fn();

  function queryResult<T>(value: T) {
    return {
      lean() {
        return {
          exec: async () => value
        };
      },
      exec: async () => value
    };
  }

  let service: HandoffService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new HandoffService({
      cancelContinuationJob,
      conversationRepo: {
        findOneAndUpdate: conversationFindOneAndUpdate
      },
      workflowRunRepo: {
        find: workflowRunFind,
        updateMany: workflowRunUpdateMany
      }
    });
  });

  it('moves a conversation into handoff and cancels active workflow runs', async () => {
    const conversation = {
      _id: 'conv-1',
      assignedTo: 'user-1',
      status: 'handoff'
    };

    conversationFindOneAndUpdate.mockReturnValue(queryResult(conversation));
    workflowRunFind.mockReturnValue(queryResult([
      {
        workflowRunId: 'run-1',
        status: 'suspended',
        currentNodeId: 'delay-1'
      },
      {
        workflowRunId: 'run-2',
        status: 'running',
        currentNodeId: null
      }
    ]));
    workflowRunUpdateMany.mockReturnValue(queryResult({ modifiedCount: 2 }));

    const result = await service.handoffConversation({
      agencyId: 'agency-1',
      tenantId: 'tenant-1',
      conversationId: 'conv-1',
      assignedTo: 'user-1'
    });

    expect(result).toBe(conversation);
    expect(cancelContinuationJob).toHaveBeenCalledWith('workflow.delay.resume:run-1:delay-1');
    expect(workflowRunUpdateMany).toHaveBeenCalled();
  });

  it('clears handoff back to open state', async () => {
    const clearedConversation = {
      _id: 'conv-1',
      assignedTo: null,
      status: 'open'
    };

    conversationFindOneAndUpdate.mockReturnValue(queryResult(clearedConversation));

    const result = await service.clearHandoff({
      agencyId: 'agency-1',
      tenantId: 'tenant-1',
      conversationId: 'conv-1'
    });

    expect(result).toBe(clearedConversation);
  });
});
