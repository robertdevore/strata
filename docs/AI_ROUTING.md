# Strata AI Routing

Strata includes an intent-based routing system that automatically chooses between cheap and premium AI providers.

## Routing Modes

| Mode | Behavior |
|------|----------|
| `premium_only` | Always use the premium provider (e.g., GPT-4o) |
| `cheap_only` | Always use the cheap provider (e.g., DeepSeek Flash) |
| `auto` | Automatically route based on intent and risk |
| `ask_each_time` | Prompt user to choose provider per message |

## How Routing Works

1. **Safety check**: Destructive requests (delete, destroy, wipe) are immediately blocked
2. **Intent classification**: Keyphrase-based matching against the user's message
3. **Risk assessment**: Low/medium/high based on intent type
4. **Provider selection**: Cheap for low-risk simple tasks, premium for complex/risky tasks
5. **Fallback**: On cheap provider failure, automatically retry with premium

## Intent Categories

| Intent | Route | Risk | Examples |
|--------|-------|------|----------|
| `create_note` | cheap | low | "create a note", "jot down", "save this" |
| `search_notes` | cheap | low | "find my notes about", "search for" |
| `tag_note` | cheap | low | "tag this as", "categorize these" |
| `extract_tasks` | cheap | low | "what are my action items?", "extract todos" |
| `summarize_note` | cheap | low | "summarize this", "tldr" |
| `rewrite_search` | cheap | low | "rewrite this search query" |
| `update_note` | premium | medium | "edit the note", "modify the note" |
| `complex_reasoning` | premium | medium | "synthesize across", "deep analysis" |
| `code_architecture` | premium | medium | "code review", "architecture", "refactor plan" |
| `unknown` | premium | low | Unmatched requests default to premium |
| Destructive | blocked | high | "delete", "destroy", "wipe" |

## Thresholds

Default thresholds (configurable in Settings → Advanced):

- **Cheap confidence threshold**: `0.85` — if confidence is below this, escalate to premium
- **Premium fallback threshold**: `0.65` — if confidence is below this, require confirmation

## Route Logs

When enabled, every routing decision is logged to `ai_route_logs`:

```sql
SELECT * FROM ai_route_logs ORDER BY created_at DESC LIMIT 10;
```

Logs include: intent, route, confidence, risk, provider used, fallback info, and token usage.

## Chat UI

When "Show routing decisions in chat" is enabled, a subtle metadata line appears on assistant messages:

> *Handled by DeepSeek V4 Flash — Reason: simple note creation*

Or on fallback:

> *Escalated to GPT-4o — Reason: complex code architecture request*

## Safety Model

1. **Delete/Destroy is blocked** — AI cannot delete notes
2. **Update requires explicit request** — AI won't modify notes unless asked
3. **Confirmation required** for medium-risk updates and high-risk operations
4. **AI Edit Mode** setting (read_only/confirm/auto_apply) gates all note modifications
5. **Fallback on failure** — cheap provider failure always retries with premium

## Eval Set

`app/main/ai/evals/routing-examples.json` contains 50+ routing examples for testing and validation. Each example includes expected intent, route, risk, and confirmation requirement.
