# Strata AI Routing

Strata includes an intent-based routing system that automatically chooses between cheap and premium AI providers.

## Routing Modes

| Mode | Behavior |
|------|----------|
| `premium_only` | Always use the premium provider (e.g., GPT-4o) |
| `cheap_only` | Always use the cheap provider (e.g., DeepSeek Flash) |
| `auto` | Automatically route based on intent and risk |
| `ask_each_time` | Legacy setting; the current implementation does not present a per-message chooser. This remains under audit. |

## How Routing Works

1. **Safety check**: Destructive requests (delete, destroy, wipe) are immediately blocked
2. **Intent classification**: Keyphrase-based matching against the user's message
3. **Risk assessment**: Low/medium/high based on intent type
4. **Provider selection**: Cheap for low-risk simple tasks, premium for complex/risky tasks
5. **Fallback**: In `auto`, a cheap-provider failure can continue on premium using the same tool loop and execution state. Forced models, cheap-only policy and cancellation do not escalate.

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

Logs include intent, route, confidence, risk, provider used, fallback metadata, and token usage. They are opt-in, exclude note/chat/prompt bodies, support 7-day/30-day/forever retention, and can be cleared in Settings. Do not access the live database directly for agent memory workflows.

## Chat UI

When "Show routing decisions in chat" is enabled, a subtle metadata line appears on assistant messages:

> *Handled by DeepSeek V4 Flash — Reason: simple note creation*

Or on fallback:

> *Escalated to GPT-4o — Reason: complex code architecture request*

## Safety Model

1. **No note-deletion tool** is exposed. Heuristic routing can also flag destructive language; fixed route modes bypass that classification.
2. **Runtime validation** requires valid tool arguments and the original note revision. Do not treat intent classification as a security boundary.
3. **Confirmation enforcement** comes from AI Edit Mode. Router risk/confirmation metadata is advisory and does not grant or revoke mutation permissions.
4. **AI Edit Mode** setting (read_only/confirm/auto_apply) gates all note modifications
5. **Fallback policy** — only automatic routing can escalate a failed cheap request; permissions and cumulative tool limits remain in force.

## Eval Set

`app/main/ai/evals/routing-examples.json` contains 50 routing examples for testing and validation. Each example includes expected intent, route, risk, and confirmation requirement.
