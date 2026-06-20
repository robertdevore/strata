# Strata Context Skill

## Purpose

Use this skill when the user wants an agent to gather relevant project memory from **Strata** before starting or continuing a task.

Strata is the user’s local-first project memory and Markdown note system. It stores durable notes from previous agent runs, coding sessions, research tasks, architecture decisions, debugging work, planning sessions, and handoffs.

This skill is the **read-side** companion to the Strata Save Skill.

Use this skill to search Strata by project name, repo name, tag, keyword, feature, tool, date, session ID, chat ID, run ID, or task area, then produce a compact context packet that helps the agent begin work with the right background.

The goal is:

> Gather the smallest useful set of prior knowledge needed to do the current task well.

Do not dump every note into context. Search, filter, summarize, and prioritize.

---

## Relationship to the Strata Save Skill

This skill gathers notes before or during a task.

The **Strata Save Skill** saves notes after a task.

Recommended full workflow:

```text
Start of task:
Use Strata Context Skill
→ search/read prior Strata notes
→ build context packet

During task:
Use gathered context as background

End of task:
Use Strata Save Skill
→ save durable handoff note
→ preserve useful findings for the next run
```

Together, these create a two-way local agent memory loop.

---

## Expected Location

This skill may be installed globally in the user’s local agent skills folder.

Common global path:

```text
~/.agent/skills/strata-context/SKILL.md
```

The global skill may be a symlink to the canonical copy inside the Strata repo.

Example canonical source:

```text
/Users/robertdevore/Documents/Kujolang/kujo-repos/strata/skills/strata-context/SKILL.md
```

Example global symlink target:

```text
/Users/robertdevore/.agent/skills/strata-context
```

Agents should read this file when the user says:

```text
Use the Strata Context skill.
```

or:

```text
Before starting, read ~/.agent/skills/strata-context/SKILL.md and follow it to gather relevant Strata context for this task.
```

---

## When to Use This Skill

Use this skill when the user says anything like:

* “Use the Strata Context skill.”
* “Use the Strata Intel skill.”
* “Gather context from Strata.”
* “Check Strata before starting.”
* “Look up previous notes in Strata.”
* “Find notes tagged with X.”
* “Search Strata for this project.”
* “Pull the relevant Strata memory first.”
* “Get the project background from Strata.”
* “Before you start, see what Strata knows about this.”
* “Look up this session ID in Strata.”
* “Find notes from the last three chats.”
* “Find the previous runs for this task.”
* “Search Strata by chat ID.”
* “Search Strata by RunLedger ID.”
* “Grab the relevant context from our prior sessions.”

Also use this skill when the task clearly depends on prior local project context and the user has indicated that Strata is available.

---

## What Strata Context Is For

A Strata context packet should help the current agent understand:

* what has already happened
* what was decided
* what was validated
* what failed before
* what follow-ups remain
* what constraints or gotchas matter
* what prior sessions are connected
* what earlier chats/runs should be treated as relevant
* what the next best starting point is

A good context packet should answer:

> “What should this agent know before touching the task?”

---

## Agent Notes Storage Awareness

Agent-created session memories, handoffs, decisions, TODOs, and rollups are stored in the Strata project named `Agent Notes` by default.

When the user asks for context for a real work project such as Kujo, Strata, UDC SaaS, PackWrite, or Cinch, do not assume the Strata project assignment is the same thing as the semantic project scope. Search note text, headings, tags, session IDs, repository names, and metadata fields such as `Project: Kujo` or `project-kujo`.

Use a Strata project-name filter only when the user explicitly asks to restrict results to that storage project, or when you know the relevant notes are stored there. For agent memory recall, include `Agent Notes` as a likely storage bucket while keeping the semantic scope tied to the user's requested project, repo, and task.

---

## Core Rules

1. **Read this skill before using it.**
   If the user references the Strata Context skill, inspect this file unless it is already loaded in the current context.

2. **Use Strata CLI or Strata local API.**
   Do not read directly from Strata’s database.

