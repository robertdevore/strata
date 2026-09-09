# Strata 0.9.1 local macOS test build

This unsigned Intel x64 DMG fixes the sidebar and settings regressions reported after 0.9.0. It uses the same user-data directory and schema 13; no database migration is added.

- Remove the project dropdown above Pinned.
- Keep the search focus border inside the sidebar.
- Show 50 notes initially across projects, revealing 50 more at a time on scroll and fetching additional server pages automatically.
- Style history-cleanup controls consistently with Settings.
- Align all Sidebar checkboxes at the right with padding and vertical centering.
- Move selected-note history out of the note list into a styled footer panel, using the shared chevron icon and local date formatting.
- Make the Projects heading collapse/expand all project groups; show its chevron always and its add button on hover or keyboard focus.

The running installed app was confirmed through its open file handles to use `~/Library/Application Support/strata/data/strata.sqlite`. Read-only API retrieval confirmed the existing projects and thousands of notes. The sparse Notes list was a UI filtering/pagination defect, not evidence of a different database. No destructive repair or direct database mutation was performed.

Verification uses synthetic libraries: 334 offline tests, production build and real Electron UI checks. A 160-note project fixture verifies initial 50 rows and scrolling beyond 100, Projects collapse, footer history and styled backup controls. All five Sidebar checkbox centers align with their rows and have 19px right padding.

Quit Strata before replacing the app from the DMG. Keep your backup and previous installer. This build is unsigned/unnotarized and is for local testing; see [release guidance](RELEASING.md) for public distribution.
