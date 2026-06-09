# Strata HTTP API Guide

[![Local API](https://img.shields.io/badge/base_url-127.0.0.1:3939-0366d6)](http://127.0.0.1:3939/health)
[![CLI](https://img.shields.io/badge/cli-CLI.md-0b7285)](CLI.md)
[![Security](https://img.shields.io/badge/security-SECURITY.md-1f6feb)](SECURITY.md)

Practical reference for tools and agents that create, read, update, and delete Strata notes.

## Quick Facts

- Base URL: `http://127.0.0.1:3939`
- API is available only while Strata is running.
- Data is local-only (SQLite in Strata `userData`).
- Optional auth: set `STRATA_API_TOKEN` before launching Strata.

## Quick Start

CLI:

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- notes create --content "# Title\n\nBody"
npm run strata -- projects list
```

curl:

```bash
curl http://127.0.0.1:3939/health
curl "http://127.0.0.1:3939/notes?query=project"
```

For full CLI command coverage, see [CLI.md](CLI.md).

## Authentication and Headers

Required for write operations:

- `Content-Type: application/json` for `POST`, `PUT`, `PATCH`

If auth is enabled, send one of:

- `X-Strata-Token: <token>`
- `Authorization: Bearer <token>`

Header examples:

```bash
-H "X-Strata-Token: your-secret-token"
# or
-H "Authorization: Bearer your-secret-token"
```

## Endpoint Index

- `GET /health`
- `GET /notes`
- `GET /notes/:id`
- `POST /notes`
- `PUT /notes/:id`
- `PATCH /notes/:id`
- `DELETE /notes/:id`
- `GET /tags`
- `GET /projects`
- `POST /projects`
- `POST /projects/reorder`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `GET /projects/:id/notes`
- `GET /search`
- `GET /notes/:id/backlinks`
- `GET /notes/:id/related`
- `GET /notes/:id/ai-edits`
- `POST /ai-edits/:id/revert`

## Endpoints

### Health Check

`GET /health`

```bash
curl http://127.0.0.1:3939/health
```

Response:

```json
{"ok":true}
```

---

### List Notes

`GET /notes`

Optional query params:

- `query` (string)
- `starred` (`true` or `false`)
- `archived` (`true` or `false`)
- `tag` (string)
- `projectId` (string UUID)
- `includeDeleted` (`true` or `false`)

Examples:

```bash
curl http://127.0.0.1:3939/notes
curl "http://127.0.0.1:3939/notes?query=project&starred=true"
curl "http://127.0.0.1:3939/notes?tag=automation&archived=false"
```

Response shape:

```json
{
  "notes": [
    {
      "id": "uuid",
      "content": "# Title\n\nBody",
      "createdAt": "2026-03-03T22:57:50.032Z",
      "updatedAt": "2026-03-03T22:57:50.034Z",
      "starred": false,
      "archived": false,
      "tags": ["api"],
      "projectId": null,
      "deletedAt": null
    }
  ]
}
```

---

### Get One Note

`GET /notes/:id`

```bash
curl http://127.0.0.1:3939/notes/<NOTE_ID>
```

Response:

```json
{
  "note": {
    "id": "uuid",
    "content": "# Title\n\nBody",
    "createdAt": "2026-03-03T22:57:50.032Z",
    "updatedAt": "2026-03-03T22:57:50.034Z",
    "starred": false,
    "archived": false,
    "tags": ["api"],
    "projectId": null,
    "deletedAt": null
  }
}
```

---

### Create Note

`POST /notes`

Body fields are optional:

- `content: string`
- `starred: boolean`
- `archived: boolean`
- `tags: string[]`
- `projectId: string | null`
- `projectName: string`

Examples:

```bash
# Create with defaults
curl -X POST http://127.0.0.1:3939/notes \
  -H "Content-Type: application/json" \
  -d '{}'

# Create with content/tags
curl -X POST http://127.0.0.1:3939/notes \
  -H "Content-Type: application/json" \
  -d '{"content":"# New note\n\nCreated by API","tags":["api","agent"]}'

# Create inside a project by name
curl -X POST http://127.0.0.1:3939/notes \
  -H "Content-Type: application/json" \
  -d '{"content":"# Project note\n\nBody","projectName":"Work"}'
```

Response:

```json
{"note": {"id": "uuid", "content": "...", "tags": ["api", "agent"], "projectId": null, "starred": false, "archived": false, "createdAt": "...", "updatedAt": "...", "deletedAt": null}}
```

---

### Update Note

`PUT /notes/:id` or `PATCH /notes/:id`

Body fields (any subset):

- `content: string`
- `starred: boolean`
- `archived: boolean`
- `tags: string[]`
- `projectId: string | null`
- `projectName: string`

Examples:

```bash
# Update content
curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
  -H "Content-Type: application/json" \
  -d '{"content":"# Updated\n\nRewritten content"}'

# Star and retag
curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
  -H "Content-Type: application/json" \
  -d '{"starred":true,"tags":["important","api"]}'

# Move a note into a project
curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Research"}'
```

Response:

```json
{"note": {"id": "uuid", "content": "...", "tags": ["important", "api"], "projectId": null, "starred": true, "archived": false, "createdAt": "...", "updatedAt": "...", "deletedAt": null}}
```

---

### Delete Note

`DELETE /notes/:id`

```bash
curl -X DELETE http://127.0.0.1:3939/notes/<NOTE_ID>
```

Response:

```json
{"deleted":true}
```

## Common Agent Workflows

### 1) Create and keep returned ID

```bash
curl -sS -X POST http://127.0.0.1:3939/notes \
  -H "Content-Type: application/json" \
  -d '{"content":"# Agent note\n\nBody","tags":["agent"]}'
```

Read `note.id` from the response and store it for future updates.

### 2) Upsert pattern (find by query, then create/update)

1. `GET /notes?query=<text>`
2. If match found, `PATCH /notes/:id`
3. If no match, `POST /notes`

### 3) Toggle archive/star

```bash
curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
  -H "Content-Type: application/json" \
  -d '{"archived":true}'

curl -X PATCH http://127.0.0.1:3939/notes/<NOTE_ID> \
  -H "Content-Type: application/json" \
  -d '{"starred":true}'
```

## Error Handling

Typical statuses:

- `200` success
- `201` created
- `204` preflight (`OPTIONS`)
- `400` invalid JSON or validation failure
- `401` invalid/missing token (when auth enabled)
- `404` note/route not found
- `405` method not allowed
- `413` body too large (>1MB)
- `500` internal server error

Validation error shape:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": ["tags"],
      "message": "Expected array, received string"
    }
  ]
}
```

### Tags

`GET /tags`

Returns all tags with counts.

```bash
curl http://127.0.0.1:3939/tags
```

Response:

```json
{
  "tags": [
    { "name": "demo", "count": 3 },
    { "name": "features", "count": 1 }
  ]
}
```

---

### Projects

`GET /projects`

Returns all projects.

```bash
curl http://127.0.0.1:3939/projects
```

Response:

```json
{
  "projects": [
	{
	  "id": "uuid",
	  "name": "Work",
	  "createdAt": "2026-03-03T22:57:50.032Z",
	  "updatedAt": "2026-03-03T22:57:50.032Z",
	  "sortOrder": 0
	}
  ]
}
```

`POST /projects`

Body:

- `name: string`

`POST /projects/reorder`

Body:

- `projectIds: string[]`

Projects are reordered to match the supplied id sequence. Any omitted ids are appended in their existing order.

`PATCH /projects/:id`

Body:

- `name: string`

`DELETE /projects/:id`

Returns `{ "deleted": true }`.

`GET /projects/:id/notes`

Returns the project plus its notes:

```json
{
  "project": { "id": "uuid", "name": "Work", "createdAt": "...", "updatedAt": "..." },
  "notes": [ { "id": "uuid", "content": "...", "projectId": "uuid", ... } ]
}
```

---

### Search Notes

`GET /search?q=...&limit=25`

Full-text search across note content, tags, and project names.

| Param | Description | Default |
|-------|-------------|---------|
| `q` | Search query (required) | — |
| `limit` | Max results (1-100) | 25 |

```bash
curl "http://127.0.0.1:3939/search?q=wiki+links&limit=5"
```

Response:

```json
{ "notes": [{ "id": "uuid", "content": "...", ... }] }
```

---

### Backlinks

`GET /notes/:id/backlinks`

```bash
curl http://127.0.0.1:3939/notes/<NOTE_ID>/backlinks
```

Response:

```json
{
  "backlinks": [
    {
      "link": { "id": "link-id", "sourceNoteId": "uuid", "rawTarget": "My Note", "label": null },
      "source": { "id": "uuid", "content": "# Source\n\n[[My Note]]", ... }
    }
  ]
}
```

---

### Related Notes

`GET /notes/:id/related`

```bash
curl http://127.0.0.1:3939/notes/<NOTE_ID>/related
```

Response:

```json
{
  "related": [
    { "note": { "id": "uuid", ... }, "reason": "Links here, Shared tags", "score": 60 }
  ]
}
```

---

### AI Edit History

`GET /notes/:id/ai-edits`

```bash
curl http://127.0.0.1:3939/notes/<NOTE_ID>/ai-edits
```

Response:

```json
{
  "edits": [
    { "id": "edit-id", "noteId": "uuid", "action": "update", "beforeContent": "...", "afterContent": "...", "revertedAt": null }
  ]
}
```

---

### Revert AI Edit

`POST /ai-edits/:id/revert`

```bash
curl -X POST http://127.0.0.1:3939/ai-edits/<EDIT_ID>/revert
```

Response: `{ "reverted": true }`

---

## Using the Included CLI Helper

Strata ships with a wrapper script:

```bash
npm run notes:api -- health
npm run notes:api -- list
npm run notes:api -- get <NOTE_ID>
npm run notes:api -- create '{"content":"# Via helper"}'
npm run notes:api -- update <NOTE_ID> '{"starred":true}'
npm run notes:api -- delete <NOTE_ID>
npm run notes:api -- tags
npm run notes:api -- search "wiki links"
npm run notes:api -- backlinks <NOTE_ID>
npm run notes:api -- related <NOTE_ID>
npm run notes:api -- ai-edits <NOTE_ID>
npm run notes:api -- revert-edit <EDIT_ID>
```

Helper env vars:

- `STRATA_API_BASE_URL` (default `http://127.0.0.1:3939`)
- `STRATA_API_TOKEN` (optional)

## Operational Notes

- Keep Strata running while your agent uses the API.
- External API writes trigger automatic UI refresh in the app.
- If auth is required, launch Strata with `STRATA_API_TOKEN` set in the environment.
- This API intentionally does not expose shell command execution endpoints.
- Publisher shell execution is available only through preload IPC (`window.strata.shell.run`) inside the app context.
