'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  Brain,
  ExternalLink,
  Link2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  User
} from 'lucide-react';

interface TeamInboxContactProfileSummary {
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  firstSeenAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}

interface MemoryItem {
  id: string;
  fact: string;
  category: string;
  source: string;
  confidence: number;
  createdAt: string;
}

interface TeamInboxConversationSidebarContext {
  _id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  contactProfile: TeamInboxContactProfileSummary;
}

export type TeamInboxCrmProvider = 'hubspot' | 'salesforce' | 'pipedrive' | 'custom';

export interface TeamInboxCrmOwner {
  externalOwnerId: string;
  displayName: string | null;
  email: string | null;
}

export interface TeamInboxCrmPipelineStage {
  pipelineId: string;
  stageId: string;
  stageName: string;
}

export interface TeamInboxCrmTag {
  id?: string;
  label: string;
}

export interface TeamInboxCrmNote {
  id?: string;
  body: string;
  authorUserId: string;
  createdAt: string;
  externalRecordId?: string | null;
}

export interface TeamInboxCrmExternalLink {
  provider: TeamInboxCrmProvider;
  objectType: 'contact' | 'deal' | 'note' | 'activity';
  externalRecordId: string;
  externalUrl: string | null;
  linkedAt: string;
}

export interface TeamInboxCrmActivityItem {
  provider: TeamInboxCrmProvider;
  type: string;
  summary: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface TeamInboxCrmProfile {
  conversationId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  crmOwner: TeamInboxCrmOwner | null;
  crmPipelineStage: TeamInboxCrmPipelineStage | null;
  crmTags: TeamInboxCrmTag[];
  crmNotes: TeamInboxCrmNote[];
  lastCrmSyncedAt: string | null;
  externalLinks: TeamInboxCrmExternalLink[];
  activity: TeamInboxCrmActivityItem[];
}

export interface TeamInboxCrmProfileDraft {
  ownerExternalId: string;
  ownerDisplayName: string;
  ownerEmail: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  tagsInput: string;
}

export interface TeamInboxCrmLinkDraft {
  provider: TeamInboxCrmProvider;
  externalRecordId: string;
  externalUrl: string;
}

export type TeamInboxCrmMutation =
  | {
      action: 'update_profile';
      owner: TeamInboxCrmOwner | null;
      pipelineStage: TeamInboxCrmPipelineStage | null;
      tags: TeamInboxCrmTag[];
    }
  | {
      action: 'add_note';
      provider: 'custom';
      note: {
        body: string;
      };
    }
  | {
      action: 'link_record';
      provider: TeamInboxCrmProvider;
      externalRecordId: string;
      externalUrl: string | null;
    }
  | {
      action: 'unlink_record';
      provider: TeamInboxCrmProvider;
      externalRecordId: string;
    };

interface TeamInboxCrmPanelProps {
  conversation: TeamInboxConversationSidebarContext;
}

export interface TeamInboxCrmPanelViewProps {
  conversation: TeamInboxConversationSidebarContext;
  crmProfile: TeamInboxCrmProfile | null;
  crmError: string | null;
  isLoading: boolean;
  isSavingProfile: boolean;
  isAddingNote: boolean;
  isSavingLink: boolean;
  profileDraft: TeamInboxCrmProfileDraft;
  noteDraft: string;
  linkDraft: TeamInboxCrmLinkDraft;
  activeTab: 'crm' | 'memory';
  memories: MemoryItem[];
  isLoadingMemories: boolean;
  isSavingMemory: boolean;
  isDeletingMemory: boolean;
  onProfileDraftChange: (field: keyof TeamInboxCrmProfileDraft, value: string) => void;
  onNoteDraftChange: (value: string) => void;
  onLinkDraftChange: (field: keyof TeamInboxCrmLinkDraft, value: string) => void;
  onRetry: () => void;
  onSaveProfile: () => void;
  onAddNote: () => void;
  onLinkRecord: () => void;
  onUnlinkRecord: (link: TeamInboxCrmExternalLink) => void;
  setActiveTab: (tab: 'crm' | 'memory') => void;
  onAddMemory: () => void;
  onDeleteMemory: (id: string) => void;
}

const crmProviderOptions: TeamInboxCrmProvider[] = ['custom', 'hubspot', 'salesforce', 'pipedrive'];

const emptyProfileDraft: TeamInboxCrmProfileDraft = {
  ownerExternalId: '',
  ownerDisplayName: '',
  ownerEmail: '',
  pipelineId: '',
  stageId: '',
  stageName: '',
  tagsInput: ''
};

const emptyLinkDraft: TeamInboxCrmLinkDraft = {
  provider: 'custom',
  externalRecordId: '',
  externalUrl: ''
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

function formatRelativeDate(value: string | null): string {
  if (!value) {
    return 'Not synced yet';
  }

  return new Date(value).toLocaleString();
}

function toProfileDraft(profile: TeamInboxCrmProfile | null): TeamInboxCrmProfileDraft {
  if (!profile) {
    return emptyProfileDraft;
  }

  return {
    ownerExternalId: profile.crmOwner?.externalOwnerId ?? '',
    ownerDisplayName: profile.crmOwner?.displayName ?? '',
    ownerEmail: profile.crmOwner?.email ?? '',
    pipelineId: profile.crmPipelineStage?.pipelineId ?? '',
    stageId: profile.crmPipelineStage?.stageId ?? '',
    stageName: profile.crmPipelineStage?.stageName ?? '',
    tagsInput: profile.crmTags.map((tag) => tag.label).join(', ')
  };
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null);

  if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error;
  }