3. **Search narrowly first, then widen if needed.**
   Start with the project, repo, tags, keywords, or session IDs the user gave.

4. **Search exact identifiers first.**
   Session IDs, chat IDs, run IDs, and RunLedger IDs should be searched exactly before broader keyword searches.

5. **Prefer durable context over noise.**
   Prioritize decisions, summaries, TODOs, captures, canonical notes, and recent handoffs.

6. **Do not dump raw notes unless the user asks.**
   Summarize findings into a compact context packet.

7. **Preserve uncertainty.**
   If notes conflict, say so.

8. **Respect recency and canonical notes.**
   Newer notes matter, but canonical/source-of-truth notes may override newer ad hoc notes.

9. **Do not expose secrets or sensitive content.**
   If a note contains credentials or sensitive personal information, do not include it in the context packet.

10. **Do not claim Strata context was gathered unless the search actually succeeded.**

---

## Session / Chat / Run Lookup

Strata notes may include local session identifiers and optional platform identifiers.

When the user provides a session ID, chat ID, run ID, RunLedger ID, or related-session tag, search for that exact identifier first.

Search these fields and tags:

* Session ID
* Parent Session
* Related Sessions
* Chat ID
* Chat URL
* Platform
* Runtime
* Agent
* Model
* Run ID
* RunLedger ID
* Tags
* Project
* Repo
* Date

Session ID tags usually look like:

```text
session-cinch-mcp-validation-20260618-2045
session-udc-saas-paperclip-20260618-01
```

Run tags may look like:

```text
run-RUN_ID
runledger-RUNLEDGER_ID
```

If the user asks for “the last three chats” or “recent sessions,” search by project/tag/date and return the three most relevant recent Strata notes or session groups.

If a platform chat ID is not available, rely on the local Strata Session ID.

Do not assume Codex, Claude, ChatGPT, or another tool exposes a stable chat ID. Treat platform chat IDs as optional metadata.

---

## Common User Invocation

The user may say:

```text
Use the Strata Context skill before starting this task.

Project: udc-saas
Tags: udc-saas, paperclip, architecture
Keywords: static sites, headless Burst, UpdraftCentral decoupling
```

The user may provide a session ID:

```text
Use the Strata Context skill.

Look up this session first:

session-id: udc-saas-paperclip-20260618-01

Then gather any related sessions tagged udc-saas, paperclip, and architecture.
```

The user may ask for recent chats:

```text
Use the Strata Context skill and pull the last three sessions related to Cinch, MCP, RAG, and validation.
```

The user may ask for run-specific context:

```text
Use the Strata Context skill. Search by this RunLedger ID first, then pull related notes:

runledger-id: abc123
```

When the user provides tags, projects, session IDs, chat IDs, run IDs, or keywords, use them exactly.

---

## Inputs to Look For

Extract these from the user’s request:

* project name
* repo name
* tool name
* feature name
* branch name
* issue/card ID
* tags
* keywords
* date range
* task type
* product area
* requested output format
* session ID
* parent session
* related sessions
* chat ID
* chat URL
* platform
* runtime
* agent name
* model name
* run ID
* RunLedger ID

Examples:

```text
Project: Kujo
Repo: packwrite
Tags: kujo, packwrite, skills
Keywords: agent pack, MEGA_PROMPT, /agent folder
Task type: implementation
Session ID: kujo-packwrite-skills-20260618-2135
```

```text
Project: UpdraftCentral SaaS
Tags: udc-saas, static-sites, leadership
Keywords: decoupled SaaS, headless plugins, cross-platform backups
Task type: architecture planning
Session ID: udc-saas-paperclip-20260618-01
```

---

## Step 1: Confirm Local Access

Check that the agent can access the local filesystem and this skill.

```bash
test -f ~/.agent/skills/strata-context/SKILL.md && echo "Strata Context skill found"
```

```bash
ls -la ~/.agent/skills/strata-context
```

If the skill is symlinked:

```bash
readlink ~/.agent/skills/strata-context
```

