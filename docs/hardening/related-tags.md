# Related-note sparse-tag benchmark

Workload: `related-sparse-tags-v1`, implemented in `scripts/benchmark-related.ts` and run with `npm run benchmark:related`. The baseline was recorded before the query change (commit `50ff8ad`). Both runs used the same synthetic Markdown, fixed IDs, SQLite/FTS/tag triggers, 15 warm samples per case, and 100/1,000/10,000/50,000 notes. Verification did not run concurrently with either benchmark. Other host load is not controlled.

Dense notes share a common tag and one of 100 bucket tags. Two notes at the end of each library share only a rare tag; the final note has a unique tag. Projects and graph edges are absent so this experiment isolates tag candidate generation. These are not whole-app latency or dense-graph measurements. RSS is total process RSS at each size, not incremental memory.

| Notes | Case | Before median ms | After median ms | Before p95 ms | After p95 ms | Results |
|---:|---|---:|---:|---:|---:|---:|
| 100 | dense | 1.577 | 1.465 | 1.984 | 2.535 | 8 |
| 100 | rare | 0.780 | 0.757 | 1.651 | 0.889 | 1 |
| 100 | noSharedTag | 0.726 | 0.695 | 0.799 | 1.286 | 0 |
| 1,000 | dense | 1.295 | 1.642 | 2.183 | 2.871 | 8 |
| 1,000 | rare | 1.707 | 0.726 | 2.529 | 0.779 | 1 |
| 1,000 | noSharedTag | 1.627 | 0.673 | 2.932 | 0.801 | 0 |
| 10,000 | dense | 1.279 | 1.824 | 2.101 | 3.445 | 8 |
| 10,000 | rare | 28.501 | 0.707 | 41.598 | 0.730 | 1 |
| 10,000 | noSharedTag | 29.545 | 0.645 | 34.954 | 0.662 | 0 |
| 50,000 | dense | 2.460 | 2.236 | 3.512 | 4.152 | 8 |
| 50,000 | rare | 203.479 | 1.205 | 482.484 | 4.287 | 1 |
| 50,000 | noSharedTag | 194.810 | 0.914 | 283.809 | 1.717 | 0 |

The new query seeks the active `note_tags(tag,note_id)` index, deduplicates matches into a pool of at most 100 other notes, and ranks only the bounded combined signal pools. Multiple shared tags contribute one shared-tag signal. It reads the current note’s tags/project metadata and candidate snippets, without hydrating its body. Deleted current notes return no related results.

Candidate selection is bounded, so equally scored dense libraries can select different candidate IDs after the query change; this experiment checks result counts and functional regressions, not exhaustive global relevance. Project-pool, dense-graph and end-to-end renderer measurements remain separate work.
