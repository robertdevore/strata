# Action

$ test "$(wc -l < skills/strata-memory/SKILL.md)" -lt 400 && test -f skills/strata-memory/references/recall.md && test -f skills/strata-memory/references/consolidate.md && test -f skills/strata-memory/references/review.md && ! cmp -s skills/strata-context/SKILL.md skills/strata-start/SKILL.md


Result: command completed.
