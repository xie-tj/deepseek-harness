import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { RpcRequest } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

const sid = (id: string): SessionId => id as SessionId
let nextRpc = 0

function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`revision-${String(nextRpc++)}`), payload }
}

async function context(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  return ctx
}

function agentFor(session: Session, ctx: Context): Agent & { captured?: ReturnType<typeof createUserMessage>; removed?: number } {
  const agent = {
    id: session.id,
    session,
    status: 'idle' as const,
    ctx,
    inbox: {
      hasPending: false,
      remove: () => {
        agent.removed = (agent.removed ?? 0) + 1
        return true
      },
    },
    runMaintenance: async <T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> => job(new AbortController().signal),
    followup(message: ReturnType<typeof createUserMessage>) {
      agent.captured = message
    },
  } as unknown as Agent & { captured?: ReturnType<typeof createUserMessage>; removed?: number }
  ctx.agents.register(agent)
  return agent
}

function seedTurn(session: Session): { user: ReturnType<typeof createUserMessage>; assistant: ReturnType<typeof createAssistantMessage> } {
  session.append('turn/start', { turn: 1 })
  const user = createUserMessage({ content: [{ type: 'text', text: 'old prompt' }], source: { kind: 'user' } })
  session.append('user/message', user, { surfaceOp: 'append' })
  const assistant = createAssistantMessage({
    content: [{ type: 'text', text: 'old answer' }],
    source: { provider: 'p', model: 'm' },
  })
  session.append('assistant/message', { turn: 1, step: 1, message: assistant }, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return { user, assistant }
}

const apiFor = (ctx: Context) => createApiProxy(ctx, {
  defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
  cwd: '/tmp',
})

describe('sessions.reviseLatestUser', () => {
  it('records a durable revision and replaces the current history projection', async () => {
    const ctx = await context()
    const session = ctx.sessions.create(sid('revision-ok'), { meta: { cwd: '/tmp' } })
    const { user } = seedTurn(session)
    const agent = agentFor(session, ctx)
    const api = apiFor(ctx)
    const response = await api.sessions.reviseLatestUser(request({
      sessionId: session.id,
      messageId: user.id,
      seq: session.events.find(event => event.type === 'user/message')?.seq ?? -1,
      content: [{ type: 'text', text: 'new prompt' }],
    }))
    expect(response.result.ok).toBe(true)
    expect(agent.captured).toBeDefined()
    const captured = agent.captured
    if (captured === undefined || captured.surfaceOp === undefined) return
    const audit = session.events.find(event => event.type === 'session/revision')
    expect(audit?.data).toMatchObject({ targetMessageId: user.id, replacementMessageId: captured.id })
    expect(audit?.ignorable).toBe(true)

    const historyBeforeReplacement = await api.sessions.history(request({ sessionId: session.id, maxMessages: 50 }))
    expect(historyBeforeReplacement.result.ok).toBe(true)
    if (historyBeforeReplacement.result.ok) {
      const types = historyBeforeReplacement.result.value.events.map(entry => entry.event.type)
      expect(types).not.toContain('session/revision')
      expect(JSON.stringify(historyBeforeReplacement.result.value.events)).not.toContain('old answer')
    }

    const { surfaceOp, ...durable } = captured
    session.append('user/message', durable, {
      surfaceOp: { op: 'replace', start: surfaceOp.start, end: surfaceOp.end },
      sourceEventSeqs: surfaceOp.sourceEventSeqs,
    })

    const history = await api.sessions.history(request({ sessionId: session.id, maxMessages: 50 }))
    expect(history.result.ok).toBe(true)
    if (history.result.ok) {
      const types = history.result.value.events.map(entry => entry.event.type)
      expect(types).toContain('user/message')
      expect(types).not.toContain('session/revision')
      expect(JSON.stringify(history.result.value.events)).toContain('new prompt')
      expect(JSON.stringify(history.result.value.events)).not.toContain('old answer')
    }
  })

  it('rejects a non-latest or stale target without adding an audit event', async () => {
    const ctx = await context()
    const session = ctx.sessions.create(sid('revision-stale'), { meta: { cwd: '/tmp' } })
    const { user } = seedTurn(session)
    const second = createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } })
    session.append('user/message', second, { surfaceOp: 'append' })
    agentFor(session, ctx)
    const response = await apiFor(ctx).sessions.reviseLatestUser(request({
      sessionId: session.id,
      messageId: user.id,
      seq: user.id.length,
      content: [{ type: 'text', text: 'ignored' }],
    }))
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) expect(response.result.error).toMatchObject({ code: 'message-revision-unavailable', details: { reason: 'stale' } })
    expect(session.events.some(event => event.type === 'session/revision')).toBe(false)
  })

  it('rejects an existing non-text or blank target even when the replacement is text', async () => {
    const cases = [
      [{ type: 'reasoning', text: 'hidden' }],
      [{ type: 'text', text: '   ' }],
    ] as const
    for (const [index, content] of cases.entries()) {
      const ctx = await context()
      const session = ctx.sessions.create(sid(`revision-content-${index}`), { meta: { cwd: '/tmp' } })
      session.append('turn/start', { turn: 1 })
      const user = createUserMessage({ content: content as never, source: { kind: 'user' } })
      session.append('user/message', user, { surfaceOp: 'append' })
      const agent = agentFor(session, ctx)
      const response = await apiFor(ctx).sessions.reviseLatestUser(request({
        sessionId: session.id,
        messageId: user.id,
        seq: session.events.find(event => event.type === 'user/message')?.seq ?? -1,
        content: [{ type: 'text', text: 'replacement' }],
      }))
      expect(response.result.ok).toBe(false)
      if (!response.result.ok) {
        expect(response.result.error).toMatchObject({
          code: 'message-revision-unavailable',
          details: { reason: 'unsupported-content' },
        })
      }
      expect(agent.captured).toBeUndefined()
      expect(session.events.some(event => event.type === 'session/revision')).toBe(false)
    }
  })

  it('rolls back the queued replacement when the audit append fails', async () => {
    const ctx = await context()
    const session = ctx.sessions.create(sid('revision-rollback'), { meta: { cwd: '/tmp' } })
    const { user } = seedTurn(session)
    const agent = agentFor(session, ctx)
    const append = session.append.bind(session)
    vi.spyOn(session, 'append').mockImplementation((type, data, ...rest) => {
      if (type === 'session/revision') throw new Error('audit unavailable')
      return append(type as never, data as never, ...(rest as never))
    })

    const response = await apiFor(ctx).sessions.reviseLatestUser(request({
      sessionId: session.id,
      messageId: user.id,
      seq: session.events.find(event => event.type === 'user/message')?.seq ?? -1,
      content: [{ type: 'text', text: 'replacement' }],
    }))

    expect(response.result.ok).toBe(false)
    expect(agent.captured).toBeDefined()
    expect(agent.removed).toBe(1)
    expect(session.events.some(event => event.type === 'session/revision')).toBe(false)
  })
})
