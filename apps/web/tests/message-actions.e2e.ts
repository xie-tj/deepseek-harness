// Web e2e scenario: message IconActions + clocks. Cold-seeds a deterministic
// completed-turn-tail fork case (zero model calls) and pins the settled
// conversation aria after the footers are focus-revealed — the surface package
// jsdom tests cannot substitute for (docs/testing.md snapshot rule).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, parseSeedFixture, renderSeedFixture, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/message-actions', import.meta.url))
// Borrowed read-only: this scenario needs any settled user+assistant pair, not
// a new recording (workspace-management / sidebar-scrollbar pattern).
const SEED = fileURLToPath(new URL('./snapshots/seeded-history/seed.jsonl', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const FORK_EXPECTED = join(SNAPSHOT_DIR, 'fork.expected.md')
const EDIT_EXPECTED = join(SNAPSHOT_DIR, 'edit.expected.md')
const EDIT_SUBMIT_EXPECTED = join(SNAPSHOT_DIR, 'edit-submit.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'message-actions-web-e2e'

const PROMPT = 'Use the read tool twice in one assistant message: read a.txt and b.txt. Then reply with the single word DONE and stop.'
const MID_TURN_TEXT = 'I will read both files before answering.'
const SECOND_PROMPT = 'Now give the final answer.'

/**
 * Adapt the borrowed recording into response -> tools -> interrupted Think,
 * followed by one ordinary completed response. The first response keeps
 * copy/clock but is not a legal branch point; the second is the real turn tail.
 * @param raw - Recorded seeded-history JSONL.
 * @returns A contiguous, closed two-turn fixture.
 */
function completedTailFixture(raw: string): string {
  const decoded = parseSeedFixture(raw)
  const kept = decoded.events.filter(event => event.seq < 101).map((event) => {
    if (event.type === 'assistant/message' && event.seq === 64) {
      const data = event.data as unknown as { content?: unknown[] }
      const content = data.content
      if (!Array.isArray(content)) throw new Error('borrowed step-one assistant message has no content')
      return {
        ...event,
        data: { ...data, content: [...content.slice(0, 1), { type: 'text', text: MID_TURN_TEXT }, ...content.slice(1)] },
      }
    }
    return event
  })
  let seq = kept.length
  let time = (kept.at(-1)?.time ?? -1) + 1
  const at = (event: Record<string, unknown>): { seq: number; time: number } & Record<string, unknown> => ({
    ...event,
    seq: seq++,
    time: time++,
  })
  const tail = [
    at({ type: 'step/end', data: { turn: 1, step: 2 } }),
    at({ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } }),
    at({ type: 'turn/start', data: { turn: 2, trigger: { kind: 'message', source: { kind: 'user', rpcId: '{{rpcId}}' } } } }),
    at({ type: 'user/message', data: { content: [{ type: 'text', text: SECOND_PROMPT }], source: { kind: 'user', rpcId: '{{rpcId}}' } }, surfaceOp: 'append' }),
    at({ type: 'step/start', data: { turn: 2, step: 1 } }),
    at({ type: 'assistant/message', data: { turn: 2, step: 1, content: [{ type: 'text', text: 'DONE' }], provenance: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, sourceEventSeqs: [], surfaceOp: 'append' }),
    at({ type: 'step/end', data: { turn: 2, step: 1 } }),
    at({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } }),
  ]
  return renderSeedFixture(decoded.headerLine, [...kept, ...tail])
}

describe('web e2e: message IconActions and clocks on settled history', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const sessionCwd = join(scaffold.workspaceCwd, 'workspace')
    await mkdir(sessionCwd, { recursive: true })
    await writeFile(join(sessionCwd, 'a.txt'), 'alpha\n')
    await writeFile(join(sessionCwd, 'b.txt'), 'beta\n')
    const raw = completedTailFixture(await readFile(SEED, 'utf8'))
    expect(fixtureUserPrompts(raw), 'adapted seed must carry both prompts').toEqual([PROMPT, SECOND_PROMPT])
    await seedSession(scaffold, raw, SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('enables branch only on the completed transcript tail', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-actions'))
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await expect.poll(() => page.getByText(MID_TURN_TEXT, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => page.getByText('DONE', { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    // Focus-reveal the footers (hover:hover keeps them opacity-hidden until
    // hover/focus-within). Branch renders only under assistant answers — user
    // bubbles carry none — and only a completed transcript tail enables it.
    const copyButtons = page.getByRole('button', { name: 'Copy' })
    await expect.poll(() => copyButtons.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(4)
    await copyButtons.first().focus()
    const branchButtons = page.getByRole('button', { name: 'Branch into a new conversation' })
    await expect.poll(() => branchButtons.count(), { timeout: 5_000 }).toBe(2)
    await expect.poll(
      () => branchButtons.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-disabled'))),
      { timeout: 5_000 },
    ).toEqual(['true', null])
    await branchButtons.first().focus()
    await expect.poll(() => page.getByRole('tooltip').textContent(), { timeout: 5_000 })
      .toBe('Available only on the last message of a completed turn')
    await expect.poll(() => page.getByRole('button', { name: 'Edit latest message' }).count(), { timeout: 5_000 }).toBe(1)
  }, 60_000)

  it.skipIf(MODE === 'record')('matches the conversation aria golden with IconActions and clocks', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-actions-aria'))
    await page.getByRole('button', { name: /^Select model, current/ })
      .waitFor({ timeout: 10_000 })
    await page.getByText(/Cache hit \d+%/u).first().waitFor({ timeout: 10_000 })
    // Keep a footer focused so opacity-hidden actions stay in the a11y tree
    // as an active/focused control during the capture.
    await page.getByRole('button', { name: 'Copy' }).first().focus()
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
  })

  it.skipIf(MODE === 'record')('opens the latest-user editor and supports Shift+Enter plus Escape', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-revision-edit'))
    const edit = page.getByRole('button', { name: 'Edit latest message' })
    await expect.poll(() => edit.count(), { timeout: 5_000 }).toBe(1)
    await edit.click()
    const editor = page.getByRole('textbox', { name: 'Edit latest message' })
    await expect.poll(() => editor.count(), { timeout: 5_000 }).toBe(1)
    await editor.fill('Edited latest prompt')
    await editor.press('Shift+Enter')
    expect(await editor.inputValue()).toBe('Edited latest prompt\n')
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EDIT_EXPECTED, snapshot, MODE)
    await editor.press('Escape')
    await expect.poll(() => editor.count(), { timeout: 5_000 }).toBe(0)
  })

  it.skipIf(MODE === 'record')('forks through the settled-message and session-row actions', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-fork'))
    // The last message action belongs to the completed second-turn assistant.
    await page.getByRole('button', { name: 'Branch into a new conversation' }).last().click()
    await expect.poll(
      () => scaffold.ctx.agents.list().find(agent => agent.session.header.parentSession === SessionId(SEED_ID)),
      { timeout: 15_000 },
    ).toBeDefined()
    await expect.poll(
      () => page.locator('[role="treeitem"]').count(),
      { timeout: 10_000 },
    ).toBe(3)
    await expect.poll(
      () => page.locator('[role="treeitem"][aria-selected="true"]').count(),
      { timeout: 10_000 },
    ).toBe(1)
    // The row action owns a distinct ui-workspace injection from the message
    // action above, so exercise both through the loaded app before capture.
    const sourceRow = page.locator('[role="treeitem"][aria-selected="true"]')
    const rowBox = await sourceRow.boundingBox()
    if (rowBox === null) throw new Error('fork source row has no layout box')
    const actionButton = sourceRow.locator('button[aria-label^="Session actions for "]')
    await sourceRow.hover({ position: { x: rowBox.width - 16, y: rowBox.height / 2 } })
    await expect.poll(() => actionButton.isVisible(), { timeout: 2_000 }).toBe(true)
    const buttonBox = await actionButton.boundingBox()
    if (buttonBox === null) throw new Error('fork source row action has no layout box')
    await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2)
    await page.getByRole('menuitem', { name: 'Fork session' }).click()
    await expect.poll(
      () => scaffold.ctx.agents.list().filter(agent => agent.session.header.parentSession !== undefined).length,
      { timeout: 15_000 },
    ).toBe(2)
    await expect.poll(
      () => page.locator('[role="treeitem"]').count(),
      { timeout: 10_000 },
    ).toBe(4)
    await expect.poll(
      () => page.locator('[role="treeitem"][aria-selected="true"]').count(),
      { timeout: 10_000 },
    ).toBe(1)
    // The child row is published before its inherited title rename settles;
    // wait for that second RPC projection before freezing the ARIA tree.
    await expect.poll(
      () => page.locator('[role="treeitem"][aria-selected="true"]').textContent(),
      { timeout: 10_000 },
    ).toContain('Use the read tool twice (2)')
    const tree = await captureStableAria(
      page,
      '[role="tree"][aria-label="Sessions"]',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(FORK_EXPECTED, tree, MODE)
  })

  // Runs after the fork scenario on purpose: admission hides the settled
  // assistant tail the fork actions branch from, and it lands on the selected
  // fork child (same inherited transcript), so both scenarios stay deterministic.
  it.skipIf(MODE === 'record')('submits the revision with Enter and replaces the active transcript', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-revision-submit'))
    const edit = page.getByRole('button', { name: 'Edit latest message' })
    await expect.poll(() => edit.count(), { timeout: 5_000 }).toBe(1)
    await edit.click()
    const editor = page.getByRole('textbox', { name: 'Edit latest message' })
    await expect.poll(() => editor.count(), { timeout: 5_000 }).toBe(1)
    await editor.fill('Edited latest prompt')
    await editor.press('Enter')
    // Admission closes the editor and queues the replacement turn; the
    // route-only adapter then fails loud because this scenario declares no
    // replay fixture, so the revised transcript settles deterministically.
    await expect.poll(() => editor.count(), { timeout: 5_000 }).toBe(0)
    await expect.poll(
      () => page.getByText('Now give the final answer.', { exact: true }).count(),
      { timeout: 20_000 },
    ).toBe(0)
    await expect.poll(
      () => page.getByText('Edited latest prompt', { exact: true }).count(),
      { timeout: 10_000 },
    ).toBe(1)
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EDIT_SUBMIT_EXPECTED, snapshot, MODE)
  })

  it.skipIf(MODE === 'record')('kept a closed fixture inventory', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['edit-submit.expected.md', 'edit.expected.md', 'fork.expected.md', 'ui.expected.md'])
  })
})