If this skill cannot be found, continue only if the user provided equivalent instructions directly.

---

## Step 2: Check Strata Availability

Check whether Strata is available.

Preferred command:

```bash
npm run strata -- health
```

Alternative:

```bash
strata-ai health
```

If Strata exposes a local API, the expected local base may be:

```text
http://127.0.0.1:3939
```

If Strata is unavailable, tell the user clearly:

```text
I could not reach Strata, so I could not gather prior project context from it.
```

Do not pretend to have checked memory.

---

## Step 3: Build Search Plan

Create a small search plan from the user’s request.

Always include:

1. exact identifier searches, if provided
2. precise project/topic search
3. broader project/tag search
4. recent-session search, if the user asks for recent chats/sessions

Example for a session-specific lookup:

```text
Exact:
session-udc-saas-paperclip-20260618-01
udc-saas-paperclip-20260618-01

Related:
udc-saas paperclip architecture

Broad:
updraftcentral decoupled SaaS
```

Example for UDC SaaS:

```text
Precise:
udc-saas paperclip architecture static sites headless Burst

Broad:
updraftcentral decoupled SaaS
```

Example for Cinch:

```text
Precise:
cinch mcp rag validation workflow

Broad:
cinch harness

Session/recent:
cinch mcp recent sessions
```

Example for Kujo PackWrite:

```text
Precise:
packwrite MEGA_PROMPT agent pack /agent

Broad:
kujo packwrite
```

---

## Step 4: Search Strata

Use whichever search commands are available in the local Strata CLI.

Preferred agent context search shape:

```bash
npm run strata -- --agent --json agent context search "SEARCH_QUERY"
```

Alternative direct CLI shape:

```bash
strata-ai --agent --json agent context search "SEARCH_QUERY"
```

Possible generic note search shapes:

```bash
npm run strata -- notes search "SEARCH_QUERY"
```

```bash
strata-ai notes search "SEARCH_QUERY"
```

Possible tag search shapes:

```bash
npm run strata -- notes search --tag TAG_NAME
```

```bash
strata-ai notes search --tag TAG_NAME
```

Possible list/filter shape:

```bash
npm run strata -- notes list --tag TAG_NAME --limit 10
```

Search by session tag:

```bash
npm run strata -- notes search --tag session-SESSION_ID
```

Search by exact session ID as text:

```bash
npm run strata -- notes search "SESSION_ID"
```

Search by RunLedger ID:

```bash
npm run strata -- notes search "RUNLEDGER_ID"
```

Use the actual commands supported by the local Strata repo. Do not invent success.

---

## Step 5: Read Relevant Notes

After searching, read only the most relevant notes.

Prioritize:

1. exact session/chat/run matches
2. canonical notes
3. decision notes
4. recent summaries
5. TODO notes
6. capture notes
7. rollups
8. older handoff notes

Prefer 3–10 notes unless the user asks for a deep sweep.

Possible read command shapes:

```bash
npm run strata -- notes read NOTE_ID
```

```bash
strata-ai notes read NOTE_ID
```

or:

```bash
npm run strata -- --agent --json agent context read NOTE_ID
```

If note IDs are unavailable but file paths are returned, read the relevant files through the filesystem.

Do not read unrelated notes just because they share a generic tag.

---

## Step 6: Group Notes by Session When Useful

When multiple notes are found, group them by session if possible.

Useful grouping fields:

* Session ID
* Parent Session
* Related Sessions
* Chat ID
* Run ID
* RunLedger ID
* Project
* Repo
* Date
* Tags

Example grouping:

```text
Session: cinch-mcp-validation-20260618-2045
- Summary note
- Capture note
- TODO note

Related session: cinch-rag-workflow-20260617-1910
- Decision note
- Validation note
```

If the user asks for “past three chats,” return the three most relevant recent session groups, not necessarily the three newest individual notes.

---

## Step 7: Filter and Rank Context

Rank notes by:

