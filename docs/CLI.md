# Strata AI CLI

An agent-friendly CLI for interacting with Strata's local notes HTTP API.

## Prerequisites

Strata must be running (the local API is available at `http://127.0.0.1:3939` while the app is open).

## Usage

```bash
npm run strata:ai -- <command> [args...] [--dry-run] [--json]
```

## Commands

### Health Check
```bash
npm run strata:ai -- health
```

### Note Creation
```bash
npm run strata:ai -- note "Your note content here"
```
Creates a note via `POST /notes`. The content is automatically formatted as Markdown with a title derived from the first line.

### Search Notes
```bash
npm run strata:ai -- search "search query"
```
Searches notes via `GET /search?q=...`.

### Route Evaluation
```bash
npm run strata:ai -- route "your message"
```
Evaluates the routing decision for a message (echoes back — actual routing happens server-side in the Strata app).

### Task Extraction
```bash
npm run strata:ai -- tasks "query or empty"
```
Searches for TODO/action items. Uses "TODO" as the default query if none provided.

### List Tags
```bash
npm run strata:ai -- tags
```
Lists all tags via `GET /tags`.

### Benchmark
```bash
npm run strata:ai -- bench
```
Runs health + tags + search and reports elapsed time.

## Options

- `--dry-run` — Show what would be sent without actually calling the API
- `--json` — Output results as formatted JSON

## Environment Variables

```bash
STRATA_API_BASE_URL=http://127.0.0.1:3939  # default
STRATA_API_TOKEN=                           # optional, for future auth
```

## Examples

```bash
# Create a note
npm run strata:ai -- note "Found that aiHandlers.ts needs a provider abstraction before adding DeepSeek."

# Search for notes
npm run strata:ai -- search "provider routing" --json

# Dry run (no API call)
npm run strata:ai -- note "Test note" --dry-run

# Benchmark API performance
npm run strata:ai -- bench --json

# List all tags
npm run strata:ai -- tags
```

## For External Agents

The CLI talks to Strata's existing HTTP API — it does NOT write directly to SQLite. External agents should:

1. Ensure Strata is running
2. Use the CLI with `--json` for machine-readable output
3. Check exit codes: `0` = success, `1` = error

Note payload format for note creation:
```json
{
  "content": "# Title\n\nBody",
  "tags": ["tag"]
}
```

Never use `{"title": "...", "body": "..."}` — Strata notes have a single `content` field.
