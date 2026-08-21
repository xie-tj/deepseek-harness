import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'

interface ClientBundleDefinition {
  id: string
  factory(require: (specifier: string) => unknown): unknown
}

interface RevisionProps {
  messageId: never
  seq: number
  text: string
  latestDirectHuman: boolean
  textOnly: boolean
  unavailable: boolean
  revise: (messageId: never, seq: number, text: string) => Promise<void>
  t: (key: string, values?: Record<string, string>) => string
}

let bundleDefinition: ClientBundleDefinition | undefined
;(globalThis as { window?: unknown }).window = {
  __ModuleLoader__: {
    load(definition: ClientBundleDefinition) {
      bundleDefinition = definition
    },
  },
}
const builtClientPath = join(process.cwd(), 'packages/session-query/session-message-revision/lib/client.js')
await import(pathToFileURL(builtClientPath).href)
if (bundleDefinition === undefined) throw new Error('built client entry did not register with ModuleLoader')
const revisionModule = bundleDefinition.factory((specifier) => {
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime') return ReactJsxRuntime
  // Baseline external: the pencil trigger icon renders through shared primitives.
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
    return { IconEditOutline16: () => null }
  }
  throw new Error(`unexpected client bundle import: ${specifier}`)
}) as { apply: (ctx: Context) => void; inject: readonly string[] }

const SID = 'loader-revision-session' as never

const root = await mkdtemp(join(tmpdir(), 'dsh-message-revision-loader-'))
let context: Context | undefined
try {
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, '- name: dsh-test-message-revision-client\n')

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  await context.plugin(SlotRegistry).await()
  context.slots.register({
    name: 'root',
    children: {
      'conversation.chat.user-actions': { kind: 'list', scope: 'session' },
      'conversation.chat.steering-user-actions': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  context.provide('locale', new LocaleRuntime(context))
  context.provide('sessions', {
    binding: () => ({ session: { reviseLatestUser: async () => ({ ok: true as const }) } }),
  })

  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== 'dsh-test-message-revision-client') throw new Error(`unexpected Loader import: ${specifier}`)
      return revisionModule
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()

  const entry = context.slots.entries('conversation.chat.user-actions' as never)[0]
  const MessageRevisionAction = entry?.component as React.ComponentType<RevisionProps> | undefined
  if (entry === undefined || MessageRevisionAction === undefined || entry.inject === undefined) {
    throw new Error('message revision entry did not activate through Loader')
  }
  const steeringEntry = context.slots.entries('conversation.chat.steering-user-actions' as never)[0]
  if (steeringEntry?.component !== MessageRevisionAction) {
    throw new Error('steering-seat revision entry did not activate through Loader')
  }
  const face = entry.inject(SID) as { revise: (messageId: never, seq: number, text: string) => Promise<void> }
  const markup = renderToStaticMarkup(React.createElement(MessageRevisionAction, {
    messageId: 'loader-message' as never,
    seq: 4,
    text: 'loader text',
    latestDirectHuman: true,
    textOnly: true,
    unavailable: false,
    ...face,
    t: context.locale.bind('message-revision') as (key: string, values?: Record<string, string>) => string,
  }))
  if (!markup.includes('aria-label="编辑最新消息"')) throw new Error('Edit action was not rendered')
  const slots = context.slots
  const t = context.locale.bind('message-revision')
  if (t('edit') !== '编辑') throw new Error('locale namespace was not registered')
  await context.fiber.dispose()
  if (slots.entries('conversation.chat.user-actions' as never).length !== 0) {
    throw new Error('Edit action registration survived plugin disposal')
  }
  if (slots.entries('conversation.chat.steering-user-actions' as never).length !== 0) {
    throw new Error('steering-seat Edit action registration survived plugin disposal')
  }
  if (t('edit') !== 'edit') throw new Error('locale namespace survived plugin disposal')
  process.stdout.write('loader-composition-ok\n')
} finally {
  await context?.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
