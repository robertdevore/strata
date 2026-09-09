# Strata 0.9.2 project browsing fixes

This unsigned Intel x64 test DMG corrects three follow-up issues from 0.9.1:

- Projects uses the same trailing chevron position as the other sidebar headings. The add button sits to its left and appears on hover or keyboard focus.
- Project Grid cards constrain long note titles, headings and action buttons. Long note pills truncate inside the card.
- Expanded sidebar projects load their own six-note server pages instead of relying on the main list's first page. View more follows the project cursor; selection retrieves the full note. Loading, empty filtered results and retry states are distinct. Query changes and closing projects invalidate late responses, while cached drafts and newer revisions are preserved.

The database and schema remain unchanged. No repair, migration or modification of existing note contents is needed.

Verification includes project paging/draft/stale-response regressions, the source suite, real Electron desktop checks and a fixture with an older project absent from the global page plus oversized unbroken titles. The visual fixture measures chevron alignment, hover visibility, card bounds, six-to-twelve note paging and full-body navigation.

Quit the installed Strata app before replacing it. Public signed/notarized distribution remains governed by [RELEASING.md](RELEASING.md).