  return fallbackMessage;
}

export async function fetchTeamInboxCrmProfile(conversationId: string): Promise<TeamInboxCrmProfile> {
  const response = await fetch(`/api/team-inbox/${conversationId}/crm`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Unable to load CRM profile'));
  }

  return response.json() as Promise<TeamInboxCrmProfile>;
}

export async function fetchContactMemories(contactId: string): Promise<MemoryItem[]> {
  const response = await fetch(`/api/memories?contactId=${encodeURIComponent(contactId)}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to fetch memories');
  }

  const data = await response.json() as { memories: MemoryItem[] };
  return data.memories;
}

export async function createMemory(contactId: string, fact: string, category: string, source: string): Promise<void> {
  const response = await fetch('/api/memories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contactId, fact, category, source })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to create memory');
  }
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const response = await fetch(`/api/memories?memoryId=${encodeURIComponent(memoryId)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to delete memory');
  }
}

export async function patchTeamInboxCrmProfile(
  conversationId: string,
  mutation: TeamInboxCrmMutation
): Promise<TeamInboxCrmProfile> {
  const response = await fetch(`/api/team-inbox/${conversationId}/crm`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mutation)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Unable to update CRM profile'));
  }

  return response.json() as Promise<TeamInboxCrmProfile>;
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeCrmTagsInput(value: string): TeamInboxCrmTag[] {
  const seenLabels = new Set<string>();

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const normalized = entry.toLowerCase();

      if (seenLabels.has(normalized)) {
        return false;
      }

      seenLabels.add(normalized);
      return true;
    })
    .map((label) => ({ label }));
}

export function buildCrmProfileMutation(draft: TeamInboxCrmProfileDraft): Extract<TeamInboxCrmMutation, { action: 'update_profile' }> {
  const ownerExternalId = draft.ownerExternalId.trim();
  const ownerDisplayName = normalizeOptionalText(draft.ownerDisplayName);
  const ownerEmail = normalizeOptionalText(draft.ownerEmail);
  const pipelineId = draft.pipelineId.trim();
  const stageId = draft.stageId.trim();
  const stageName = draft.stageName.trim();
  const hasOwnerFields = Boolean(ownerExternalId || ownerDisplayName || ownerEmail);
  const hasStageFields = Boolean(pipelineId || stageId || stageName);

  if (hasOwnerFields && !ownerExternalId) {
    throw new Error('Owner ID is required to save CRM owner details');
  }

  if (hasStageFields && (!pipelineId || !stageId || !stageName)) {
    throw new Error('Pipeline ID, stage ID, and stage name are required together');
  }

  return {
    action: 'update_profile',
    owner: hasOwnerFields
      ? {
          externalOwnerId: ownerExternalId,
          displayName: ownerDisplayName,
          email: ownerEmail
        }
      : null,
    pipelineStage: hasStageFields
      ? {
          pipelineId,
          stageId,
          stageName
        }
      : null,
    tags: normalizeCrmTagsInput(draft.tagsInput)
  };
}

