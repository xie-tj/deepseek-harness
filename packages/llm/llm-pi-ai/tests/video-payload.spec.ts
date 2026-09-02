import { describe, expect, it } from 'vitest'
import { injectVideoPayload } from '../src/video-payload.ts'
import type { PiAiVideoPayload } from '../src/context.ts'

const video: PiAiVideoPayload = {
  marker: '__DSH_VIDEO_a__',
  mediaType: 'video/mp4',
  data: 'AQI=',
}

const videos = new Map([[video.marker, video]])

describe('native video payload injection', () => {
  it('replaces markers in a Responses input content list', () => {
    const payload = {
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'before __DSH_VIDEO_a__ after' }] }],
    }
    expect(injectVideoPayload(payload, videos, 'openai-codex-responses')).toEqual({
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'before ' },
        { type: 'input_video', video_url: 'data:video/mp4;base64,AQI=' },
        { type: 'input_text', text: ' after' },
      ] }],
    })
  })

  it('uses chat-completions video_url blocks for non-Responses APIs', () => {
    const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: '__DSH_VIDEO_a__' }] }] }
    expect(injectVideoPayload(payload, videos, 'openai-completions')).toEqual({
      messages: [{ role: 'user', content: [{ type: 'video_url', video_url: { url: 'data:video/mp4;base64,AQI=' } }] }],
    })
  })

  it('preserves payload identity when no videos were collected', () => {
    const payload = { input: 'text' }
    expect(injectVideoPayload(payload, new Map(), 'openai-responses')).toBe(payload)
  })
})
