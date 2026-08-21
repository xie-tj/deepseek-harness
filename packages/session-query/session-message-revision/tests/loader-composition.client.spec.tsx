import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

/** The child boots the test-only cordis.yml outside Vitest's invariant setup. */
describe('message revision through a real Loader composition', () => {
  it('loads the browser plugin from cordis.yml and renders its Edit action', async () => {
    const helper = join(process.cwd(), 'packages/session-query/session-message-revision/tests/loader-composition-process.client.ts')
    const cssLoader = join(process.cwd(), 'packages/session-query/session-message-revision/tests/css-loader.mjs')
    const result = await run(process.execPath, ['--experimental-loader', cssLoader, '--import', 'tsx/esm', helper], { cwd: process.cwd() })
    expect(result.stdout).toContain('loader-composition-ok')
  })
})
