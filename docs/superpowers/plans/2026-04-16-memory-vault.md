# Memory Vault UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Memory Vault tab to the CRM panel in Team Inbox, enabling operators to view, add, edit, and delete learned facts about contacts.

**Architecture:** Modify the existing CRM panel to add a tab switcher. Create a MemoryView component that displays memories as cards in a grid. Use existing `/api/memories` endpoint for CRUD operations.

**Tech Stack:** Next.js 15, React, TypeScript, Lumina design tokens

---

## File Changes Overview

- **Modify**: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx` — add tab state, MemoryView component, API calls
- **No new files** — extend existing component

---

### Task 1: Add Tab State and Tab Switcher UI

**Files:**
- Modify: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx` — add activeTab state, import Brain icon

- [ ] **Step 1: Add state and imports**

Find line ~812 where `TeamInboxCrmPanel` function starts. Add after existing state:

```typescript
const [activeTab, setActiveTab] = useState<'crm' | 'memory'>('crm');
const [memories, setMemories] = useState<MemoryItem[]>([]);
const [isLoadingMemories, setIsLoadingMemories] = useState(false);
const [isSavingMemory, setIsSavingMemory] = useState(false);
const [isDeletingMemory, setIsDeletingMemory] = useState(false);
const [addModalOpen, setAddModalOpen] = useState(false);
const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

interface MemoryItem {
  id: string;
  fact: string;
  category: string;
  source: string;
  confidence: number;
  createdAt: string;
}
```

Add Brain import to the existing lucide-react imports (around line 9-14):

```typescript
import {
  // ... existing
  Brain,
  // ... existing
} from 'lucide-react';
```

- [ ] **Step 2: Add tab switcher UI in the header**

Find the first `<section>` in `TeamInboxCrmPanelView` around line 421. Replace the header section with tab switcher:

```typescript
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
```

- [ ] **Step 3: Add conditional rendering for tab content**

Find where CRM content renders (after the header section). Wrap existing CRM sections in:

```typescript
{activeTab === 'crm' && (
  <>
    {/* existing CRM sections */}
  </>
)}
```

Add new Memory tab content section after the CRM conditional:

```typescript
{activeTab === 'memory' && (
  <MemoryVaultView
    contactId={conversation.contactId}
    memories={memories}
    isLoading={isLoadingMemories}
    isSaving={isSavingMemory}
    isDeleting={isDeletingMemory}
    onAdd={() => setAddModalOpen(true)}
    onDelete={(id) => {
      setDeletingMemoryId(id);
      // Delete logic will be in Task 3
    }}
  />
)}
```

- [ ] **Step 4: Run build to verify**

Run: `pnpm --filter @noxivo/dashboard build`
Expected: PASS (no type errors)

---

### Task 2: Create MemoryVaultView Component

**Files:**
- Modify: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx` — add MemoryVaultView component

- [ ] **Step 1: Create MemoryVaultView component above TeamInboxCrmPanelView**

Find line ~396 where `TeamInboxCrmPanelView` function starts. Add before it:

```typescript
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
```

- [ ] **Step 2: Add Trash2 to imports**

Add `Trash2` to the lucide-react import list (line ~14):

```typescript
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
```

- [ ] **Step 3: Run build to verify**

Run: `pnpm --filter @noxivo/dashboard build`
Expected: PASS

---

### Task 3: Wire API Calls for CRUD

**Files:**
- Modify: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx` — add API fetch, add, delete functions

- [ ] **Step 1: Add fetch function for memories**

Find line ~218 where `fetchTeamInboxCrmProfile` is defined. Add after it:

```typescript
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
```

- [ ] **Step 2: Add loadMemories function in TeamInboxCrmPanel**

Find where `loadCrmProfile` is defined (around line 830). Add after it:

```typescript
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
```

- [ ] **Step 3: Add effect to load memories when tab switches**

Find the existing useEffect (around line 845). Add after it:

```typescript
useEffect(() => {
  if (activeTab === 'memory' && memories.length === 0) {
    void loadMemories();
  }
}, [activeTab]);
```

- [ ] **Step 4: Add add and delete handlers**

Find where `handleSaveProfile` is defined (around line 869). Add after it:

```typescript
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
```

- [ ] **Step 5: Pass handlers to MemoryVaultView**

Find where MemoryVaultView is rendered (in the tab conditional we added in Task 1). Update the props:

```typescript
{activeTab === 'memory' && (
  <MemoryVaultView
    contactId={conversation.contactId}
    memories={memories}
    isLoading={isLoadingMemories}
    isSaving={isSavingMemory}
    isDeleting={isDeletingMemory}
    onAdd={() => setAddModalOpen(true)}
    onDelete={(id) => setDeletingMemoryId(id)}
  />
)}
```

And add delete confirmation handling after the MemoryVaultView:

```typescript
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
          onClick={() => handleDeleteMemory(deletingMemoryId)}
          className="flex-1 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Add Add Memory Modal**

Add before the final return statement in TeamInboxCrmPanel (around line 939):

```typescript
{addModalOpen && (
  <AddMemoryModal
    isSaving={isSavingMemory}
    onSave={(fact, category, source) => handleAddMemory(fact, category, source)}
    onClose={() => setAddModalOpen(false)}
  />
)}
```

Add the AddMemoryModal component above TeamInboxCrmPanel (after MemoryVaultView):

```typescript
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
```

- [ ] **Step 7: Run build to verify**

Run: `pnpm --filter @noxivo/dashboard build`
Expected: PASS

- [ ] **Step 8: Commit**

Run: `git add apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx`
Run: `git status` to see changes

---

## Implementation Complete

All tasks done. The CRM panel now has a Memory tab with:
- Tab switcher (CRM | Memory)
- Card grid showing memories with category, confidence, source, timestamp
- Empty state when no memories
- Add Memory modal with fact, category, source fields
- Delete confirmation modal
- API integration for CRUD operations