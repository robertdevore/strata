# CONSOLIDATE Mode

## Goal

Persist only the durable memory delta from a completed session. A correct consolidation may write nothing.

## Workflow

1. Inventory evidence pointers: user decisions/corrections, files, commits, issue/branch, commands/tests, artifacts, external sources, and exposed session/chat/run IDs.
2. Extract independent candidates: decisions, facts, constraints, procedures, lessons, preferences, commitments, corrections, relationships, state changes, and timeline events.
3. Apply the admission gate from `SKILL.md`. Reject transient, unsafe, unsupported, incorrectly scoped, or duplicated content. If no candidate survives, stop with a confirmed no-write result.
4. Batch deduplication: group admitted candidates by scope and subject, then run 1–3 compact searches covering their exact claims, key aliases, session, conflicts, and possible supersession. Build one existing-memory index for the batch. Run a targeted follow-up only for an ambiguous candidate.
5. Choose `save`, `merge`, `link`, `supersede`, `contest`, `defer`, or `reject`.
6. Save atomic memories through supported CLI/API commands in `Agent Notes`. Search-before-write is satisfied by the batch index when it covers that candidate’s claim and scope.
7. Choose the minimum representation: atomic memory, handoff, or both only when each has distinct retrieval value. Create a handoff only when a trigger below applies, and point to atomic memory IDs or titles instead of repeating their bodies.
8. Update a state snapshot, timeline, or project hub only when project state materially changed and a safe update path exists.
9. Test only genuinely high-value memories with one exact retrieval and one conceptual retrieval.
10. Report only confirmed outcomes.

## Search budget

- Default result limit: 5; use 3 for narrow exact lookups.
- Default consolidation deduplication: 1–3 compact searches for the whole candidate batch, not one search per candidate.
- Inspect a full note only when its compact result may duplicate, contradict, or supersede an admitted candidate.
- Stop when every admitted candidate has a supported outcome. Do not run broader searches “just in case.”

## Retrieval verification

A memory is high-value when it is a durable decision, correction, hard constraint, reusable procedure, costly lesson, or surviving commitment whose absence would materially change future action.

For each high-value memory:

1. Exact retrieval: use `notes get NOTE_ID --json`, or one exact identifier/title query when no note ID is available.
2. Conceptual retrieval: run one compact natural-language paraphrase query with `--limit 5`.

Pass when the exact lookup returns the saved note and the conceptual query returns that note or a directly connected handoff/hub. If the conceptual query fails, improve the heading, focused tags, or retrieval cues through a supported safe update and retry once.

Do not run a separate partial-cue test. Do not test low-value handoffs or routine notes unless the user explicitly asks for retrieval validation.

## Concise atomic shape

```markdown
# Memory · TYPE · CONCISE CLAIM

- Memory ID: mem-YYYYMMDD-HHMMSS-slug
- Status: active
- Authority:
- Confidence: High | Medium | Low
- Scope: project / repository / task / role
- Local Strata Session ID:
- Source artifacts:
- Tags:

## Memory

One durable claim.

## Why it matters

How it changes future work.

## Evidence

Explicit source, artifact, command, test, commit, or user statement.

## Retrieval cues

- exact identifier
- natural-language concept
- optional alias or partial cue for future recall

## Relationships

Only relationships that exist: derived-from, supports, contradicts, supersedes, applies-to, depends-on, blocked-by, resolved-by, learned-from, or related-to.
```

Preserve uncertainty and validity dates when relevant. Volatile facts need source, retrieval date, and review date.

## Concise handoff shape

```markdown
# Session Memory · PROJECT · TASK · YYYY-MM-DD

- Local Strata Session ID:
- Repository / branch / issue:
- Platform / exposed IDs:
- Goal:
- Outcome: one sentence
- Atomic memory IDs/titles:
- Open commitments:
- Risks/unknowns:
- Next starting point:
- Retrieval cues:
```

A handoff is an episode, not a mandatory receipt for every task and not a replacement for independent durable decisions, constraints, lessons, or commitments.

## Handoff triggers

Create a handoff when at least one applies:

- the user explicitly requests one;
- unfinished work, a blocker, or a commitment must survive the session;
- another agent or future session needs an exact next starting point;
- a multi-step milestone materially changed project state;
- the session produced several related atomic memories that benefit from an episode index.

Do not create a handoff for routine chat, read-only inspection with no durable finding, a trivial completed edit already discoverable from committed artifacts, or a session whose only content duplicates existing memory.

If neither an atomic memory nor a handoff is admitted, return `no durable memory delta` and perform no write, projection update, pending bundle, or retrieval test.

## Representation choice and overlap check

Before writing, compare the proposed atomic memories and handoff:

- Use only atomic memory when one or more independent durable claims need future reuse but no session-level continuation is needed.
- Use only a handoff when the durable value is the session episode or next starting point and there is no independent claim worth reusing elsewhere.
- Use both only when the handoff indexes multiple atomic memories, preserves unfinished coordination, or provides a distinct chronological episode.
- When both are used, the handoff contains one-line outcome and pointers. It must not restate atomic evidence, rationale, commands, file inventories, or full findings.
- Skip the handoff when it would merely repeat a single completed atomic outcome.

Count materially repeated claims across proposed notes before saving. Any repeated claim must be removed from one representation or justified as a pointer. “Detailed record” means durable evidence references and IDs, not duplicated prose.

## Supersession

When a newer authoritative memory replaces an older one, the new memory must name the old memory, reason, effective date, and authority. Safely annotate the old memory as superseded when supported; otherwise report the missing annotation. Do not delete it.

## Unavailable Strata

Preserve admitted candidates in a pending Markdown bundle with the intended `Agent Notes` target, scope, evidence, relationships, supported save command, handoff content, and future retrieval queries. Report them as pending.

## Report

Return counts and IDs/titles for saved, merged, linked, superseded, contested, deferred, rejected, failed, and pending items; handoff/state changes; retrieval results; and the next recall cue. For a no-write consolidation, return only the reason no durable delta was admitted.
