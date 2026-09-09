# Strata HTTP API v1

The desktop app or `strata server` owns the local SQLite library. Clients use authenticated HTTP; they do not open SQLite. The default origin is `http://127.0.0.1:3939`. Non-loopback binding is refused. Use the [installed CLI](CLI.md) for credential discovery and compact output.

## Authentication and browser boundary

Every endpoint, including health and capabilities, requires `Authorization: Bearer TOKEN` or `X-Strata-Token: TOKEN`. Strata generates an owner-only credential when none is configured. `STRATA_API_TOKEN` supplies an explicit token of at least 32 characters; `STRATA_API_CREDENTIAL_FILE` selects the credential file. Never publish this credential or send it to an untrusted origin.

There is no wildcard CORS. Requests containing Origin or Sec-Fetch-Site are rejected, including requests with a valid credential. The [legacy Paperclip bridge is retired](docs/legacy-interfaces.md). No shell endpoint or renderer shell bridge exists.

```sh
strata health
strata capabilities --json
strata notes list --limit 20 --json
```

For curl, explicitly supply the credential through your local environment; the example does not discover or print it:

```sh
curl --fail-with-body -H "Authorization: Bearer $STRATA_API_TOKEN" \
  http://127.0.0.1:3939/v1/capabilities
```

## Protocol and limits

Use `/v1/…`; unversioned aliases remain compatible. Responses include `Strata-API-Version: 1`, JSON content type, no-store and nosniff. Capabilities report schema version, supported features, authentication and current limits. POST/PUT/PATCH require `Content-Type: application/json`.

Request bodies are at most 1 MiB, responses 4 MiB, URLs 8,192 characters, list pages 100 and batches 50 operations. Queries are bounded to 500 characters. Header/request/idle deadlines prevent indefinite connections. Large exports should use smaller pages and explicit individual body retrieval.

Errors have the form `{"ok":false,"error":{"code":"REVISION_CONFLICT","message":"…","details":{}}}`. Authentication returns 401, browser requests 403, missing entities 404, revision/idempotency conflicts 409, oversized bodies/results 413, invalid input 400 and wrong content type 415. Unexpected failures return sanitized 500 errors. The CLI preserves structured server codes and distinguishes transport failures.

## Retrieval

| Method/path after /v1 | Result |
|---|---|
| GET health | `{ok:true}` |
| GET capabilities | Versions, features, limits and mutation policy |
| GET notes or search | `{notes: NoteSummary[], nextCursor}` |
| GET notes/:id | `{note}` including full content and revision |
| GET notes/:id/history | `{revisions}` metadata |
| GET notes/:id/history/:revision | `{revision}` selected snapshot |
| GET notes/:id/backlinks | `{backlinks}` with source summaries |
| GET notes/:id/related | `{related}` with note summaries and reasons |
| GET notes/:id/ai-edits | Legacy AI edit records |
| GET tags | `{tags}` SQL counts |
| GET projects | `{projects}` including full-library counts/recency |
| GET projects/:id/notes | `{project,notes,nextCursor}` |

List/search filters: `query` (alias `q`), `tag`, `untagged`, `starred`, `archived`, `projectId`, `includeDeleted`, `limit`, `cursor`, `sort`. Booleans must be `true` or `false`; sorting is `updated_desc`, `created_desc` or `title_asc`. Search combines title priority, FTS5 BM25 and substring fallback. Summaries intentionally omit full content; fetch a selected note explicitly.

Cursors are opaque, validated offsets bound to the filters. Reuse the same filters and the returned cursor. Pagination is not a snapshot: concurrent inserts/edits/deletes can move rows, so restart and deduplicate by ID when a stable traversal matters. An exactly full last page may require one empty follow-up.

## Writes and history

| Method/path | Input |
|---|---|
| POST notes | Note fields |
| PATCH/PUT notes/:id | Note fields plus expectedRevision, or numeric If-Match |
| DELETE notes/:id | expectedRevision query parameter or numeric If-Match |
| POST notes/:id/restore | `{revision,expectedRevision}` |
| POST projects | `{name}` |
| PATCH/PUT projects/:id | `{name}` |
| DELETE projects/:id | No body; preserves notes and records membership revisions |
| POST projects/reorder | `{projectIds:[…]}` |
| POST batch | `{operations:[…],dryRun?:boolean}` |
| POST projects/import | `{payload:{projectName,files:[{name,content}]},dryRun?:boolean}` |
| POST memory/capture | Capture contract used by `strata agent capture` |
| POST ai-edits/:id/revert | Legacy revision-safe revert |

Note fields are `content`, `tags`, `starred`, `archived`, `projectId` or `projectName`. Content is limited to 800,000 characters and the enclosing HTTP byte limit still applies. IDs must be UUIDs. Creation returns `{note}` with HTTP 201; read/update/restore return `{note}`. Deletion is soft deletion. Missing or stale note revisions cannot silently overwrite current state. Use the revision actually read, inspect conflicts and retry only after reconciling the change.

Batch operations: `create_note` with payload; `update_note` with id/payload including expectedRevision; `delete_note`/`restore_note` with id/expectedRevision; `create_project`, `rename_project`, `delete_project`, `reorder_projects`. All operations share one transaction; dry-run validates and rolls back. See the executable schemas in [KnowledgeService](app/main/services/knowledgeService.ts) and [CLI examples](CLI.md) for complete shapes.

Use `Idempotency-Key` for ordinary mutations, batch and folder import. Identical requests replay their receipt; a changed request under the same key conflicts. Receipts expire after seven days. Memory capture separately deduplicates exact normalized content within its project and supports explicit opt-out. Markdown provenance records source/session without provider dependence.

Logical note changes, indexes and revision snapshots commit together. Successful desktop API writes emit granular data invalidation. AI confirm mode creates proposals through the shared service; the model cannot approve them, and human approval checks original note/project state. See [AI permissions](docs/ai-edit-permissions.md), [security](SECURITY.md) and [release/recovery guidance](docs/RELEASING.md).
