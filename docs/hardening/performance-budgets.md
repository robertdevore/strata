# Performance budgets

Budgets apply to the documented `controlled-v1` synthetic workload, up to 50,000 notes, on the recorded 2019 Intel macOS/Node environment. They are median regression targets with headroom, not hardware-independent service guarantees. Keep raw maxima, fixture/source hashes and environment alongside any pass/fail result. Run one workload at a time on an otherwise quiet machine; normal CI does not gate on timing noise.

| Operation | Median budget |
|---|---:|
| Open an already-migrated database | 25 ms |
| Get note / title lookup | 10 ms |
| List 100 summaries | 25 ms |
| Search 10 / tag counts | 50 ms |
| Exact-tag page | 25 ms |
| Related notes over loopback HTTP | 25 ms |
| Project listing / rename | 10 ms |
| Edit a note with three outgoing links | 30 ms |
| Backlink summaries for a dense hub | 350 ms |
| Rename a hub with 100 outgoing links and corpus-wide incoming references | 1,200 ms |
| Sanitized, verified backup | 15 seconds |
| New CLI process: health/list/search | 1 second |
| Delete the large project and record every affected revision | 20 seconds |

The hub budget is deliberately different from an ordinary edit: actual incoming references must change when a title resolves or becomes missing. Unrelated note bodies must not be scanned. Backup sanitization/verification and bulk recovery history are required work, not features to remove for a faster number.

Generate a fresh artifact, then check it:

```sh
STRATA_BENCH_COUNT=10000 node --expose-gc scripts/benchmark-controlled.mjs > /tmp/strata-benchmark.json
npm run benchmark:check -- /tmp/strata-benchmark.json
```

The checker requires a supported fixture and all budgeted metrics. It rejects missing/non-finite timings and returns nonzero for violations. Checking a stored artifact only evaluates that historical run; it does not benchmark the current checkout. The first check of the indexed 50k checkpoint failed bulk project deletion at 20,069.55 ms. That failure prompted a transactional SQL history insertion; preserve the failed checkpoint rather than changing its result.

Desktop targets are observational: home within 5 seconds, opening the sidebar within 1 second, search median below 350 ms, warm note opening below 2 seconds, replacement input below 1 second, persisted autosave below 1.5 seconds including debounce, and preview below 1 second. First editor use includes lazy initialization and should stay below 5 seconds. The [renderer measurements](renderer-v1/README.md) preserve variability and outliers; these three-sample interactions are not p95 guarantees. Use `benchmark:renderer` and optional `STRATA_RENDERER_PROFILE_PATH` to investigate a regression before adding virtualization or changing behavior.

No model-provider latency/cost budget is inferred from these offline workloads. Provider requests have separate enforced deadlines, cancellation and byte/tool/context limits.
