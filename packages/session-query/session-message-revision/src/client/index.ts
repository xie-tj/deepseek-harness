/** Browser entry for the optional latest-user-message revision action. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh } from './locales.ts'
import { MessageRevisionAction } from './MessageRevisionAction.tsx'
import type { MessageRevisionInjected } from './slots.ts'

const NS = 'message-revision'

/** Required services: the Web slot registry, session runtime, and dictionaries. */
export const inject = ['slots', 'sessions', 'locale']

/** The additive user-action seats the action contributes to (settled + steering rows). */
const SEATS = ['conversation.chat.user-actions', 'conversation.chat.steering-user-actions'] as const

/**
 * Register the latest-user-message action beside every direct-human message
 * row: one contribution per seat, because each seat is declared by a different
 * keyed node renderer and collapses with its own declaration lifetime.
 * @param ctx - browser context carrying the slot and session services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-message-revision: dictionaries')

  for (const seat of SEATS) {
    ctx.slots.inject(seat, () => ctx.slots.register({
      name: seat,
      id: 'session-message-revision',
      order: 10,
      locale: NS,
      inject: (sessionId: SessionId): MessageRevisionInjected => ({
        revise: async (messageId: MessageId, seq: number, text: string): Promise<void> => {
          const binding = ctx.sessions.binding(sessionId)
          if (binding === undefined) throw new Error(`session "${sessionId}" is not available`)
          const result = await binding.session.reviseLatestUser(messageId, seq, [{ type: 'text', text }])
          if (!result.ok) throw new Error(`session.reviseLatestUser failed: ${result.error.code}: ${result.error.message}`)
        },
      }),
    }, MessageRevisionAction))
  }
}
