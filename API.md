# Strata HTTP API Guide

This document is a practical reference for tools/agents that need to read, create, update, and delete notes in Strata.

## Quick Facts

- Base URL: `http://127.0.0.1:3939`
- API is available only while Strata is running.
- Data is local-only (SQLite under Strata `userData`).
- Optional auth: set `STRATA_API_TOKEN` before launching Strata.

If auth is enabled, include one of:

- `X-Strata-Token: <token>`
- `Authorization: Bearer <token>`

## Headers

Use at least:

- `Content-Type: application/json` for `POST`, `PUT`, `PATCH`

Optional auth header examples:

```bash
-H "X-Strata-Token: your-secret-token"
# or
-H "Authorization: Bearer your-secret-token"
```

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
```

Response:

```json
{"note": {"id": "uuid", "content": "...", "tags": ["api", "agent"], "starred": false, "archived": false, "createdAt": "...", "updatedAt": "...", "deletedAt": null}}
```

---

### Update Note

`PUT /notes/:id` or `PATCH /notes/:id`

Body fields (any subset):

- `content: string`
- `starred: boolean`
- `archived: boolean`
- `tags: string[]`

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
```

Response:

```json
{"note": {"id": "uuid", "content": "...", "tags": ["important", "api"], "starred": true, "archived": false, "createdAt": "...", "updatedAt": "...", "deletedAt": null}}
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

## Using the Included CLI Helper

Strata ships with a wrapper script:

```bash
npm run notes:api -- health
npm run notes:api -- list
npm run notes:api -- get <NOTE_ID>
npm run notes:api -- create '{"content":"# Via helper"}'
npm run notes:api -- update <NOTE_ID> '{"starred":true}'
npm run notes:api -- delete <NOTE_ID>
```

Helper env vars:

- `STRATA_API_BASE_URL` (default `http://127.0.0.1:3939`)
- `STRATA_API_TOKEN` (optional)

## Operational Notes

- Keep Strata running while your agent uses the API.
- External API writes trigger automatic UI refresh in the app.
- If auth is required, launch Strata with `STRATA_API_TOKEN` set in the environment.
