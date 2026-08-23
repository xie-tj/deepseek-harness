// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en } from '../src/client/locales.ts'
import { MessageRevisionAction } from '../src/client/MessageRevisionAction.tsx'
import type { MessageRevisionActionProps } from '../src/client/slots.ts'

const tEn = makeTranslate(en, commonEn)
const base = {
  messageId: 'message-7' as MessageId,
  seq: 7,
  text: 'original text',
  latestDirectHuman: true,
  textOnly: true,
  unavailable: false,
  revise: vi.fn(async (_messageId: MessageId, _seq: number, _text: string) => {}),
  t: tEn,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderAction(overrides: Partial<typeof base> = {}) {
  return render(<MessageRevisionAction {...{ ...base, ...overrides } as unknown as MessageRevisionActionProps} />)
}

describe('latest direct-human message revision', () => {
  it('opens with the original text and resends on Enter', async () => {
    const revise = vi.fn(async () => {})
    const view = renderAction({ revise })

    fireEvent.click(view.getByRole('button', { name: 'Edit latest message' }))
    const editor = view.getByRole('textbox', { name: 'Edit latest message' }) as HTMLTextAreaElement
    expect(view.queryByRole('note')).toBeNull()
    expect(editor.value).toBe('original text')
    fireEvent.change(editor, { target: { value: 'edited text' } })
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: false })

    await waitFor(() => { expect(revise).toHaveBeenCalledWith('message-7', 7, 'edited text') })
    await waitFor(() => { expect(view.queryByRole('textbox', { name: 'Edit latest message' })).toBeNull() })
  })

  it('keeps Shift+Enter as a newline gesture and Escape cancels', () => {
    const revise = vi.fn(async () => {})
    const view = renderAction({ revise })

    fireEvent.click(view.getByRole('button', { name: 'Edit latest message' }))
    const editor = view.getByRole('textbox', { name: 'Edit latest message' }) as HTMLTextAreaElement
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true })
    expect(revise).not.toHaveBeenCalled()
    fireEvent.change(editor, { target: { value: 'line one\nline two' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(revise).not.toHaveBeenCalled()
    expect(view.queryByRole('textbox', { name: 'Edit latest message' })).toBeNull()
  })

  it('retains the editor and error when resend fails', async () => {
    const revise = vi.fn(async () => { throw new Error('stale target') })
    const view = renderAction({ revise })

    fireEvent.click(view.getByRole('button', { name: 'Edit latest message' }))
    const editor = view.getByRole('textbox', { name: 'Edit latest message' }) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'retry text' } })
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: false })

    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('Resend failed: stale target') })
    expect((view.getByRole('textbox', { name: 'Edit latest message' }) as HTMLTextAreaElement).value).toBe('retry text')
  })

  it('keeps the action unavailable while the session cannot revise', () => {
    const view = renderAction({ unavailable: true })
    const action = view.getByRole('button', { name: 'Edit latest message' })
    expect(action.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(action)
    expect(view.queryByRole('textbox', { name: 'Edit latest message' })).toBeNull()
  })

  it('does not render for older or non-text messages', () => {
    const view = renderAction({ latestDirectHuman: false })
    expect(view.container.firstChild).toBeNull()
    view.unmount()
    const nonText = renderAction({ textOnly: false })
    expect(nonText.container.firstChild).toBeNull()
  })
})
