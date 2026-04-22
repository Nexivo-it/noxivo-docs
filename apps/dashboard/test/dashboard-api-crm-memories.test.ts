import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as workflowEngineClient from '../lib/api/workflow-engine-client.js';
import { dashboardApi, type TeamInboxCrmMutationInput } from '../lib/api/dashboard-api.js';

describe('dashboardApi CRM + memories wrappers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls direct workflow-engine CRM profile endpoints', async () => {
    const fetchSpy = vi
      .spyOn(workflowEngineClient, 'workflowEngineFetch')
      .mockResolvedValue({ conversationId: 'conversation-1' } as unknown);

    const mutation: TeamInboxCrmMutationInput = {
      action: 'update_profile',
      owner: null,
      pipelineStage: null,
      tags: []
    };

    await dashboardApi.getTeamInboxCrmProfile('conversation-1');
    await dashboardApi.patchTeamInboxCrmProfile('conversation-1', mutation);

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/v1/team-inbox/conversation-1/crm');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/v1/team-inbox/conversation-1/crm', {
      method: 'PATCH',
      body: JSON.stringify(mutation)
    });
  });

  it('calls direct workflow-engine memories endpoints', async () => {
    const fetchSpy = vi.spyOn(workflowEngineClient, 'workflowEngineFetch').mockResolvedValue({} as unknown);

    await dashboardApi.getMemories('15550001111@c.us');
    await dashboardApi.createMemory({
      contactId: '15550001111@c.us',
      fact: 'Prefers WhatsApp messages after 5pm',
      category: 'preference',
      source: 'manual'
    });
    await dashboardApi.deleteMemory('memory-123');

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/v1/memories?contactId=15550001111%40c.us');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/v1/memories', {
      method: 'POST',
      body: JSON.stringify({
        contactId: '15550001111@c.us',
        fact: 'Prefers WhatsApp messages after 5pm',
        category: 'preference',
        source: 'manual'
      })
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(3, '/api/v1/memories?memoryId=memory-123', {
      method: 'DELETE'
    });
  });

  it('calls direct workflow-engine team inbox and leads endpoints used by inbox/leads pages', async () => {
    const fetchSpy = vi.spyOn(workflowEngineClient, 'workflowEngineFetch').mockResolvedValue({} as unknown);

    await dashboardApi.listTeamInboxConversations({
      query: 'vip user',
      source: 'whatsapp',
      status: 'open'
    });
    await dashboardApi.getTeamInboxConversationMessages('conversation-1', {
      paginated: 1,
      limit: 20,
      cursor: 'cursor-1'
    });
    await dashboardApi.markTeamInboxConversationRead('conversation-1');
    await dashboardApi.sendTeamInboxConversationMessage('conversation-1', {
      content: 'Hello from agent',
      to: '15550001111@c.us'
    });
    await dashboardApi.assignTeamInboxConversation('conversation-1');
    await dashboardApi.unhandoffTeamInboxConversation('conversation-1');
    await dashboardApi.runTeamInboxConversationAction('conversation-1', {
      action: 'archive',
      payload: { reason: 'handled' }
    });
    await dashboardApi.runTeamInboxMessageAction('conversation-1', 'message-77', {
      action: 'delete'
    });
    await dashboardApi.saveTeamInboxLead('conversation-1');
    await dashboardApi.listTeamInboxLeads({ query: 'john' });
    await dashboardApi.deleteTeamInboxLead('conversation-1');

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/v1/team-inbox?query=vip+user&source=whatsapp&status=open');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/v1/team-inbox/conversation-1/messages?paginated=1&limit=20&cursor=cursor-1');
    expect(fetchSpy).toHaveBeenNthCalledWith(3, '/api/v1/team-inbox/conversation-1/read', {
      method: 'POST'
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(4, '/api/v1/team-inbox/conversation-1/messages', {
      method: 'POST',
      body: JSON.stringify({
        content: 'Hello from agent',
        to: '15550001111@c.us'
      })
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(5, '/api/v1/team-inbox/conversation-1/assign', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(6, '/api/v1/team-inbox/conversation-1/unhandoff', {
      method: 'POST'
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(7, '/api/v1/team-inbox/conversation-1/actions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'archive',
        payload: { reason: 'handled' }
      })
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(8, '/api/v1/team-inbox/conversation-1/messages/message-77/actions', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete'
      })
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(9, '/api/v1/team-inbox/conversation-1/lead', {
      method: 'POST'
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(10, '/api/v1/team-inbox/leads?query=john');
    expect(fetchSpy).toHaveBeenNthCalledWith(11, '/api/v1/team-inbox/conversation-1/lead', {
      method: 'DELETE'
    });
  });

  it('calls direct workflow-engine workflow detail, runs, and save endpoints used by builder/edit pages', async () => {
    const fetchSpy = vi.spyOn(workflowEngineClient, 'workflowEngineFetch').mockResolvedValue({} as unknown);

    const workflowId = 'workflow 42/alpha';
    const savePayload = {
      editorGraph: {
        nodes: [{ id: 'node-start' }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      },
      compiledDag: {
        entryNodeId: 'node-start',
        nodes: [{ id: 'node-start', type: 'trigger', next: [] }]
      }
    };

    await dashboardApi.getWorkflowDetail(workflowId);
    await dashboardApi.getWorkflowRuns(workflowId);
    await dashboardApi.saveWorkflowDefinition(workflowId, savePayload);

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/v1/workflows/workflow%2042%2Falpha');
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/v1/workflows/workflow%2042%2Falpha/runs');
    expect(fetchSpy).toHaveBeenNthCalledWith(3, '/api/v1/workflows/workflow%2042%2Falpha', {
      method: 'PATCH',
      body: JSON.stringify(savePayload)
    });
  });
});
