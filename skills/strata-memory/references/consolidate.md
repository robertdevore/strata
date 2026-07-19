# CONSOLIDATE Mode

## Goal

Turn a completed session into a small, durable, retrievable memory set.

## Workflow

1. Inventory evidence pointers: user decisions/corrections, files, commits, issue/branch, commands/tests, artifacts, external sources, and exposed session/chat/run IDs.
2. Extract independent candidates: decisions, facts, constraints, procedures, lessons, preferences, commitments, corrections, relationships, state changes, and timeline events.
3. Apply the admission gate from `SKILL.md`. Reject transient, unsafe, unsupported, incorrectly scoped, or duplicated content.
4. Search before each write for the exact claim, key aliases, same session, conflicts, and superseded memory.
5. Choose `save`, `merge`, `link`, `supersede`, `contest`, `defer`, or `reject`.
6. Save atomic memories through supported CLI/API commands in `Agent Notes`.
7. After a meaningful work session, create a session episode/handoff that points to atomic memory IDs or titles.
8. Update a state snapshot, timeline, or project hub only when project state materially changed and a safe update path exists.
9. Test each high-salience memory with an exact query, concept query, and partial cue.
10. Report only confirmed outcomes.

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

A handoff is an episode, not a replacement for independent durable decisions, constraints, lessons, or commitments.

## Supersession

When a newer authoritative memory replaces an older one, the new memory must name the old memory, reason, effective date, and authority. Safely annotate the old memory as superseded when supported; otherwise report the missing annotation. Do not delete it.

## Unavailable Strata

Preserve admitted candidates in a pending Markdown bundle with the intended `Agent Notes` target, scope, evidence, relationships, supported save command, handoff content, and future retrieval queries. Report them as pending.

## Report

Return counts and IDs/titles for saved, merged, linked, superseded, contested, deferred, rejected, failed, and pending items; handoff/state changes; retrieval results; and the next recall cue.

