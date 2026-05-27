# AI Edit Permissions

Strata includes a safety and transparency layer for AI-powered note editing. Every AI-created or AI-updated note is tracked in an edit history, and users can control whether the AI may edit notes at all.

## Settings

### AI Edit Mode

Configured in **Settings → AI Edit Mode**:

| Mode | Behavior |
|------|----------|
| **Read Only** | AI cannot create or update notes. Tool calls return an error. |
| **Confirm** *(default)* | AI edits are saved but recorded in history. Users can revert any edit. |
| **Auto Apply** | Same as Confirm — AI edits are saved and recorded. The mode name indicates intent; the safety layer (history + revert) is always active. |

## How It Works

### 1. Edit Recording

Whenever the AI uses the `create_note` or `update_note` tool, Strata records an entry in the `ai_note_edits` table containing:

- `action`: `"create"` or `"update"`
- `before_content` / `after_content`: Content snapshots
- `before_tags` / `after_tags`: Tag snapshots
- `thread_id`, `message_id`: Links to the AI chat context
- `model`: The AI model used
- `prompt_excerpt`: First 200 characters of the prompt
- `created_at`: Timestamp
- `reverted_at`: Initially `null`, set when reverted

### 2. Read-Only Enforcement

When `aiEditMode` is `read_only`, the AI's `create_note` and `update_note` tool calls return an error:

```json
{ "error": "AI note editing is disabled (aiEditMode: read_only)" }
```

### 3. Viewing Edit History

Open a note, then click the **chatbot icon** (🤖) in the editor footer row (next to the trash icon). A modal opens showing all AI edits for that note, including:

- Action type and timestamp
- Whether content was changed
- Prompt excerpt
- **Revert** button for non-reverted edits

### 4. Reverting AI Edits

Clicking **Revert** on an edit entry:

- For `update` edits: Restores the note's content and tags to their previous state
- For `create` edits: Soft-deletes the created note
- Marks the edit as `reverted_at = now`

The note's content is immediately restored. The reverted edit remains in history for audit purposes.

## Database Schema

Migration v5 created the `ai_note_edits` table:

```sql
CREATE TABLE ai_note_edits (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  thread_id TEXT,
  message_id TEXT,
  action TEXT NOT NULL,        -- 'create' | 'update'
  before_content TEXT,
  after_content TEXT,
  before_tags TEXT,
  after_tags TEXT,
  model TEXT,
  prompt_excerpt TEXT,
  created_at TEXT NOT NULL,
  reverted_at TEXT,            -- NULL until reverted
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
);
```

## API Endpoints

### GET /notes/:id/ai-edits

Returns the edit history for a note.

```bash
curl http://127.0.0.1:3939/notes/abc123/ai-edits
```

### POST /ai-edits/:id/revert

Reverts a specific AI edit.

```bash
curl -X POST http://127.0.0.1:3939/ai-edits/edit-abc123/revert
```

## Design Decisions

- **No silent edits**: AI edits are NEVER applied without a history record, regardless of `aiEditMode`.
- **Revert is always available**: Even in `auto_apply` mode, users can undo AI changes.
- **Human edits are unaffected**: The edit history only tracks AI-initiated changes. Manual edits are not recorded.
- **Confirm mode is default**: New installations default to `confirm` for maximum transparency.
- **Deferred**: Inline diff preview (side-by-side before/after) and confirm-mode approval flow are scaffolded for future implementation.
