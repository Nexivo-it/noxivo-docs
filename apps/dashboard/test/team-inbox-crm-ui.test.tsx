import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TeamInboxCrmPanelView,
  buildCrmLinkRecordMutation,
  buildCrmNoteMutation,
  buildCrmProfileMutation,
  createMemory,
  deleteMemory,
  fetchContactMemories,
  fetchTeamInboxCrmProfile,
  isCrmProfileEmpty,
  normalizeCrmTagsInput,
  patchTeamInboxCrmProfile,
  type TeamInboxCrmPanelViewProps,
  type TeamInboxCrmProfile
} from '../components/team-inbox/team-inbox-crm-panel.js';

const conversation = {
  _id: 'conversation-1',
  contactId: '15550001111@c.us',
  contactName: 'Alice Smith',
  contactPhone: '+1 555-000-1111',
  status: 'open',
  contactProfile: {
    totalMessages: 8,
    inboundMessages: 5,
    outboundMessages: 3,
    firstSeenAt: '2026-04-10T10:00:00.000Z',
    lastInboundAt: '2026-04-12T10:15:00.000Z',
    lastOutboundAt: '2026-04-12T10:30:00.000Z'
  }
} as const;

const fullProfile: TeamInboxCrmProfile = {
  conversationId: 'conversation-1',
  contactId: '15550001111@c.us',
  contactName: 'Alice Smith',
  contactPhone: '+1 555-000-1111',
  crmOwner: {
    externalOwnerId: 'owner-7',
    displayName: 'Account Executive',
    email: 'ae@example.com'
  },
  crmPipelineStage: {
    pipelineId: 'sales',
    stageId: 'qualified',
    stageName: 'Qualified'
  },
  crmTags: [{ label: 'vip' }, { label: 'renewal' }],
  crmNotes: [{ body: 'Call after demo', authorUserId: 'user-1', createdAt: '2026-04-12T11:00:00.000Z' }],
  lastCrmSyncedAt: '2026-04-12T11:30:00.000Z',
  externalLinks: [{
    provider: 'hubspot',
    objectType: 'contact',
    externalRecordId: 'hs-contact-1',
    externalUrl: 'https://app.hubspot.com/contacts/1',
    linkedAt: '2026-04-12T09:00:00.000Z'
  }],
  activity: [{
    provider: 'custom',
    type: 'note_added',
    summary: 'Call after demo',
    occurredAt: '2026-04-12T11:00:00.000Z',
    metadata: {}
  }]
};

function createViewProps(overrides: Partial<TeamInboxCrmPanelViewProps> = {}): TeamInboxCrmPanelViewProps {
  return {
    conversation,
    crmProfile: fullProfile,
    crmError: null,
    isLoading: false,
    isSavingProfile: false,
    isAddingNote: false,
    isSavingLink: false,
    profileDraft: {
      ownerExternalId: 'owner-7',
      ownerDisplayName: 'Account Executive',
      ownerEmail: 'ae@example.com',
      pipelineId: 'sales',
      stageId: 'qualified',
      stageName: 'Qualified',
      tagsInput: 'vip, renewal'
    },
    noteDraft: '',
    linkDraft: {
      provider: 'custom',
      externalRecordId: '',
      externalUrl: ''
    },
    onProfileDraftChange: vi.fn(),
    onNoteDraftChange: vi.fn(),
    onLinkDraftChange: vi.fn(),
    onRetry: vi.fn(),
    onSaveProfile: vi.fn(),
    onAddNote: vi.fn(),
    onLinkRecord: vi.fn(),
    onUnlinkRecord: vi.fn(),
    onDeleteMemory: vi.fn(),
    activeTab: 'crm',
    memories: [],
    isLoadingMemories: false,
    isSavingMemory: false,
    isDeletingMemory: false,
    setActiveTab: vi.fn(),
    onAddMemory: vi.fn(),
    ...overrides
  };
}

