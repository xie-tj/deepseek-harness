/** `message-revision` namespace dictionaries. */

/** Simplified Chinese dictionary. */
export const zh = {
  edit: '编辑',
  'edit.aria': '编辑最新消息',
  'edit.send': '发送',
  'edit.cancel': '取消',
  'edit.empty': '消息不能为空',
  'edit.failed': '重新发送失败：{message}',
  'edit.unavailable': '当前无法编辑消息',
  'edit.sideEffects': '编辑后，原消息之后的内容会从当前对话中隐藏并重新生成；已完成的工具、文件和网络副作用不会回滚。',
} satisfies Record<string, string>

/** Namespace key union. */
export type MessageRevisionKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  edit: 'Edit',
  'edit.aria': 'Edit latest message',
  'edit.send': 'Send',
  'edit.cancel': 'Cancel',
  'edit.empty': 'Message cannot be empty',
  'edit.failed': 'Resend failed: {message}',
  'edit.unavailable': 'Message editing is unavailable',
  'edit.sideEffects': 'Content after the original message is hidden from the active conversation and regenerated; completed tool, file, and network effects are not rolled back.',
} satisfies Record<MessageRevisionKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy for the latest-user-message revision action and editor. */
    'message-revision': MessageRevisionKey
  }
}