export function buildCrmNoteMutation(noteBody: string): Extract<TeamInboxCrmMutation, { action: 'add_note' }> {
  const trimmed = noteBody.trim();

  if (!trimmed) {
    throw new Error('Add a note before saving');
  }

  return {
    action: 'add_note',
    provider: 'custom',
    note: {
      body: trimmed
    }
  };
}

export function buildCrmLinkRecordMutation(draft: TeamInboxCrmLinkDraft): Extract<TeamInboxCrmMutation, { action: 'link_record' }> {
  const externalRecordId = draft.externalRecordId.trim();

  if (!externalRecordId) {
    throw new Error('External record ID is required to link a CRM record');
  }

  return {
    action: 'link_record',
    provider: draft.provider,
    externalRecordId,
    externalUrl: normalizeOptionalText(draft.externalUrl)
  };
}

export function isCrmProfileEmpty(profile: TeamInboxCrmProfile | null): boolean {
  if (!profile) {
    return true;
  }

  return (
    profile.crmOwner === null
    && profile.crmPipelineStage === null
    && profile.crmTags.length === 0
    && profile.crmNotes.length === 0
    && profile.externalLinks.length === 0
    && profile.activity.length === 0
  );
}

function MetricCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card hover-float group p-5 shadow-sm hover:shadow-ambient ring-1 ring-border-ghost transition-all">
      <p className="text-[11px] font-medium text-on-surface-subtle transition-colors group-hover:text-primary">
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold leading-none tracking-normal ${highlight ? 'text-primary' : 'text-on-surface'}`}>
        {value}
      </p>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel hover:border-primary/20 p-8">
      <div className="flex items-start gap-5 pb-2">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-primary-glow">
          {icon}
        </div>
        <div>
          <h4 className="text-lg font-extrabold tracking-tight text-on-surface">{title}</h4>
          <p className="mt-1 text-sm font-medium leading-relaxed text-on-surface-muted max-w-lg">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}

interface MemoryVaultViewProps {
  contactId: string;
  memories: MemoryItem[];
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

function MemoryVaultView({
  contactId,
  memories,
  isLoading,
  isSaving,
  isDeleting,
  onAdd,
  onDelete
}: MemoryVaultViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse card p-6">
            <div className="h-4 bg-surface-section rounded w-3/4 mb-3" />
            <div className="h-3 bg-surface-section rounded w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-8 text-center">
        <Brain className="h-8 w-8 text-primary mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium text-primary">
          No memories yet. Add facts about this contact to personalize AI responses.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 btn-primary text-xs"
        >
          Add First Memory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAdd}
          disabled={isSaving}
          className="btn-primary text-xs flex items-center gap-2"
        >
          <Plus className="h-3 w-3" />
          Add Memory
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {memories.map((memory) => (
          <div
            key={memory.id}
            className="card group p-5 relative hover:border-primary/30 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="text-sm font-medium text-on-surface line-clamp-3">
                {memory.fact}
              </p>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                memory.category === 'preference' ? 'bg-purple-500/10 text-purple-500' :
                memory.category === 'context' ? 'bg-blue-500/10 text-blue-500' :
                memory.category === 'history' ? 'bg-amber-500/10 text-amber-500' :
                memory.category === 'note' ? 'bg-green-500/10 text-green-500' :
                'bg-surface-section text-on-surface-muted'
              }`}>
                {memory.category}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-surface-section border border-border-ghost px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-on-surface-muted">
                  {memory.source.replace('_', ' ')}
                </span>
                <span className="text-[10px] font-bold text-on-surface-subtle">
                  {Math.round(memory.confidence * 100)}%
                </span>
              </div>
              <span className="text-[10px] font-medium text-on-surface-subtle">
                {new Date(memory.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onDelete(memory.id)}
              disabled={isDeleting}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-error/10 text-on-surface-muted hover:text-error"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamInboxCrmPanelView({
  conversation,
  crmProfile,
  crmError,
  isLoading,
  isSavingProfile,
  isAddingNote,
  isSavingLink,
  profileDraft,
  noteDraft,
  linkDraft,
  activeTab,
  memories,
  isLoadingMemories,
  isSavingMemory,
  isDeletingMemory,
  onProfileDraftChange,
  onNoteDraftChange,
  onLinkDraftChange,
  onRetry,
  onSaveProfile,
  onAddNote,
  onLinkRecord,
  onUnlinkRecord,
  setActiveTab,
  onAddMemory,
  onDeleteMemory
}: TeamInboxCrmPanelViewProps) {
  const showInitialCrmState = isLoading || (!crmProfile && crmError);
  const showCrmEmptyState = !isLoading && !crmError && isCrmProfileEmpty(crmProfile);

  return (
    <div className="space-y-10 animate-float-in">
      <section>
        <div className="flex items-center justify-between border-b border-border-ghost pb-6">
          <div className="flex items-center gap-4">
            <div className="flex rounded-2xl bg-surface-section p-1">
              <button
                type="button"
                onClick={() => setActiveTab('crm')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'crm'
                    ? 'bg-primary text-white shadow-primary-glow'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                CRM
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('memory')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'memory'
                    ? 'bg-primary text-white shadow-primary-glow'
                    : 'text-on-surface-muted hover:text-on-surface'
                }`}
              >
                <Brain className="h-3 w-3" />
                Memory
              </button>
            </div>
          </div>
        </div>
      </section>

      {activeTab === 'crm' && (
        <>
          <section>
            <div className="flex items-center justify-between border-b border-border-ghost pb-6">
              <div>
                <p className="text-[11px] font-semibold text-on-surface-subtle">Contact</p>
                <h3 className="mt-1 text-2xl font-bold tracking-tighter text-on-surface">Overview</h3>
              </div>
              <span className="rounded-xl bg-surface-section px-4 py-2 text-[11px] font-semibold text-on-surface-muted border border-border-ghost capitalize">
                {conversation.status}
              </span>
            </div>
      
            <div className="mt-8 grid grid-cols-1 gap-4">
              <MetricCard label="Full name" value={conversation.contactName || 'Unknown'} />
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Phone" value={conversation.contactPhone || '—'} />
                <MetricCard label="Contact ID" value={`id-${conversation.contactId.slice(-6)}`} />
              </div>
              <MetricCard 
                label="Total messages" 
                value={`${conversation.contactProfile.totalMessages}`} 
              />
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="First seen" value={new Date(conversation.contactProfile.firstSeenAt || '').toLocaleDateString()} />
                <MetricCard label="Last message" value={new Date(conversation.contactProfile.lastInboundAt || '').toLocaleDateString()} />
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="flex items-center justify-between border-b border-border-ghost pb-6">
              <div>
                <p className="text-[11px] font-semibold text-on-surface-subtle">CRM</p>
                <h3 className="mt-1 text-2xl font-bold tracking-tighter text-on-surface">Integration</h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-on-surface-subtle">Last sync</p>
                <p className="text-xs font-semibold text-on-surface">{formatRelativeDate(crmProfile?.lastCrmSyncedAt ?? null)}</p>
              </div>
            </div>

            {showInitialCrmState ? (
              <div className="mt-4 rounded-[32px] bg-surface-card p-6 shadow-sm">
                {isLoading ? (
                  <div className="flex h-64 flex-col items-center justify-center rounded-[32px] bg-surface-card shadow-sm text-center p-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="mt-4 text-[13px] font-medium text-on-surface-muted">Loading CRM profile…</p>
                  </div>
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center rounded-[32px] bg-surface-card shadow-sm text-center p-8">
                    <div className="rounded-[16px] bg-red-500/10 p-3 text-red-500">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-on-surface">Failed to load CRM profile</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-on-surface-muted max-w-[200px]">{crmError ?? 'An unknown error occurred.'}</p>
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-surface-base px-6 py-2.5 text-sm font-semibold text-on-surface hover:text-primary hover:bg-primary/5 transition-colors shadow-sm"
                    >
                      <RefreshCcw className="h-4 w-4 text-primary" />
                      Retry CRM
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {!showInitialCrmState && crmError ? (
              <div className="mt-4 rounded-2xl bg-red-500/10 px-5 py-4 text-[13px] font-medium text-red-500">
                {crmError}
              </div>
            ) : null}

            {showCrmEmptyState ? (
              <div className="mt-4 rounded-[32px] border border-dashed border-primary/20 bg-primary/5 px-6 py-8 text-[13px] leading-relaxed text-center font-medium shadow-sm text-primary">
                No CRM profile yet. Save owner, stage, or tags below, add a note, or link an external record to start tracking this conversation.
              </div>
            ) : null}

            {!showInitialCrmState && crmProfile ? (
              <div className="mt-8 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <MetricCard
                    label="Owner"
                    value={crmProfile.crmOwner
                      ? crmProfile.crmOwner.displayName || crmProfile.crmOwner.externalOwnerId
                      : 'Unassigned'}
                  />
                  <MetricCard
                    label="Pipeline Stage"
                    value={crmProfile.crmPipelineStage
                      ? crmProfile.crmPipelineStage.stageName
                      : 'Discovery'}
                    highlight
                  />
                </div>
                <div className="card group p-6">
                  <div className="flex items-center justify-between border-b border-border-ghost pb-4">
                    <p className="text-[11px] font-semibold text-on-surface-subtle group-hover:text-primary transition-colors">Tags</p>
                    <span className="text-[11px] font-medium text-on-surface-muted">{crmProfile.crmTags.length} active</span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {crmProfile.crmTags.length > 0 ? crmProfile.crmTags.map((tag) => (
                      <span key={tag.id ?? tag.label} className="rounded-lg bg-surface-section border border-border-ghost px-3 py-1.5 text-[11px] font-bold text-on-surface hover:border-primary/30 transition-colors">
                        {tag.label}
                      </span>
                    )) : (
                      <p className="text-sm font-medium text-on-surface-subtle">No tags applied.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {!showInitialCrmState ? (
            <>
              <SectionCard
                icon={<User className="h-4 w-4" />}
                title="Ownership & Taxonomy"
                description="Assign accountability and classify this lead within your sales architecture."
              >
                <div className="grid gap-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Owner external ID
                      <input
                        value={profileDraft.ownerExternalId}
                        onChange={(event) => onProfileDraftChange('ownerExternalId', event.target.value)}
                        placeholder="e.g. SF-998877"
                        className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                      />
                    </label>
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Owner display name
                      <input
                        value={profileDraft.ownerDisplayName}
                        onChange={(event) => onProfileDraftChange('ownerDisplayName', event.target.value)}
                        placeholder="e.g. Sarah Connor"
                        className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                      />
                    </label>
                  </div>
    
                  <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                    Owner email
                    <input
                      value={profileDraft.ownerEmail}
                      onChange={(event) => onProfileDraftChange('ownerEmail', event.target.value)}
                      placeholder="sarah@agency.com"
                      className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                    />
                  </label>
    
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Pipeline ID
                      <input
                        value={profileDraft.pipelineId}
                        onChange={(event) => onProfileDraftChange('pipelineId', event.target.value)}
                        placeholder="sales_v1"
                        className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                      />
                    </label>
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Stage ID
                      <input
                        value={profileDraft.stageId}
                        onChange={(event) => onProfileDraftChange('stageId', event.target.value)}
                        placeholder="closed_won"
                        className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                      />
                    </label>
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Stage name
                      <input
                        value={profileDraft.stageName}
                        onChange={(event) => onProfileDraftChange('stageName', event.target.value)}
                        placeholder="Closed Won"
                        className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                      />
                    </label>
                  </div>
    
                  <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                    Tags (comma separated)
                    <input
                      value={profileDraft.tagsInput}
                      onChange={(event) => onProfileDraftChange('tagsInput', event.target.value)}
                      placeholder="hot, demo_scheduled, q4_priority"
                      className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm"
                    />
                  </label>
    
                  <button
                    type="button"
                    onClick={onSaveProfile}
                    disabled={isSavingProfile}
                    className="btn-primary flex items-center justify-center gap-2 py-4 text-sm font-semibold disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {isSavingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Link2 className="h-4 w-4" />}
                title="External Ecosystem"
                description="Map this lead to your existing CRM objects (HubSpot, Salesforce, Pipedrive)."
              >
                {crmProfile && crmProfile.externalLinks.length > 0 ? (
                  <div className="space-y-4">
                    {crmProfile.externalLinks.map((link) => (
                      <div key={`${link.provider}-${link.externalRecordId}`} className="card group p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                                {link.provider}
                              </span>
                              <span className="rounded-lg bg-surface-section border border-border-ghost px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-on-surface-muted">
                                {link.objectType}
                              </span>
                            </div>
                            <p className="mt-4 truncate text-sm font-black text-on-surface tracking-tight">{link.externalRecordId}</p>
                            <p className="mt-1 text-[11px] font-bold text-on-surface-subtle">Linked on {new Date(link.linkedAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {link.externalUrl ? (
                              <a
                                href={link.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-section border border-border-ghost text-on-surface-muted transition-all hover:border-primary/30 hover:text-primary hover:shadow-primary-glow/10"
                                aria-label={`Open CRM record ${link.externalRecordId}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onUnlinkRecord(link)}
                              disabled={isSavingLink}
                              className="rounded-xl bg-surface-section border border-border-ghost px-4 py-2 text-xs font-semibold text-on-surface transition-all hover:bg-error/10 hover:text-error hover:border-error/20 disabled:opacity-50"
                            >
                              Remove link
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-on-surface-subtle italic">No external sync active.</p>
                )}

                <div className="grid gap-6 rounded-2xl bg-surface-section border border-border-ghost p-6">
                  <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                      Provider
                      <select
                        value={linkDraft.provider}
                        onChange={(event) => onLinkDraftChange('provider', event.target.value)}
                        className="rounded-xl bg-surface-card border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 shadow-sm"
                      >
                        {crmProviderOptions.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                        External record ID
                        <input
                          value={linkDraft.externalRecordId}
                          onChange={(event) => onLinkDraftChange('externalRecordId', event.target.value)}
                          placeholder="e.g. contact_9900"
                          className="rounded-xl bg-surface-card border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 shadow-sm"
                        />
                      </label>
                      <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                        Record URL
                        <input
                          value={linkDraft.externalUrl}
                          onChange={(event) => onLinkDraftChange('externalUrl', event.target.value)}
                          placeholder="https://..."
                          className="rounded-xl bg-surface-card border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 shadow-sm"
                        />
                      </label>
                    </div>
                  </div>
    
                  <button
                    type="button"
                    onClick={onLinkRecord}
                    disabled={isSavingLink}
                    className="flex items-center justify-center gap-2 rounded-xl bg-surface-card border border-border-ghost px-6 py-4 text-xs font-semibold text-on-surface transition-all hover:bg-primary/5 hover:text-primary hover:border-primary/20 shadow-sm disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {isSavingLink ? 'Linking…' : 'Link external record'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                icon={<MessageSquare className="h-4 w-4" />}
                title="Strategic Notes"
                description="Log crucial call outcomes or lead sentiment directly into the intelligence record."
              >
                {crmProfile && crmProfile.crmNotes.length > 0 ? (
                  <div className="space-y-4">
                    {crmProfile.crmNotes.map((note, index) => (
                      <div key={`${note.createdAt}-${index}`} className="group relative rounded-2xl bg-surface-section border-l-4 border-l-secondary p-6 shadow-sm transition-all hover:bg-secondary/5">
                        <p className="text-sm font-medium leading-relaxed text-on-surface whitespace-pre-wrap">{note.body}</p>
                        <div className="mt-6 flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-subtle">
                            {new Date(note.createdAt).toLocaleString()}
                          </p>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
                            By {note.authorUserId.split('@')[0]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-on-surface-subtle italic">No intelligence notes recorded.</p>
                )}
    
                <div className="grid gap-4 mt-4">
                  <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
                    Note
                    <textarea
                      rows={4}
                      value={noteDraft}
                      onChange={(event) => onNoteDraftChange(event.target.value)}
                      placeholder="Summarize the latest interaction or discovery..."
                      className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-secondary/50 focus:ring-4 focus:ring-secondary/5 shadow-sm resize-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onAddNote}
                    disabled={isAddingNote}
                    className="flex items-center justify-center gap-2 rounded-xl bg-surface-section border border-border-ghost px-6 py-4 text-xs font-semibold text-on-surface transition-all hover:bg-secondary/10 hover:text-secondary hover:border-secondary/20 shadow-sm disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {isAddingNote ? 'Saving…' : 'Add note'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                icon={<Activity className="h-4 w-4" />}
                title="Activity Ledger"
                description="A chronological stream of all events associated with this identity."
              >
                {crmProfile && crmProfile.activity.length > 0 ? (
                  <div className="space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-border-ghost">
                    {crmProfile.activity.map((event, index) => (
                      <div key={`${event.occurredAt}-${index}`} className="relative flex gap-6 pl-10">
                        <div className="absolute left-0 top-1 h-7 w-7 flex items-center justify-center rounded-full bg-surface-section border border-border-ghost shadow-sm">
                          <div className="h-2 w-2 rounded-full bg-primary shadow-primary-glow" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-black text-on-surface tracking-tight">{event.summary}</span>
                            <span className="rounded-lg bg-surface-section border border-border-ghost px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-muted">
                              {event.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-subtle">
                            {new Date(event.occurredAt).toLocaleString()} · {event.provider.toUpperCase()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-on-surface-subtle italic">No activity detected yet.</p>
                )}
              </SectionCard>
            </>
          ) : null}
        </>
      )}

      {activeTab === 'memory' && (
        <MemoryVaultView
          contactId={conversation.contactId}
          memories={memories}
          isLoading={isLoadingMemories}
          isSaving={isSavingMemory}
          isDeleting={isDeletingMemory}
          onAdd={onAddMemory}
          onDelete={onDeleteMemory}
        />
      )}
    </div>
  );
}

interface AddMemoryModalProps {
  isSaving: boolean;
  onSave: (fact: string, category: string, source: string) => void;
  onClose: () => void;
}

function AddMemoryModal({ isSaving, onSave, onClose }: AddMemoryModalProps) {
  const [fact, setFact] = useState('');
  const [category, setCategory] = useState('custom');
  const [source, setSource] = useState('manual');

  function handleSubmit() {
    if (!fact.trim()) return;
    onSave(fact.trim(), category, source);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 max-w-md w-full mx-4">
        <h4 className="text-lg font-bold text-on-surface mb-4">Add Memory</h4>
        <div className="space-y-4">
          <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
            Fact
            <textarea
              value={fact}
              onChange={(e) => setFact(e.target.value)}
              placeholder="e.g., Prefers email communication"
              maxLength={500}
              rows={3}
              className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/5 shadow-sm resize-none"
            />
          </label>
          <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 shadow-sm"
            >
              <option value="preference">Preference</option>
              <option value="context">Context</option>
              <option value="history">History</option>
              <option value="note">Note</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="grid gap-2 text-[11px] font-medium text-on-surface-subtle">
            Source
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded-xl bg-surface-section border border-border-ghost px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/50 shadow-sm"
            >
              <option value="manual">Manual</option>
              <option value="agent_added">Agent Added</option>
              <option value="ai_extracted">AI Extracted</option>
              <option value="workflow_learned">Workflow Learned</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !fact.trim()}
            className="flex-1 btn-primary text-xs"
          >
            {isSaving ? 'Saving...' : 'Save Memory'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamInboxCrmPanel({ conversation }: TeamInboxCrmPanelProps) {
  const [crmProfile, setCrmProfile] = useState<TeamInboxCrmProfile | null>(null);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [profileDraft, setProfileDraft] = useState<TeamInboxCrmProfileDraft>(emptyProfileDraft);
  const [noteDraft, setNoteDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState<TeamInboxCrmLinkDraft>(emptyLinkDraft);
  const [activeTab, setActiveTab] = useState<'crm' | 'memory'>('crm');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [isDeletingMemory, setIsDeletingMemory] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  function syncCrmState(profile: TeamInboxCrmProfile) {
    setCrmProfile(profile);
    setCrmError(null);
    setProfileDraft(toProfileDraft(profile));
    setLinkDraft(emptyLinkDraft);
  }

  async function loadCrmProfile() {
    setIsLoading(true);
    setCrmError(null);

    try {
      const profile = await fetchTeamInboxCrmProfile(conversation._id);
      syncCrmState(profile);
    } catch (loadError) {
      setCrmProfile(null);
      setCrmError(loadError instanceof Error ? loadError.message : 'Unable to load CRM profile');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMemories() {
    setIsLoadingMemories(true);
    try {
      const data = await fetchContactMemories(conversation.contactId);
      setMemories(data);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setIsLoadingMemories(false);
    }
  }

  useEffect(() => {
    setCrmProfile(null);
    setProfileDraft(emptyProfileDraft);
    setNoteDraft('');
    setLinkDraft(emptyLinkDraft);
    void loadCrmProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation._id]);

  useEffect(() => {
    if (activeTab === 'memory' && memories.length === 0) {
      void loadMemories();
    }
  }, [activeTab]);

  const handlers = useMemo(() => ({
    onProfileDraftChange(field: keyof TeamInboxCrmProfileDraft, value: string) {
      setProfileDraft((current) => ({
        ...current,
        [field]: value
      }));
    },
    onLinkDraftChange(field: keyof TeamInboxCrmLinkDraft, value: string) {
      setLinkDraft((current) => ({
        ...current,
        [field]: value as TeamInboxCrmLinkDraft[typeof field]
      }));
    }
  }), []);

  async function handleSaveProfile() {
    setIsSavingProfile(true);
    setCrmError(null);

    try {
      const nextProfile = await patchTeamInboxCrmProfile(
        conversation._id,
        buildCrmProfileMutation(profileDraft)
      );
      syncCrmState(nextProfile);
    } catch (saveError) {
      setCrmError(saveError instanceof Error ? saveError.message : 'Unable to update CRM profile');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleAddNote() {
    setIsAddingNote(true);
    setCrmError(null);

    try {
      const nextProfile = await patchTeamInboxCrmProfile(
        conversation._id,
        buildCrmNoteMutation(noteDraft)
      );
      syncCrmState(nextProfile);
      setNoteDraft('');
    } catch (noteError) {
      setCrmError(noteError instanceof Error ? noteError.message : 'Unable to save CRM note');
    } finally {
      setIsAddingNote(false);
    }
  }

  async function handleLinkRecord() {
    setIsSavingLink(true);
    setCrmError(null);

    try {
      const nextProfile = await patchTeamInboxCrmProfile(
        conversation._id,
        buildCrmLinkRecordMutation(linkDraft)
      );
      syncCrmState(nextProfile);
    } catch (linkError) {
      setCrmError(linkError instanceof Error ? linkError.message : 'Unable to link CRM record');
    } finally {
      setIsSavingLink(false);
    }
  }

  async function handleUnlinkRecord(link: TeamInboxCrmExternalLink) {
    setIsSavingLink(true);
    setCrmError(null);

    try {
      const nextProfile = await patchTeamInboxCrmProfile(conversation._id, {
        action: 'unlink_record',
        provider: link.provider,
        externalRecordId: link.externalRecordId
      });
      syncCrmState(nextProfile);
    } catch (unlinkError) {
      setCrmError(unlinkError instanceof Error ? unlinkError.message : 'Unable to unlink CRM record');
    } finally {
      setIsSavingLink(false);
    }
  }

  async function handleAddMemory(fact: string, category: string, source: string) {
    setIsSavingMemory(true);
    try {
      await createMemory(conversation.contactId, fact, category, source);
      await loadMemories();
      setAddModalOpen(false);
    } catch (error) {
      console.error('Failed to add memory:', error);
    } finally {
      setIsSavingMemory(false);
    }
  }

  async function handleDeleteMemory(id: string) {
    setIsDeletingMemory(true);
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setDeletingMemoryId(null);
    } catch (error) {
      console.error('Failed to delete memory:', error);
    } finally {
      setIsDeletingMemory(false);
    }
  }

  return (
    <>
      <TeamInboxCrmPanelView
      conversation={conversation}
      crmProfile={crmProfile}
      crmError={crmError}
      isLoading={isLoading}
      isSavingProfile={isSavingProfile}
      isAddingNote={isAddingNote}
      isSavingLink={isSavingLink}
      profileDraft={profileDraft}
      noteDraft={noteDraft}
      linkDraft={linkDraft}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onProfileDraftChange={handlers.onProfileDraftChange}
      onNoteDraftChange={setNoteDraft}
      onLinkDraftChange={handlers.onLinkDraftChange}
      onRetry={() => void loadCrmProfile()}
      onSaveProfile={() => void handleSaveProfile()}
      onAddNote={() => void handleAddNote()}
      onLinkRecord={() => void handleLinkRecord()}
      onUnlinkRecord={(link) => void handleUnlinkRecord(link)}
      memories={memories}
      isLoadingMemories={isLoadingMemories}
      isSavingMemory={isSavingMemory}
      isDeletingMemory={isDeletingMemory}
      onAddMemory={() => setAddModalOpen(true)}
      onDeleteMemory={setDeletingMemoryId}
    />

    {deletingMemoryId && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="card p-6 max-w-sm">
          <p className="text-sm font-medium text-on-surface mb-4">Delete this memory?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeletingMemoryId(null)}
              className="flex-1 btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deletingMemoryId && handleDeleteMemory(deletingMemoryId)}
              className="flex-1 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}

    {addModalOpen && (
      <AddMemoryModal
        isSaving={isSavingMemory}
        onSave={(fact, category, source) => handleAddMemory(fact, category, source)}
        onClose={() => setAddModalOpen(false)}
      />
    )}
  </>
  );
}
