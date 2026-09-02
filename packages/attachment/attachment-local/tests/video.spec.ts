import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { VideoAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import { readVideoFile, saveVideoFile, validateVideoFile } from '../src/store.ts'

const MP4 = Uint8Array.from([
  0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
  0, 0, 0, 0,
])
const LIMITS: VideoAttachmentLimits = {
  maxVideoBytes: 64,
  maxVideosPerMessage: 2,
  maxMessageVideoBytes: 128,
  mediaTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
}
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('local video attachments', () => {
  it('validates a supported MP4 header and rejects mismatched media', async () => {
    await expect(validateVideoFile({ data: MP4, mediaType: 'video/mp4' }, LIMITS)).resolves.toBeUndefined()
    await expect(validateVideoFile({ data: MP4, mediaType: 'video/webm' }, LIMITS)).rejects.toMatchObject({ code: 'UNSUPPORTED_VIDEO_TYPE' })
    await expect(validateVideoFile({ data: Uint8Array.of(1), mediaType: 'video/mp4' }, LIMITS)).rejects.toMatchObject({ code: 'INVALID_VIDEO_BASE64' })
  })

  it('stores and verifies a video reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-video-'))
    roots.push(root)
    const ref = await saveVideoFile(root, { data: MP4, mediaType: 'video/mp4', name: '/tmp/demo.mp4' }, LIMITS)
    expect(ref.name).toBe('demo.mp4')
    await expect(readVideoFile(root, ref)).resolves.toMatchObject({ ref, data: MP4 })
  })
})
