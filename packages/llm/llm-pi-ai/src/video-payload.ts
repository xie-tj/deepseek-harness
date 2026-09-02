/**
 * Replace context markers with provider-native video content after pi-ai builds
 * the request body. The installed pi-ai API only models text and images, while
 * its payload hook lets the harness preserve the provider wire extension.
 * @module dsh-llm-pi-ai/video-payload
 */

import type { PiAiVideoPayload } from './context.ts'

const RESPONSES_APIS = new Set(['openai-responses', 'openai-codex-responses'])

interface VideoWireBlock {
  type: 'input_video' | 'video_url'
  video_url: string | { url: string }
}

function dataUrl(video: PiAiVideoPayload): string {
  return 'data:' + video.mediaType + ';base64,' + video.data
}

function wireBlock(video: PiAiVideoPayload, api: string): VideoWireBlock {
  const url = dataUrl(video)
  return RESPONSES_APIS.has(api)
    ? { type: 'input_video', video_url: url }
    : { type: 'video_url', video_url: { url } }
}

function splitText(text: string, videos: ReadonlyMap<string, PiAiVideoPayload>, api: string): unknown[] | undefined {
  const parts: unknown[] = []
  const textType = RESPONSES_APIS.has(api) ? 'input_text' : 'text'
  let cursor = 0
  let found = false
  while (cursor < text.length) {
    let nextMarker: PiAiVideoPayload | undefined
    let nextIndex = text.length
    for (const video of videos.values()) {
      const index = text.indexOf(video.marker, cursor)
      if (index >= 0 && index < nextIndex) {
        nextIndex = index
        nextMarker = video
      }
    }
    if (nextMarker === undefined) break
    found = true
    if (nextIndex > cursor) parts.push({ type: textType, text: text.slice(cursor, nextIndex) })
    parts.push(wireBlock(nextMarker, api))
    cursor = nextIndex + nextMarker.marker.length
  }
  if (!found) return undefined
  if (cursor < text.length) parts.push({ type: textType, text: text.slice(cursor) })
  return parts
}

function isContentParts(value: unknown[]): boolean {
  return value.every(item => typeof item === 'object' && item !== null && 'type' in item)
}

function transform(value: unknown, videos: ReadonlyMap<string, PiAiVideoPayload>, api: string): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const transformed = transform(item, videos, api)
      return Array.isArray(transformed) && isContentParts(transformed) ? transformed : [transformed]
    })
  }
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  if ((record.type === 'input_text' || record.type === 'text') && typeof record.text === 'string') {
    const parts = splitText(record.text, videos, api)
    if (parts !== undefined) return parts
  }
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) output[key] = transform(child, videos, api)
  return output
}

/**
 * Replace all video markers in a pi-ai payload with provider wire blocks.
 * @param payload - request body delivered by pi-ai's `onPayload` hook.
 * @param videos - marker-to-bytes map collected during context conversion.
 * @param api - pi-ai protocol identifier.
 * @returns a cloned request body containing native video blocks.
 */
export function injectVideoPayload(payload: unknown, videos: ReadonlyMap<string, PiAiVideoPayload>, api: string): unknown {
  return videos.size === 0 ? payload : transform(payload, videos, api)
}
