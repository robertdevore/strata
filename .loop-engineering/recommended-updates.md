# Strata Memory Token-Cost Updates

- [x] Fix `agent context search` query parsing, honor `--limit`, and return compact results by default.
- [x] Reduce the main memory skill to a compact policy router with mode-specific references loaded only when needed.
- [x] Make consolidation delta-based so routine or read-only sessions may produce no memory and handoffs are milestone-driven.
- [x] Batch deduplication, cap normal recall searches at 3–5 compact results, and stop once sufficient evidence is found.
- [ ] Limit retrieval verification to one exact and one conceptual query for genuinely high-value memories.
- [ ] Prevent atomic memories and handoffs from duplicating the same completed outcome without distinct retrieval value.
- [ ] Revise calling instructions and examples to request the smallest useful memory delta instead of mandatory detailed consolidation.
