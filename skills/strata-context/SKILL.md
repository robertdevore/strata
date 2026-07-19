---
name: strata-context
description: "Compatibility entry point for compact read-only Strata recall before or during a task."
---

# Strata Context

This is the read-side compatibility entry point for Strata memory.

Use `strata-memory` in `RECALL` mode. Read `../strata-memory/SKILL.md` completely, then read only `../strata-memory/references/recall.md`. Do not load consolidation or review guidance.

Return the smallest useful recall packet. Search exact task/session/run/repository identifiers first, use compact agent-context results with a normal limit of 5, inspect full bodies only for promising matches, exclude wrong-scope and superseded memories, and state whether recall succeeded.

Do not write memory in this skill.
