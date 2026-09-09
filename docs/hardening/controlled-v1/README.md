# Controlled database and CLI comparison

The eight JSON files are immutable measurements from the same `benchmark-controlled.mjs` harness and identical input hashes at 100, 1,000, 10,000 and 50,000 notes. Original source: `e2ca89b`; updated checkpoint: `6b23b70`. Each artifact includes full source/harness hashes, environment, result counts, query plan and memory observations. This is an intermediate checkpoint, before the project-recency index follow-up.

Both versions used the same installed dependencies, Node 24.20.0, macOS x64 and Intel i7-9750H. Runs were sequential, original first, with warm filesystem caches; this is a code comparison, not a comparison of historical dependency versions or cold machine boots. Most timings use seven samples after warmup; hub renames use four, CLI/backup/startup three, and project deletion one. Startup means opening an already-migrated database, not the renderer or migration cost.

The fixture contains varied real Markdown, tags, archived notes, ten projects and a large project containing about 90% of the corpus. One hub has 100 outbound links; other notes have three links and point back to the hub. Creation uses isolated SQL fixtures, not the user library. Timed updates create history; there is no pre-existing edit-history corpus. All timings below are milliseconds.

| Operation | Original 10k | Updated 10k | Original 50k | Updated 50k |
|---|---:|---:|---:|---:|
| Indexed title lookup | 215.50 | 0.21 | 1,156.68 | 0.21 |
| List 100 | 114.92 | 0.75 | 715.77 | 0.81 |
| Search 10 | 63.27 | 1.70 | 354.36 | 4.52 |
| Tag counts | 119.23 | 1.16 | 801.41 | 5.42 |
| Exact tag list | 25.17 | 1.47 | 146.07 | 4.96 |
| Backlinks to hub | 1,061.92 | 42.38 | 5,977.68 | 220.94 |
| Related hub, HTTP | 750.96 | 8.69 | 3,981.60 | 9.12 |
| Related large project, HTTP | 748.71 | 31.77 | 3,569.32 | 141.92 |
| Edit with three links | 1,079.76 | 2.45 | 4,865.83 | 2.47 |
| Rename 100-link hub | 21,591.64 | 147.91 | 161,275.32 | 725.41 |
| Backup | 358.88 | 2,054.89 | 1,390.63 | 6,929.29 |
| CLI health | 737.16 | 583.27 | 640.68 | 451.82 |
| CLI list 50 | 1,339.11 | 566.55 | 3,925.60 | 461.00 |
| CLI search 10 | 893.42 | 571.23 | 1,090.44 | 462.16 |
| Delete large project | 369.98 | 2,993.81 | 2,512.23 | 12,396.41 |

Interpret the contract changes explicitly: the original list loads full records before slicing; updated list returns bounded summaries. Original backlinks return all matches, updated backlinks cap at 100 summaries. Related notes use a different bounded deterministic candidate algorithm and may return different IDs; both are measured through their actual authenticated HTTP endpoint. Updated title renaming also repairs affected inbound links. CLI measurements include a fresh child process and transport. Input data is identical; returned representations and safety guarantees intentionally differ.

Backups are slower because the updated path removes legacy credential rows, vacuums and verifies integrity. Project deletion now records recoverable revisions for every affected note. These are measured costs, not omitted regressions. The same SQL LIKE control is included in the JSON, but schema layout and cache residency differ; do not attribute that control's improvement to FTS. RSS is a process observation before/after project deletion, not isolated allocation or peak memory.

The 50k large-project related query still scans/sorts the project using `idx_notes_project_id` and a temporary B-tree. That verified remaining cost motivates a new partial recency index; subsequent results must be stored separately rather than overwriting these files. Dense backlinks and hub title repair remain proportional to actual incoming references, while ordinary link updates no longer scan unrelated note bodies.
