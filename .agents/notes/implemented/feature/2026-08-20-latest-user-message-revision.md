# Agent Note: Latest direct-human message revision

Status: implemented

English | [中文](2026-08-20-latest-user-message-revision.zh.md)

## Problem

The Web conversation needs to let a user correct the latest direct-human text and resend it without mutating the append-only session log. The active transcript, model history, search results, and exports must stop exposing the superseded tail while durable audit data and external side effects remain intact.

## Decision

The Host accepts a revision only for the visible latest direct-human message whose existing content is non-empty text, identified by its exact `messageId` and event `seq`. The agent must be idle with no queued work or pending interaction, and the replacement must contain text blocks only. Admission and queue/audit publication run under agent maintenance; a failed audit append removes the queued replacement. The Host queues a new `UserMessage` carrying an internal replace intent that cites every current surface event from the target through the tail.

The agent loop strips that internal intent before appending the replacement `user/message`. The durable event uses `surfaceOp: { op: 'replace', start, end }` and `sourceEventSeqs`; the Host also appends an ignorable `session/revision` audit record. Current history and export projections remove the superseded range up to the admission boundary recorded by the audit event, while the raw append-only artifact retains it; lifecycle events of the replacement turn itself, appended after that boundary, survive projection. Revisions preserve session identity and do not roll back tool calls, file changes, or other side effects.

The browser renders an Edit action only beside the latest direct-human text message, whether settled or claimed as steering — both classifications are direct-human input and the Host revision API accepts either. Its inline editor keeps the composer draft separate, sends on Enter, inserts a newline on Shift+Enter, cancels on Escape, and retains the editor text on a rejected or failed resend. While editing, the editor renders as a bubble-styled card that replaces the settled bubble and row chrome in place. Non-text messages do not receive the action; unavailable runtime states keep it visible but disabled.

The action is an independently loadable `@deepseek-ai/dsh-session-message-revision` Client plugin. `client-ui-conversation` owns the additive `conversation.chat.user-actions` Slot (mirrored by a steering-twin seat for claimed messages) and passes the owner message data; the plugin calls the scoped `SessionBinding.session.reviseLatestUser` face and does not replace the built-in message renderer.

## Alternatives considered

**Mutate or delete the original event.** Rejected because durable sessions require append-only history and replay must retain the original evidence.

**Add a separate mutable conversation-history store.** Rejected because model history, transcript history, search, and exports would need independent synchronization; the existing surface replacement protocol already provides replayable projection semantics.

**Allow revisions while work is running or queued.** Rejected because the replacement range and agent turn admission would race with active inbox and interaction state; callers receive a typed unavailable error instead.

**Attempt to undo external side effects.** Rejected because tool, filesystem, and network effects are not transactionally reversible; the UI reports that editing changes future conversation only.

## Consequences

Every accepted revision creates new sequence numbers and a new message identity while preserving the session id and folded title; replacement messages cancel any in-flight or pending title generation derived from the superseded tail and do not schedule automatic title regeneration. Repeated revisions are supported: each replacement cites the current surface tail, so earlier rewritten tails disappear from current projections without being removed from storage. Usage records remain part of the durable log and are not retroactively adjusted.

Older runtimes can skip the audit event through its `ignorable` marker; the replacement surface event remains the model-visible reconstruction record.

## Testing

Host RPC tests cover acceptance, durable audit data, current-history projection, stale rejection, non-text or blank existing targets, and queue rollback when audit publication fails. Agent-loop tests verify that internal metadata is removed and the durable surface intent is normalized. Session-title tests preserve the folded title across replacement and prove an in-flight provider call is cancelled instead of appending a stale title. History and export projection tests pin production event ordering — audit, then replacement-turn lifecycle records, then the replacement message — so the deletion endpoint cannot regress into swallowing new uncited events. Runtime, core UI, and standalone-plugin tests cover incremental latest-user derivation, paging gaps, the Session-face call, the inline Enter resend action, the additive Slot, Loader composition, disposal, and the unavailable running state. The GUI lane and host/client typechecks cover the assembled contract.
