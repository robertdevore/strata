# AI edit permissions

AI is optional. It accesses knowledge through validated tools and the same transactional service used by other write interfaces.

| Mode | Behavior |
| --- | --- |
| Read Only | All read tools remain available. Every mutation, including project changes, is rejected with `READ_ONLY`. Mutation schemas are omitted from provider requests. |
| Confirm (default) | A valid write creates a pending proposal. Nothing is applied until a human approves it. |
| Auto Apply | Valid writes apply immediately and note changes record a revision. |

Unknown stored permission values fail closed. A provider cannot approve its own proposals or bypass the runtime permission check.

## Review and approval

Pending proposals appear in the conversation that created them. Expand **AI edit awaiting approval** to review text additions/removals, changed metadata, and the complete before/after states. Project proposals include their original identity or ordering. Preparing a proposal runs validation in a rolled-back transaction.

Choose **Approve edit** or **Reject**. Approval rechecks the original note revision and applies the change transactionally. If another writer changed the note, approval fails; reject the stale proposal and request a fresh one. Rejection changes no notes or projects. Changing chats cannot make a late response replace the current review state.

The text view shows a contiguous replacement region with shared leading/trailing lines omitted explicitly. The complete snapshots remain available for detailed review. Project rename/reorder approval checks a fingerprint of the original project state. Project deletion also checks every affected note ID/revision, including archived and deleted members, and shows the affected assignment count. Changes after review cause a conflict and leave the proposal pending. Older project proposals without this check must be rejected and recreated.

## Reports of changes

Strata generates mutation reports from executed operations: applied changes, unchanged notes, pending proposals, and failed attempts are distinct. Reports include saved note links/revisions and preserve partial results across provider fallback. A successful project operation cannot make a failed note update appear successful. These reports are saved in the conversation.

The editor stays on the current note while a response arrives. Follow a reported note link to open a changed note. No-op updates are reported without claiming a new revision. Ordinary retrieval answers keep the provider's explanation; a language-based warning remains only as an additional check when no mutation ran.

## History and recovery

Universal note history covers human, API, CLI and AI changes. Open **Note revision history** to inspect and intentionally restore a saved revision. Restoration checks the revision read during review, records a new revision, and refuses stale writes.

Legacy AI edit records remain available. Their revert operation checks whether later changes have occurred and refuses to overwrite them. Revert is not an unconditional rollback of newer work.

## Cancellation

**Stop AI response** cancels an in-flight provider request. Already-applied writes remain saved, and pending proposals can still be reviewed. Switching conversations or unmounting the editor cancels that view's pending request; cancellation is not a transaction spanning the entire conversation.

## Deleting a conversation

Deleting a chat rejects its pending proposals in the same database transaction and cancels chat requests attached to it, including work started from another view. Late tool calls cannot mutate the library or create another proposal for that deleted chat. Notes and revisions already saved remain available. A rejected proposal cannot later be approved.

## Automation

The loopback API requires authentication. Use the installed CLI or the current [CLI contract](../CLI.md) for note revisions, safe updates and restoration. Do not use the unauthenticated examples in historical design documents. Proposal approval is a human desktop action, not a model tool.
