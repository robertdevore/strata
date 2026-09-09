# Final controlled database and CLI results

Milliseconds, medians except the single large-project deletion. Baseline e2ca89b; final runtime 7bb45dc. Matched fixture and harness SHA-256 values are embedded in every artifact. Same Node 24.20.0, installed dependencies, Intel i7-9750H and macOS x64. Fixtures contain varied 1–4 KiB Markdown, tags, archived notes, dense links and a project containing about 90% of the notes. All libraries are synthetic temporary files.

| Operation | Before 10k | Final 10k | Before 50k | Final 50k |
|---|---:|---:|---:|---:|
| startup | 2.04 | 5.03 | 3.19 | 5.72 |
| get | 0.10 | 0.14 | 0.15 | 0.18 |
| titleLookup | 215.50 | 0.25 | 1,156.68 | 0.21 |
| list100 | 114.92 | 1.07 | 715.77 | 1.01 |
| search10 | 63.27 | 2.02 | 354.36 | 4.77 |
| tags | 119.23 | 1.53 | 801.41 | 6.00 |
| tagList100 | 25.17 | 1.59 | 146.07 | 5.75 |
| backlinksHub | 1,061.92 | 46.07 | 5,977.68 | 241.03 |
| relatedHubHttp | 750.96 | 9.41 | 3,981.60 | 9.40 |
| relatedLargeProjectHttp | 748.71 | 5.74 | 3,569.32 | 6.25 |
| projects | 0.09 | 0.12 | 0.09 | 0.12 |
| projectRename | 0.31 | 0.46 | 0.33 | 0.48 |
| updateLinks | 1,079.76 | 3.25 | 4,865.83 | 3.27 |
| renameHub | 21,591.64 | 144.94 | 161,275.32 | 766.12 |
| backup | 358.88 | 2,074.37 | 1,390.63 | 8,777.77 |
| sqlLike10Control | 74.97 | 5.92 | 293.68 | 6.08 |
| clihealth | 737.16 | 576.49 | 640.68 | 581.01 |
| clilist50 | 1,339.11 | 588.18 | 3,925.60 | 595.30 |
| clisearch10 | 893.42 | 595.05 | 1,090.44 | 617.25 |
| projectDeleteLarge | 369.98 | 1,201.95 | 2,512.23 | 7,163.86 |

See [initial comparison](../controlled-v1/README.md) for sampling and semantic differences: old lists hydrate all bodies before slicing, new lists return bounded summaries; backlinks are bounded; related ranking changed; backup sanitizes/verifies; project deletion now preserves revisions. Constructor startup excludes migration and Electron launch. SQL LIKE control also reflects database layout/cache and is not an isolated FTS comparison. RSS is not peak or exclusive process memory.

Both final sizes pass every [performance budget](../performance-budgets.md). The intermediate 50k project deletion failed the unchanged 20-second budget at 20,069.55 ms. One transactional INSERT SELECT now records complete revision snapshots before membership updates, reducing it to 7,163.86 ms. This is still slower than the old operation that recorded no history. Backup remains slower because it removes secrets, vacuums and checks integrity; sanitization now runs in a worker.

CLI JSON bytes: list50 131,996 → 27,673 (10k), 27,721 (50k); search10 23,299 → 5,645/5,655; health 139 → 103. Compact formatting and summary contracts contribute; these are UTF-8 bytes, not model tokens.