* exact session/chat/run match
* direct relevance to the current task
* project/repo match
* tag match
* title match
* note type
* recency
* canonical status
* decision importance
* whether the note includes validation or next steps

Ignore notes that are:

* unrelated
* obsolete
* duplicates
* vague
* superseded by a canonical note
* too generic to help

If notes conflict, include the conflict in the context packet.

---

## Step 8: Produce a Strata Context Packet

Before doing the main task, produce a compact context packet.

Use this format:

```markdown
# Strata Context Packet

## Query Used

- Project:
- Repo:
- Tags:
- Keywords:
- Date range:
- Session ID:
- Chat ID:
- Run ID:
- RunLedger ID:
- Search commands:

## Session Matches

1. Session:
   - Notes found:
   - Why it matters:
   - Key details:

2. Related Session:
   - Notes found:
   - Why it matters:
   - Key details:

If no session-specific matches were found, write:

No exact session matches were found.

## Most Relevant Notes

1. NOTE_TITLE_OR_ID
   - Type:
   - Session ID:
   - Why it matters:
   - Key details:

2. NOTE_TITLE_OR_ID
   - Type:
   - Session ID:
   - Why it matters:
   - Key details:

## Key Background

- Important context point 1
- Important context point 2
- Important context point 3

## Decisions to Respect

- Decision:
- Source:
- Session:
- Impact:

If no decisions were found, write:

No prior decisions were found.

## Constraints / Gotchas

- Constraint or gotcha 1
- Constraint or gotcha 2

## Open Follow-ups

- [ ] Follow-up item 1
- [ ] Follow-up item 2

## Recommended Starting Point

The agent should start by:

1. First action
2. Second action
3. Third action

## Confidence

High / Medium / Low

Reason:
```

Do not include huge raw note bodies. Summarize.

---

## Compact Context Packet

For small tasks, use this shorter format:

```markdown
# Strata Context Packet

## Found

- Note:
- Note:
- Note:

## Session Context

- Session ID:
- Related sessions:
- Recent matching sessions:

## Useful Context

- Key point 1
- Key point 2
- Key point 3

## Watch Outs

- Gotcha 1
- Gotcha 2

## Start Here

- First recommended action

## Confidence

High / Medium / Low
```

---

## Handling No Results

If no useful Strata notes are found, say:

```text
I searched Strata for the requested project/tags/keywords/session IDs but did not find useful prior context.
```

Then proceed with the task using the user’s current instructions.

Do not block the task unless the user explicitly required Strata context.

---

## Handling Too Many Results

If many notes match, narrow by:

* exact session ID
* exact chat ID
* exact run ID
* exact RunLedger ID
* project name
* repo name
* tags
* note type
* recent date
* canonical notes
* decisions
* user-provided keywords

If still too many, summarize clusters instead of individual notes.

Example:

```text
I found many Strata notes for Kujo, so I narrowed to PackWrite + agent pack + recent decision/summary notes.
```

---

## Handling Recent Sessions / “Past Three Chats”

If the user asks for recent sessions or past chats, search by project and tags first.

Then group by:

* Session ID
* Chat ID
* Run ID
* Date
* Project
* Tags

Return the three most relevant recent session groups.

Do not assume “chat” means an official platform chat ID. In Strata, a “chat” may be represented by a local Strata Session ID.

Example response:

```markdown
## Recent Matching Sessions

1. udc-saas-paperclip-20260618-01
   - Focus: Paperclip architecture and decoupled UDC SaaS
   - Notes: 3
   - Most useful context: leadership alignment, static-site onboarding, headless plugin direction

2. udc-saas-market-20260617-02
   - Focus: market opportunity and leadership one-sheet
   - Notes: 2
   - Most useful context: 7M install base, SaaS expansion, cross-platform positioning

3. udc-saas-agent-build-20260616-01
   - Focus: initial agent build prompt and repo constraints
   - Notes: 1
   - Most useful context: build path, research-only repos, implementation boundaries
```

---

## Handling Conflicts

If notes conflict, include the conflict clearly.

Example:

