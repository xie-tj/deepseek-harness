# @deepseek-ai/dsh-session-message-revision

English | [中文](README.zh.md)

Optional Web action for editing and resending the latest direct-human text message. The package contributes an additive action beside the built-in Copy control and keeps the conversation renderer owned by `dsh-client-ui-conversation`.

## Features

- Shows Edit only for the latest direct-human message.
- Accepts text-only messages and preserves the original text until submission.
- Sends with Enter, inserts a newline with Shift+Enter, and cancels with Escape.
- Uses the existing Session revision API, which validates idle state, pending work, target identity, and surface replacement before queuing the new turn.
- Removes the superseded tail from active model history while append-only logs and durable side effects remain available to their owning projections.

## Composition

```yaml
- id: session-message-revision
  name: '@deepseek-ai/dsh-session-message-revision'
```

The standard Web composition includes this row, while a profile may omit it to remove the action. The package requires `dsh-client-ui-conversation`, `dsh-client-runtime`, `dsh-client-locale`, and the Session revision capability exposed by the runtime; it does not replace the shipped conversation node renderer.

## Install

Upgrade to a DSH release that includes this package and restart Web; do not add `github:xie-tj/dsh-easy-exit` to that profile because it duplicates the built-in row.

A custom profile may omit the composition row above to disable the action.

## Development

```sh
pnpm --filter @deepseek-ai/dsh-session-message-revision bundle
```

Run the GUI suite after changing the action or its Slot contract:

```sh
pnpm run test:gui
```

## Model Experience

### Latest-user-message revision

#### What the model sees

The replacement text is admitted as a new durable `user/message` event, and the paired `session/revision` record hides the superseded tail from the next active request; raw events and revision metadata stay append-only.

#### Token effect

The next request uses the edited message and the active surface after the replacement. Superseded messages and responses do not consume tokens in that request.

#### KV Cache effect

The request prefix after the edited message changes, so provider-side cache reuse depends on the new prompt prefix.

## Known Limitations and Deferred Work

- The package requires the Session revision capability and user-action Slot supplied by the corresponding `deepseek-harness` version; it cannot add those Host protocol primitives from the browser package alone.
- Only the latest direct-human text message is editable, settled or steered. Images, injected context, and older user messages are not editable.
- A running session, pending queue, pending interaction, closed session, or removed session keeps the action visible but unavailable.
