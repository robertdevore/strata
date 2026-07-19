# Strata CLI

[![Release](https://img.shields.io/github/v/release/robertdevore/strata?label=release&color=2f6feb)](https://github.com/robertdevore/strata/releases)
[![Local API](https://img.shields.io/badge/api-localhost:3939-0366d6)](API.md)
[![Docs](https://img.shields.io/badge/docs-README%20%7C%20API-0b7285)](README.md)

Strata CLI is the automation-first interface for Strata.

It talks to the local HTTP API, never writes directly to SQLite, and is designed for both human and agent workflows.

## Quick Start

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Test\n\nHello"
npm run strata -- ai route "Create a note about provider routing"
npm run strata -- projects import ./notes-folder
```

Command format:

```bash
npm run strata -- <command> [options]
```

Legacy helpers are still available:

```bash
npm run notes:api -- health
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
| `STRATA_API_TOKEN` | unset | Optional auth token |
| `STRATA_CLI_OUTPUT` | `pretty` | `pretty` or `json` |
| `STRATA_CLI_DRY_RUN` | `false` | `true` or `false` |
| `STRATA_CLI_AGENT_MODE` | `false` | `true` or `false` |

Forward-looking provider variables (optional today):

- `STRATA_AI_CHEAP_PROVIDER`
- `STRATA_AI_CHEAP_MODEL`
- `STRATA_AI_PREMIUM_PROVIDER`
- `STRATA_AI_PREMIUM_MODEL`

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
npm run strata -- projects import ./folder-of-markdown
```

Projects are local categories. Importing a folder of markdown files creates a project named after the folder by default, then imports each markdown file as a note in that project.
`projects reorder` persists the sidebar/project order so the same sequence shows up in the UI, API, and agent flows.

### Search

```bash
npm run strata -- search "provider routing" --json
npm run strata -- search "provider routing" --project "Work"
```

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

Agent context search returns compact records (`id`, title, snippet, timestamps, project, and tags) by default. Use `--full` only when complete note bodies are required. The default limit is 5 and the accepted range is 1–50.

Agent-mode defaults:

- JSON-first output
- Non-interactive safe behavior
- No destructive defaults
- Stable machine-readable error payloads
- Agent-created notes should use `--project "Agent Notes"` so session memories stay out of the unprojected notes list

## JSON Error Shape

In JSON mode, CLI failures return machine-safe payloads:

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
- Localhost API defaults support local-first safety.

## Related Docs

- [README.md](README.md)
- [API.md](API.md)
- [SECURITY.md](SECURITY.md)
