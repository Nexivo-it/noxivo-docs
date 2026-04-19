# Memory Vault UI Design

## Overview

Add a Memory Vault tab to the existing CRM panel in the Team Inbox conversation view. Operators can view, add, edit, and delete learned facts about contacts — both AI-extracted and manually added.

## UI Specification

### Layout

- **Container**: Tab switcher in CRM panel header (replaces "CRM Integration" header text)
- **Tabs**: "CRM" | "Memory" — pill-style toggle with active indicator
- **Content area**: Below tabs, full-width content for active tab

### Memory Tab Components

**Card Grid**:
- Grid layout: 1 column (mobile), 2 columns (tablet+)
- Card structure:
  - Fact text (primary content, max 3 lines, ellipsis overflow)
  - Category badge (top-right): preference | context | history | note | custom
  - Confidence indicator: pill showing percentage (e.g., "95%")
  - Source badge: ai_extracted | agent_added | workflow_learned | manual
  - Timestamp: relative date ("2 hours ago", "Yesterday")
  - Actions: Edit (pencil icon), Delete (trash icon) — visible on hover

**Add Memory Button**:
- Fixed position below card grid header
- Opens modal form

**Empty State**:
- Shown when no memories exist
- Icon: brain/lightbulb
- Text: "No memories yet. Add facts about this contact to personalize AI responses."

**Loading State**:
- Skeleton cards while fetching

### Add/Edit Modal

- **Fields**:
  - Fact (textarea, required, max 500 chars)
  - Category (dropdown: preference, context, history, note, custom)
  - Source (dropdown: manual, agent_added, ai_extracted, workflow_learned) — defaults to "manual"
- **Actions**: Save, Cancel

### Delete Confirmation

- Inline confirmation on card: "Delete this memory?" with Confirm/Cancel

## Interaction Specification

### State Management

```
activeTab: 'crm' | 'memory' (default: 'crm')
memories: MemoryItem[] (fetched when Memory tab active)
isLoading: boolean
isSaving: boolean
isDeleting: boolean
addModalOpen: boolean
editingMemoryId: string | null
```

### Data Flow

1. **On tab switch to Memory**:
   - If memories not loaded, fetch `/api/memories?contactId={contactId}`
   - Show loading skeleton during fetch

2. **Add memory**:
   - POST to `/api/memories` with contactId, fact, category, source
   - On success: append to memories list, close modal, show toast

3. **Edit memory**:
   - PUT to `/api/memories/{memoryId}` — wait, API doesn't have PUT
   - **Alternative**: Delete + Create for now (API limitation)

4. **Delete memory**:
   - DELETE to `/api/memories?memoryId={memoryId}`
   - On success: remove from memories list, show toast

### Error Handling

- Network errors: Show toast with retry option
- Validation errors: Inline field errors in modal

## API Contract (Existing)

```
GET /api/memories?contactId={id}
Response: { memories: [{ id, fact, category, source, confidence, createdAt }] }

POST /api/memories
Body: { contactId, fact, category, source }
Response: { success: true }

DELETE /api/memories?memoryId={id}
Response: { success: true }
```

**Note**: API lacks PUT endpoint. Implement Edit as delete + create for MVP.

## Acceptance Criteria

1. Tab switcher toggles between CRM and Memory content
2. Memory tab shows loading skeleton while fetching
3. Card grid displays all memories with category, confidence, source, timestamp
4. Empty state shown when no memories
5. Add button opens modal with fact (textarea), category, source fields
6. Save creates memory via API and adds to grid
7. Delete removes memory via API and removes from grid
8. Edit works as delete + add (API limitation)
9. Errors display as toast notifications
10. Lumina design system tokens used (glass-panel, card, badge styles)

## File Changes

- **Modify**: `apps/dashboard/components/team-inbox/team-inbox-crm-panel.tsx` — add tab state, MemoryView component
- **No new files** — reuse existing component structure