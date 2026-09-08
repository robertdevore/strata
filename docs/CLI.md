# Strata CLI Docs

Canonical CLI documentation now lives in the repository root:

- `CLI.md`

Quick start:

```bash
npm run strata -- health
npm run strata -- notes list --json
npm run strata -- ai route "Create a note about provider routing"
```

Legacy scripts remain available for compatibility:

```bash
npm run notes:api -- health
npm run strata:ai:legacy -- health
```

### Durable memory capture

`strata agent capture`, `decision`, `todo`, and `summary` use transactional `POST /v1/memory/capture`. They deduplicate by exact content after CRLF normalization and outer whitespace trimming, scoped to the target project. They return `duplicate_found` and the existing ID/revision without updating content, tags, or history. Similar titles or approximate matches are never merged. Deleted notes are excluded. `--no-dedupe` explicitly creates another note; `--dry-run` performs the same validation and duplicate lookup but rolls back creation, including a newly named project.

Use `--source <source>` and `--session <session>` to append durable provenance as ordinary Markdown. Provenance participates in content identity, so different source/session records remain distinct. Captures receive agent/type tags without assuming a particular model or provider. No AI request is needed.

```bash
strata agent decision --stdin --project MyProject --source repository:my-project --session release-1
strata agent capture --file context.md --dry-run
```

Duplicate detection uses an indexed hash populated by schema migration 12 and maintained with content updates. It is separate from request-key idempotency: captures can be recognized across sessions even without an idempotency key.

For release verification, run `npm run package:verify`. It creates and installs a tarball in a temporary directory with production dependencies, exercises the installed authenticated server and native SQLite, and checks capture/retrieval and shutdown. It never opens the live library. The test needs package-registry access and runs separately from the offline `npm run verify` suite.

### Legacy provider credentials and standalone libraries

The standalone knowledge server does not decrypt or configure desktop provider credentials. If its library contains legacy plaintext credentials or an unfinished sanitization marker, startup fails with `CREDENTIAL_MIGRATION_REQUIRED` before exposing the API. Open that library once in the desktop app to complete the verified OS-encrypted migration; the server preserves the original credential until migration succeeds. Both desktop and standalone honor `STRATA_USER_DATA_DIR`, so use the same explicit directory for a non-default library. Fresh libraries and already-migrated libraries start normally without a credential vault in the CLI process.
