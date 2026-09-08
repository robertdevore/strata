# Strata CLI

[![Release](https://img.shields.io/github/v/release/robertdevore/strata?label=release&color=2f6feb)](https://github.com/robertdevore/strata/releases)
[![Local API](https://img.shields.io/badge/api-localhost:3939-0366d6)](API.md)
[![Docs](https://img.shields.io/badge/docs-README%20%7C%20API-0b7285)](README.md)

Strata CLI is the automation-first interface for Strata.

It talks to the local HTTP API, never writes directly to SQLite, and is designed for both human and agent workflows.

## Install and connect

From a source checkout, run `npm pack` and install the resulting archive with `npm install -g ./strata-0.8.0.tgz`. The installed `strata` command works outside the repository. Open the desktop app, or run `strata server --user-data-dir /path/to/library` to start the separate knowledge server. Use the same library directory as the desktop when sharing a library.

The API requires authentication. The CLI discovers the owner-only local credential automatically; `STRATA_API_TOKEN` or `--token` explicitly overrides it. `STRATA_API_CREDENTIAL_FILE` selects a different credential file. Prefer the environment or credential file over putting secrets in shell history. API base URLs must be HTTPS origins, or HTTP on loopback; embedded credentials, paths, queries and fragments are rejected. `strata config doctor` checks connectivity and authentication without requiring a source checkout.

## Quick Start

Installed usage:

```bash
strata health
strata capabilities --json
strata notes list --limit 20 --json
strata --dry-run projects import ./notes-folder
strata --confirm projects import ./notes-folder
```

From a source checkout:

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Test\n\nHello"
npm run strata -- ai route "Create a note about provider routing"
npm run strata -- --confirm projects import ./notes-folder
```

Command format:

```bash
npm run strata -- <command> [options]
```

Legacy helpers are still available:

```bash
npm run strata -- health
npm run strata:ai:legacy -- health
```

## Global Flags

Available on all commands.

| Flag | Description |
|------|-------------|
| `--base-url <url>` | Override API base URL |
| `--token <token>` | Send auth token |
| `--json` | Machine-readable output |
| `--pretty` | Human-readable output |
| `--quiet` | Minimal output |
| `--verbose` | Extra diagnostics |
| `--dry-run` | Show intent without executing |
| `--confirm` | Explicitly allow write/destructive actions |
| `--timeout <ms>` | Request timeout in milliseconds |
| `--agent` | Agent-safe behavior defaults |
| `--no-color` | Disable color output |
| `--fail-on-warning` | Exit non-zero on warnings |

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `STRATA_API_BASE_URL` | `http://127.0.0.1:3939` | Local API endpoint |
| `STRATA_API_TOKEN` | unset | Explicit credential override; otherwise discover the local credential |
| `STRATA_API_CREDENTIAL_FILE` | platform default | Override the credential-file location |
| `STRATA_USER_DATA_DIR` | platform default | Shared desktop/standalone library location |
| `STRATA_CLI_OUTPUT` | `pretty` | `pretty` or `json` |
| `STRATA_CLI_DRY_RUN` | `false` | `true` or `false` |
| `STRATA_CLI_AGENT_MODE` | `false` | `true` or `false` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic failure |
| `2` | Validation error / bad input |
| `3` | Strata API unavailable |
| `4` | Authentication failure |
| `5` | Not found |
| `6` | Conflict / unsafe operation refused |
| `7` | AI/provider failure |
| `8` | Timeout |
| `9` | Partial failure |

## Command Reference

### Health

```bash
npm run strata -- health
```

### Config

```bash
npm run strata -- config show
npm run strata -- config doctor
```

### Notes

```bash
npm run strata -- notes list --query "routing" --tag ai --limit 20
npm run strata -- notes get <noteId>
npm run strata -- notes create --content "# Title\n\nBody" --tag ai --tag routing
npm run strata -- notes create --content "# Title\n\nBody" --project "Work"
npm run strata -- notes update <noteId> --append "More text" --confirm
npm run strata -- notes update <noteId> --project "Research" --confirm
npm run strata -- notes delete <noteId> --confirm
npm run strata -- notes archive <noteId> --confirm
npm run strata -- notes unarchive <noteId> --confirm
npm run strata -- notes star <noteId>
npm run strata -- notes unstar <noteId>
```

Safety behavior:

- `update`, `archive`, `unarchive`, `delete`, and `delete-many` require `--confirm` unless `--dry-run`
- `delete-many` also requires `--confirm-bulk-delete`
- In `--agent` mode, destructive operations require `--allow-destructive`

### Projects

```bash
npm run strata -- projects list
npm run strata -- projects create "Work"
npm run strata -- projects rename <projectId> "New name"
npm run strata -- projects delete <projectId>
npm run strata -- projects reorder <projectId1> <projectId2> <projectId3>
npm run strata -- --confirm projects import ./folder-of-markdown
```

Projects are local categories. Importing a folder of markdown files creates a project named after the folder by default, then imports each markdown file as a note in that project.
`projects reorder` persists the sidebar/project order so the same sequence shows up in the UI, API, and agent flows.

`projects list` reports each project's complete non-deleted note count, including archived notes. Counts are computed by the API in SQL and do not depend on note pagination. JSON project summaries include `noteCount`; the human-readable table uses the same value.

### Search

```bash
npm run strata -- search "provider routing" --json
npm run strata -- search "provider routing" --project "Work"
```

Search uses synchronous local FTS5 ranking, indexed titles, exact tag/project filters, and a substring fallback for unmatched terms. A successful create is searchable immediately and after restart. It is not semantic search: use distinctive terms that occur in the saved note, rather than a conceptual paraphrase.

### Tags

```bash
npm run strata -- tags list
npm run strata -- tags suggest --file ./note.md
npm run strata -- tags normalize "AI Routing, provider abstraction, ai-routing"
```

### Tasks

```bash
npm run strata -- tasks extract --stdin --json
```

Task extraction is deterministic today and ready for provider-backed routing later.

### AI

```bash
npm run strata -- ai route "Create a note about DeepSeek Flash"
npm run strata -- ai note "Found that aiHandlers.ts needs provider abstraction"
npm run strata -- ai bench
npm run strata -- ai eval-routing
```

### Agent

```bash
npm run strata -- agent capture "..." --project "Agent Notes"
npm run strata -- agent decision "..." --project "Agent Notes"
npm run strata -- agent todo "..." --project "Agent Notes"
npm run strata -- agent summary --file ./summary.md --project "Agent Notes"
npm run strata -- agent context search "routing" --limit 5
```

Agent context search uses the same ranked local search contract and returns compact records (`id`, title, snippet, timestamps, project, and tags) by default. Use `--full` only when complete note bodies are required. The default limit is 5 and the accepted range is 1–50.

Agent-mode defaults:

- JSON-first output
- Non-interactive safe behavior
- No destructive defaults
- Stable machine-readable error payloads
- Agent-created notes should use `--project "Agent Notes"` so session memories stay out of the unprojected notes list
- Memory workflows should save the smallest useful delta; routine sessions may write nothing, and handoff summaries are milestone-driven rather than mandatory

Recommended full-session instruction:

```text
Use $strata-memory in AUTO mode. Recall only what this task needs, hold durable candidates without interrupting work, and save only the smallest useful memory delta at the end. A no-write result is valid. Batch duplicate searches, avoid overlapping atomic/handoff prose, and verify only high-value memory with one exact and one conceptual lookup.
```

## Bounded retrieval and safe updates

`notes list` returns at most 100 summaries per page (50 by default), with `nextCursor`. Continue with `--cursor` and the same filters. Use `--fields id,title,revision`, `--ids-only` or `--count` to reduce output. `--full` explicitly fetches full records for the selected page. `search` defaults to 25 summaries and supports the same `--fields`, `--ids-only`, `--count`, `--full` and `--cursor` options. Invalid fields or limits are rejected rather than silently ignored. `notes get <id>` retrieves one full note; `--revision` prints its current revision number and `--content-only` prints its Markdown. Those two raw-output flags are mutually exclusive and bypass the usual response envelope. Treat cursors as continuation hints, not a snapshot across concurrent changes.

Read the note revision before editing and pass it with `--if-revision`. A conflict preserves the newer stored note. For example:

```bash
strata --json notes get <noteId>
strata --confirm notes update <noteId> --if-revision 14 --stdin
strata history list <noteId>
strata --confirm history restore <noteId> 13 --if-revision 15
strata --dry-run batch --file operations.json
strata --confirm batch --file operations.json --request-id retry-safe-001
```

Batch supports at most 50 validated operations in one transaction. Request IDs make matching retries idempotent; reusing an ID with a different request is rejected. See [API.md](API.md) for operation shapes and [memory/import details](docs/CLI.md).

## JSON Error Shape

Machine success and failure responses are single-line JSON by default; `--pretty` is for human-readable output. Explicit `--json` and `--agent` also apply to validation/configuration failures. The following error example is expanded for readability:

```json
{
  "ok": false,
  "error": {
    "code": "STRATA_API_UNAVAILABLE",
    "message": "Could not reach Strata API at http://127.0.0.1:3939",
    "hint": "Start Strata, then try again."
  }
}
```

## Security Model

- No token values are printed.
- No direct DB access from CLI.
- No shell execution from model output.
- The API binds to loopback, requires a credential, and rejects browser-origin requests.

## Related Docs

- [README.md](README.md)
- [API.md](API.md)
- [SECURITY.md](SECURITY.md)
