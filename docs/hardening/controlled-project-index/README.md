# Project recency index follow-up

Migration 13 adds an active-note partial index on `(project_id, updated_at DESC, id)` and deterministic candidate ordering. The unchanged controlled database harness ran against frozen source `53f8172`; fixture and harness hashes match the corresponding [pre-index measurements](../controlled-v1/README.md). Full JSON results are retained, including unaffected operations and regressions.

| Related large project over HTTP | Before index | After index |
|---|---:|---:|
| 10,000 notes | 31.77 ms | 7.05 ms |
| 50,000 notes | 141.92 ms | 6.61 ms |

Both query plans now use `idx_notes_project_recency` without the prior temporary ORDER BY B-tree. The SQL still considers at most 50 shared-project candidates. Functional behavior remains bounded, with tie order now explicit; this change does not claim identical related IDs for equally recent candidates. API capability schema version is derived from the migration catalog instead of a separately maintained literal.

The focused provider/database/backup suite passed 29 tests, TypeScript and scoped lint before these measurements. Later background-work and project UI changes are separate checkpoints and are not included in these immutable artifacts.