describe('team inbox CRM panel UI', () => {
  it('renders loading, empty, and populated CRM states', () => {
    const loadingMarkup = renderToStaticMarkup(
      createElement(TeamInboxCrmPanelView, createViewProps({ crmProfile: null, isLoading: true }))
    );
    const emptyMarkup = renderToStaticMarkup(
      createElement(
        TeamInboxCrmPanelView,
        createViewProps({
          crmProfile: {
            ...fullProfile,
            crmOwner: null,
            crmPipelineStage: null,
            crmTags: [],
            crmNotes: [],
            externalLinks: [],
            activity: []
          }
        })
      )
    );
    const populatedMarkup = renderToStaticMarkup(
      createElement(TeamInboxCrmPanelView, createViewProps())
    );

    expect(loadingMarkup).toContain('Loading CRM profile');
    expect(emptyMarkup).toContain('No CRM profile yet');
    expect(populatedMarkup).toContain('Integration');
    expect(populatedMarkup).toContain('Account Executive');
    expect(populatedMarkup).toContain('Qualified');
    expect(populatedMarkup).toContain('hs-contact-1');
    expect(populatedMarkup).toContain('Call after demo');
  });

  it('builds profile, note, and record-link mutations for user edits', () => {
    expect(normalizeCrmTagsInput('vip, renewal, vip')).toEqual([
      { label: 'vip' },
      { label: 'renewal' }
    ]);

    expect(buildCrmProfileMutation({
      ownerExternalId: 'owner-9',
      ownerDisplayName: 'Closer',
      ownerEmail: 'closer@example.com',
      pipelineId: 'sales',
      stageId: 'proposal',
      stageName: 'Proposal Sent',
      tagsInput: 'hot, expansion'
    })).toEqual({
      action: 'update_profile',
      owner: {
        externalOwnerId: 'owner-9',
        displayName: 'Closer',
        email: 'closer@example.com'
      },
      pipelineStage: {
        pipelineId: 'sales',
        stageId: 'proposal',
        stageName: 'Proposal Sent'
      },
      tags: [{ label: 'hot' }, { label: 'expansion' }]
    });

    expect(buildCrmNoteMutation('  Capture pricing questions  ')).toEqual({
      action: 'add_note',
      provider: 'custom',
      note: { body: 'Capture pricing questions' }
    });

    expect(buildCrmLinkRecordMutation({
      provider: 'hubspot',
      externalRecordId: 'hs-42',
      externalUrl: 'https://app.hubspot.com/contacts/42'
    })).toEqual({
      action: 'link_record',
      provider: 'hubspot',
      externalRecordId: 'hs-42',
      externalUrl: 'https://app.hubspot.com/contacts/42'
    });
  });

  it('treats a blank CRM payload as empty state', () => {
    expect(isCrmProfileEmpty({
      ...fullProfile,
      crmOwner: null,
      crmPipelineStage: null,
      crmTags: [],
      crmNotes: [],
      externalLinks: [],
      activity: []
    })).toBe(true);
  });

  it('uses the CRM dashboard route for fetches and patches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fullProfile), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    vi.stubGlobal('fetch', fetchMock);

    const loadedProfile = await fetchTeamInboxCrmProfile('conversation-1');

    expect(loadedProfile.contactId).toBe('15550001111@c.us');
    expect(loadedProfile.crmTags[0]).toMatchObject({ label: 'vip' });

    await expect(patchTeamInboxCrmProfile('conversation-1', {
      action: 'update_profile',
      owner: null,
      pipelineStage: null,
      tags: []
    })).resolves.toMatchObject({
      conversationId: 'conversation-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:3001/api/v1/team-inbox/conversation-1/crm', expect.objectContaining({
      credentials: 'include'
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/v1/team-inbox/conversation-1/crm', expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify({
        action: 'update_profile',
        owner: null,
        pipelineStage: null,
        tags: []
      })
    }));
  });

  it('uses direct memories workflow-engine endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ memories: [{ id: 'm1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));

    vi.stubGlobal('fetch', fetchMock);

    await fetchContactMemories('15550001111@c.us');
    await createMemory('15550001111@c.us', 'Prefers PDF invoices', 'preference', 'manual');
    await deleteMemory('memory-42');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:3001/api/v1/memories?contactId=15550001111%40c.us', expect.objectContaining({
      credentials: 'include'
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/v1/memories', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        contactId: '15550001111@c.us',
        fact: 'Prefers PDF invoices',
        category: 'preference',
        source: 'manual'
      })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://localhost:3001/api/v1/memories?memoryId=memory-42', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include'
    }));
  });
});
