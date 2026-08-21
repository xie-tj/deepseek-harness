// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ChatConversationViewNode, ConversationSnapshot, SessionId, UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en } from '../src/client/locales.ts'
import { SteeringMessageNodeView, UserMessageNodeView } from '../src/client/chat/MessageItem.tsx'
import type { ChatNodeViewProps } from '../src/client/contract/slots.ts'
import type { PropsRenderSlots, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'

type MessageId = UserMessageNode['messageId']
const tEn = makeTranslate(en, commonEn)
const SID = 'slot-session' as SessionId

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('user-message action slot', () => {
  it('publishes the latest direct-human owner data to additive actions', () => {
    const node = {
      key: 'user-7',
      kind: 'user',
      data: {
        kind: 'user', messageId: 'message-7' as MessageId, seq: 7, time: 7_000,
        content: [{ type: 'text', text: 'original text' }], source: { kind: 'user' },
      },
    } as unknown as ChatConversationViewNode
    const snapshot = {
      sessionId: SID,
      chat: {
        order: [node.key],
        nodes: { get: (key: string) => key === node.key ? node : undefined },
        latestUserMessageId: 'message-7',
      },
      running: false,
      pending: [],
      queue: [],
      openState: 'open',
      removed: false,
    } as unknown as ConversationSnapshot
    const renderSlot = vi.fn(() => null)
    const SessionProvider: SessionProviderComponent = ({ children }) => children(SID)
    const props = {
      node,
      useSession: bindSnapshotSelector({ getSnapshot: () => snapshot, subscribe: () => () => {} }),
      SessionProvider,
      sessionId: SID,
      loadImage: vi.fn(async () => 'data:image/png;base64,AA=='),
      renderMessageImages: () => null,
      renderMessageVideos: () => null,
      renderSlot,
      t: tEn,
    } as unknown as ChatNodeViewProps<'user'> & PropsRenderSlots<'conversation.chat.user-actions'>

    render(<UserMessageNodeView {...props} />)

    expect(renderSlot).toHaveBeenCalledWith('conversation.chat.user-actions', {
      messageId: 'message-7',
      seq: 7,
      text: 'original text',
      latestDirectHuman: true,
      textOnly: true,
      unavailable: false,
    })
  })

  it('publishes the same owner data for the latest claimed steering message', () => {
    const node = {
      key: 'steering-9',
      kind: 'steering',
      data: {
        kind: 'steering', messageId: 'message-9' as MessageId, seq: 9, time: 9_000,
        content: [{ type: 'text', text: 'steered text' }], source: { kind: 'user' },
      },
    } as unknown as ChatConversationViewNode
    const snapshot = {
      sessionId: SID,
      chat: {
        order: [node.key],
        nodes: { get: (key: string) => key === node.key ? node : undefined },
        latestUserMessageId: 'message-9',
      },
      running: false,
      pending: [],
      queue: [],
      openState: 'open',
      removed: false,
    } as unknown as ConversationSnapshot
    const renderSlot = vi.fn(() => null)
    const SessionProvider: SessionProviderComponent = ({ children }) => children(SID)
    const props = {
      node,
      useSession: bindSnapshotSelector({ getSnapshot: () => snapshot, subscribe: () => () => {} }),
      SessionProvider,
      sessionId: SID,
      loadImage: vi.fn(async () => 'data:image/png;base64,AA=='),
      renderMessageImages: () => null,
      renderMessageVideos: () => null,
      renderSlot,
      t: tEn,
    } as unknown as ChatNodeViewProps<'steering'> & PropsRenderSlots<'conversation.chat.steering-user-actions'>

    render(<SteeringMessageNodeView {...props} />)

    expect(renderSlot).toHaveBeenCalledWith('conversation.chat.steering-user-actions', {
      messageId: 'message-9',
      seq: 9,
      text: 'steered text',
      latestDirectHuman: true,
      textOnly: true,
      unavailable: false,
    })
  })
})
