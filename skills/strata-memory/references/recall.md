# RECALL Mode

## Goal

Retrieve the smallest trustworthy context packet needed for the current task.

## Workflow

1. Identify task, project, repository, branch, issue, role, entities, paths, commands, errors, dates, and exposed session/chat/run identifiers.
2. Check Strata health. If unavailable, report that recall did not occur and continue from current instructions.
3. Search exact identifiers first, then precise project + task + entity terms, then project decisions/constraints/procedures/lessons. Broaden to user or global preference only when relevant.
4. Prefer active, correctly scoped, authoritative, evidenced, current memories. Exclude wrong-scope, superseded, archived, stale, duplicate, or weakly inferred results unless history is requested.
5. Inspect full bodies only for promising compact results. Traverse at most one or two task-relevant relationship hops.
6. Build a diverse packet: current state, active decisions, hard constraints, applicable procedures, prior failures/lessons, open commitments, relevant preferences, recent events, and conflicts.

## Ranking

Prefer, in order:

- exact identifier and scope match;
- canonical or explicit authority;
- active validity and strong evidence;
- direct relationship to a matched memory;
- recent applicability for current-state claims.

Recency alone does not outrank a canonical source.

## Recall packet

Return only populated sections:

```markdown
# Strata Recall

- Scope:
- Current state:
- Decisions and constraints:
- Procedures and lessons:
- Open commitments:
- Conflicts or uncertainty:
- Evidence IDs/titles:
- Recommended start:
- Confidence: High | Medium | Low
```

Summarize; do not paste raw note bodies. State whether recall succeeded, found no useful memory, or could not reach Strata.

