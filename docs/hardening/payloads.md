# Agent payload measurements

This deterministic serialization benchmark compares original commit `e2ca89b` with the recorded current source. It runs the original and current tool executors against the same 100 synthetic notes, each about 7 KiB, and records source/fixture hashes. It measures UTF-8 bytes, not model-specific tokens or latency.

Run `npm run benchmark:payloads`. The immutable first result is [payloads-before-mode-policy.json](payloads-before-mode-policy.json).

| Tool | Original bytes | Current bytes | Original/current notes | Reduction |
| --- | ---: | ---: | ---: | ---: |
| `list_notes` | 45,182 | 6,872 | 60 / 15 | 84.79% |
| `search_notes` | 18,827 | 6,872 | 25 / 15 | 63.5% |
| `search_notes_by_tag` | 37,652 | 6,872 | 50 / 15 | 81.75% |
| `search_notes_by_project` | 37,823 | 7,043 | 50 / 15 | 81.38% |
| `get_project` | 75,474 | 172 | 100 / 0 | 99.77% |
| `get_note` | 7,309 | 7,372 | 1 / 1 | -0.86% |

Defaults return fewer summaries, so these numbers do not claim equivalent recall. Callers can raise the limit or request the next bounded query. `get_project` now returns project metadata; use `search_notes_by_project` for its notes. Full-note payloads grow slightly because revision, title and hydration metadata were added.

| Context component | Original bytes | Current bytes | Reduction |
| --- | ---: | ---: | ---: |
| System prompt | 1,659 | 462 | 72.15% |
| Full tool catalog | 4,925 | 5,302 | -7.65% |
| 12 open-note contexts | 38,343 | 3,548 | 90.75% |
| 40-message context | 142,092 | 24,678 | 82.63% |
| Combined content and catalog | 187,019 | 33,990 | 81.83% |

The combined figure excludes provider transport envelopes. The history fixture deliberately exceeds the new 24,000-character budget; it illustrates a long-conversation bound, not an average request. Short conversations save less. Unicode means byte counts differ from character limits.

The full catalog grows from 4,925 to 5,302 bytes as write contracts gain validation/revision fields. A measured read-only subset retains all 10 read tools and uses 2,732 bytes, 48.47% less than the current full catalog. This first snapshot measures that subset as a candidate; the runtime at that first checkpoint still advertised the full catalog. A simple permission-mode subset can achieve that saving without guessing intent.

The first context snapshot also prompted a follow-up correctness check: the current open-note builder slices serialized JSON at a character limit. Long permitted titles can therefore leave a partial final entry. The follow-up should preserve complete entries and explicitly report omissions; the original result above must remain unchanged.

## Permission policy and complete context entries

The subsequent [payloads-after-mode-policy.json](payloads-after-mode-policy.json) records the implemented policy. Read-only and unknown permission values advertise all 10 read tools (2,732 bytes); confirm and auto-apply retain all 17 tools (5,302 bytes). Runtime validation independently rejects writes under unknown modes. Selection depends on explicit permissions, avoiding intent guesses that could remove necessary retrieval tools.

Open-note context now adds whole summaries within its 4,000-character budget and reports omitted notes. Escaped strings cannot truncate serialized JSON, and excerpts preserve Unicode code points. The representative context grows from 3,548 to 3,570 bytes for the explicit wrapper/count. Combined content is 34,012 bytes with all tools, or 31,442 in read-only mode, versus the original 187,019 bytes. These are serialization measurements, not model token or quality estimates. The original snapshot remains unchanged.
