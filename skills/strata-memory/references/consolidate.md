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
7. Create a session episode/handoff only when a handoff trigger below applies. Point to atomic memory IDs or titles instead of repeating their bodies.
8. Update a state snapshot, timeline, or project hub only when project state materially changed and a safe update path exists.
9. Test each high-salience memory with an exact query, concept query, and partial cue.
10. Report only confirmed outcomes.

## Search budget

- Default result limit: 5; use 3 for narrow exact lookups.
- Default consolidation deduplication: 1–3 compact searches for the whole candidate batch, not one search per candidate.
- Inspect a full note only when its compact result may duplicate, contradict, or supersede an admitted candidate.
- Stop when every admitted candidate has a supported outcome. Do not run broader searches “just in case.”

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
- partial cue

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
- Completed:
- Verification:
- Decisions/findings and atomic IDs:
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

## Supersession

When a newer authoritative memory replaces an older one, the new memory must name the old memory, reason, effective date, and authority. Safely annotate the old memory as superseded when supported; otherwise report the missing annotation. Do not delete it.

## Unavailable Strata

Preserve admitted candidates in a pending Markdown bundle with the intended `Agent Notes` target, scope, evidence, relationships, supported save command, handoff content, and future retrieval queries. Report them as pending.

## Report

Return counts and IDs/titles for saved, merged, linked, superseded, contested, deferred, rejected, failed, and pending items; handoff/state changes; retrieval results; and the next recall cue. For a no-write consolidation, return only the reason no durable delta was admitted.
