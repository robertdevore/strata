# Retired legacy interfaces

The Paperclip HTTP bridge, `strata-ai.mjs`, `strata-note.sh`, `notes-api.sh` and Drafts migration script now exit with `LEGACY_INTERFACE_RETIRED` before opening a library or making network requests. Their old contracts lacked the current authentication discovery, bounded transport and revision prerequisites. In particular, the Paperclip bridge exposed wildcard CORS and could forward unauthenticated browser writes using a configured API credential. It must not be used as an authentication proxy.

Use the installed `strata` command or `node scripts/strata.mjs`; see [CLI](../CLI.md) and [API](../API.md). Replace legacy health/list/get/create with `strata health`, `strata notes list`, `strata notes get ID`, and `strata notes create --content TEXT`. Read the current revision before `notes update --if-revision N`; use `agent capture` for deterministic memory capture and `projects import` for Markdown folders. Export Drafts as Markdown first; the supported importer does not promise original Drafts timestamps.

Browser-extension integration requires a separately designed authenticated boundary; the core API rejects browser-origin requests. There is no replacement permissive bridge. Historical implementations remain available in Git history, not as supported runnable network clients.
