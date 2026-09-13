# Strata 0.9.3 installer testing

- Note revision history is an icon at the bottom right of each note panel, including split panes. Restore continues to enforce the reviewed revision and protect dirty drafts.
- Projects section add and collapse controls appear on hover or keyboard focus, with the add icon to the left of the aligned chevron.
- Project View more text aligns with note card text.
- September 13 rebuild: Pinned, Notes and Tags chevrons match Projects hover/focus visibility. A stable scrollbar gutter keeps section headings aligned when the notes list overflows.

Build: `release/0.9.3/Strata-0.9.3.dmg` (unsigned, unnotarized Intel x64). Quit Strata before replacing the installed application. Existing library location and database schema are unchanged.

Verification uses offline fixtures and isolated temporary desktop libraries. Run source formatting, lint, tests, production build and `node scripts/desktop-verify.mjs`; verify and mount the DMG and inspect the packaged UI before installation testing.

The September 13 rebuild keeps version 0.9.3 and includes source commit `b4aa1ef`. The previous installer is preserved in `release/0.9.3/previous-2026-09-09/`. The current installer checksum is in `release/0.9.3/SHA256SUMS.txt`.
