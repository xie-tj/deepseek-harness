import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { UserActionOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Injected Session-face operation for one browser Session scope. */
export interface MessageRevisionInjected {
  revise: (messageId: MessageId, seq: number, text: string) => Promise<void>
}

/** Props for the additive user-message revision action (settled and steering seats share the owner currency). */
export type MessageRevisionActionProps =
  & PropsRuntime<'conversation.chat.user-actions' | 'conversation.chat.steering-user-actions'>
  & InjectFace<MessageRevisionInjected>
  & PropsLocale<'message-revision'>

/** Keep the owner contract visible to type-only consumers of this package. */
export type { UserActionOwnerProps }