```text
Conflict found:
- Older note says PackWrite should write directly into /agent.
- Newer note says PackWrite should generate a reviewable pack first, then copy into /agent after validation.

Recommended interpretation:
Prefer the newer note unless the canonical PackWrite note says otherwise.
```

Do not silently choose one unless the priority is obvious.

---

## What to Extract From Notes

Look for:

* decisions
* rationale
* architecture direction
* commands that worked
* commands that failed
* current blockers
* completed work
* validation status
* next steps
* known risks
* file paths
* repo paths
* branch names
* issue/card IDs
* tool-specific instructions
* naming conventions
* workflow preferences
* user preferences relevant to the project
* session IDs
* related session IDs
* chat IDs
* run IDs
* RunLedger IDs
* model/runtime notes

---

## What Not to Include in the Context Packet

Do not include:

* secrets
* credentials
* raw private content
* full transcripts
* private chain-of-thought
* irrelevant personal details
* large logs
* full diffs
* stale notes without warning
* unverified claims as facts

---

## Optional Deep Research Mode

Use this only when the user explicitly asks for a deeper Strata sweep.

Deep mode may include:

* multiple tag searches
* multiple keyword searches
* multiple session ID searches
* reading 10–25 notes
* grouping findings by session
* grouping findings by project or repo
* building a larger rollup
* identifying stale or conflicting notes
* recommending a canonical note update

Deep mode should still summarize, not dump.

---

## Optional Output as File

If the user asks for a saved local context packet, create:

```text
./handoff/strata-context-YYYY-MM-DD-topic.md
```

or:

```text
/tmp/strata-context-YYYY-MM-DD-topic.md
```

Do not save a new Strata note unless the user asks. This skill is read-first. Use the Strata Save Skill if a new note should be saved.

---

## Final Response to User

After gathering context, respond with the Strata Context Packet and then continue the task if requested.

If context was found:

```text
I gathered relevant Strata context and built a context packet. I’ll use this as background for the task.
```

If no context was found:

```text
I searched Strata for the requested project/tags/keywords/session IDs but did not find useful prior context. I’ll proceed from the current instructions.
```

If Strata was unavailable:

```text
I could not reach Strata, so I could not gather prior project context from it. I’ll proceed from the current instructions unless you want me to stop here.
```

---

## Agent Checklist

Before starting the main task:

* [ ] Did I read the Strata Context skill?
* [ ] Did I confirm Strata/local access?
* [ ] Did I identify project/repo/tags/keywords?
* [ ] Did I identify session ID, chat ID, run ID, or RunLedger ID if provided?
* [ ] Did I search exact identifiers first?
* [ ] Did I search Strata with at least one precise query?
* [ ] Did I widen the search if results were weak?
* [ ] Did I read only relevant notes?
* [ ] Did I prioritize exact session matches, canonical notes, decision notes, and recent summaries?
* [ ] Did I group notes by session if useful?
* [ ] Did I identify decisions to respect?
* [ ] Did I identify constraints and gotchas?
* [ ] Did I identify open follow-ups?
* [ ] Did I produce a compact context packet?
* [ ] Did I avoid secrets and private reasoning?
* [ ] Did I clearly state confidence?

---

## Default Behavior

When the user says:

```text
Use the Strata Context skill.
```

Do this:

1. Read this skill.
2. Check Strata availability.
3. Extract project, repo, tags, keywords, and session/chat/run IDs from the user’s request.
4. Search exact session/chat/run identifiers first if provided.
5. Search Strata with precise and broad queries.
6. Read the most relevant notes.
7. Group by session if useful.
8. Build a compact context packet.
9. Use that packet as task background.
10. Continue the task.
11. At the end, use the Strata Save Skill if the user asks or if the task produced durable context.

Default output:

```text
Strata Context Packet
```

Default search strategy:

```text
1 exact identifier search, if available
1 precise project/topic search
1 broader project/tag search
tag searches if tags were provided
read 3–10 relevant notes
group by session when useful
summarize findings
```
