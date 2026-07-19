---
name: strata-start
description: "Compatibility entry point for safe Strata memory capture and end-of-session consolidation."
---

# Strata Start / Save

This is the write-side compatibility entry point for Strata memory.

Use `strata-memory` in `CONSOLIDATE` mode. Read `../strata-memory/SKILL.md` completely, then read only `../strata-memory/references/consolidate.md`. Do not load recall or review guidance unless the task explicitly requires those modes.

Apply admission, safety, scope, deduplication, provenance, and retrieval rules. Store agent-created notes in `Agent Notes` through the CLI or documented local API. Never write directly to SQLite and never claim a write succeeded without confirmation.

If Strata is unavailable, report admitted memory as pending and keep the main task moving.
