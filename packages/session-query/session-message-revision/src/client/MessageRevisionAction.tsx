import { useEffect, useRef, useState } from 'react'
import { IconEditOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageRevisionActionProps } from './slots.ts'
import css from './MessageRevisionAction.module.css'

/** Latest-user-message action and inline editor. */
export function MessageRevisionAction({
  messageId, seq, text, latestDirectHuman, textOnly, unavailable, revise, t,
}: MessageRevisionActionProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!editing) return
    const textarea = textareaRef.current
    if (textarea === null) return
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [editing])

  if (!latestDirectHuman || !textOnly || text === '') return null

  const cancel = (): void => {
    if (submitting) return
    setDraft(text)
    setError(null)
    setEditing(false)
  }

  const submit = async (): Promise<void> => {
    if (unavailable || submitting) return
    if (draft.trim() === '') {
      setError(t('edit.empty'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await revise(messageId, seq, draft)
      setEditing(false)
    } catch (submitError: unknown) {
      setError(t('edit.failed', { message: submitError instanceof Error ? submitError.message : String(submitError) }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <span className={css.root} data-message-editing={editing || undefined}>
      {!editing && (
        <button
          type="button"
          className={css.action}
          aria-label={t('edit.aria')}
          aria-disabled={unavailable || undefined}
          data-unavailable={unavailable || undefined}
          title={unavailable ? t('edit.unavailable') : t('edit')}
          onClick={unavailable ? undefined : () => { setDraft(text); setError(null); setEditing(true) }}
        >
          <IconEditOutline16 />
        </button>
      )}
      {editing && (
        <span className={css.editor}>
          <textarea
            ref={textareaRef}
            className={css.input}
            aria-label={t('edit.aria')}
            value={draft}
            disabled={submitting}
            rows={2}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <span className={css.editorActions}>
            <button type="button" className={css.cancel} disabled={submitting} onClick={cancel}>
              {t('edit.cancel')}
            </button>
            <button type="button" className={css.send} disabled={submitting || unavailable} onClick={() => { void submit() }}>
              {t('edit.send')}
            </button>
          </span>
          {error !== null && <span className={css.error} role="alert">{error}</span>}
        </span>
      )}
    </span>
  )
}
