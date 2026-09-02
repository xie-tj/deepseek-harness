import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import AttachmentStore, {
  AttachmentError,
  AttachmentId,
  ImageVariantId,
  isImageAdmissionError,
  isVideoAdmissionError,
  type ImageAttachmentRef,
  type ImageMediaType,
  type ImageRequestPolicy,
  type RequestImageAttachment,
  type SaveImageAttachment,
  type StoredImageAttachment,
  type SaveVideoAttachment,
  type StoredVideoAttachment,
  type VideoAttachmentRef,
} from '../src/index.ts'

const LIMITS = {
  maxImageBytes: 4,
  maxImagesPerMessage: 2,
  maxMessageImageBytes: 5,
  maxImagePixels: 4,
  maxImageDimension: 2000,
  mediaTypes: ['image/png'] as const,
}

class RecordingStore extends AttachmentStore {
  readonly imageLimits = LIMITS
  readonly calls: string[] = []
  rejectValidationAt: number | undefined
  rejectSaveAt: number | undefined

  async validateImage(input: SaveImageAttachment): Promise<void> {
    const value = input.data[0] ?? 0
    this.calls.push(`validate:${value}`)
    if (value === this.rejectValidationAt) throw new Error(`invalid:${value}`)
  }

  async saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    const value = input.data[0] ?? 0
    this.calls.push(`save:${value}`)
    if (value === this.rejectSaveAt) throw new Error(`write:${value}`)
    return {
      attachmentId: AttachmentId(`sha256:${String(value).padStart(64, '0')}`),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
      ...input.name === undefined ? {} : { name: input.name },
    }
  }

  readImage(_ref: ImageAttachmentRef): Promise<StoredImageAttachment> {
    throw new Error('not used')
  }

  override readImageRequest(
    ref: ImageAttachmentRef,
    _policy: ImageRequestPolicy,
  ): Promise<RequestImageAttachment> {
    this.calls.push(`request:${ref.name}`)
    return Promise.resolve({
      variantId: ImageVariantId(`sha256:${String(ref.bytes).padStart(64, '0')}`),
      attachment: ref,
      data: Uint8Array.of(ref.bytes),
      mediaType: ref.mediaType,
      bytes: 1,
      width: ref.width,
      height: ref.height,
      depth: 'uchar',
      space: 'srgb',
      hasAlpha: false,
    })
  }
}

class UnsupportedProjectionStore extends AttachmentStore {
  readonly imageLimits = LIMITS

  validateImage(): Promise<void> {
    return Promise.resolve()
  }

  saveImage(): Promise<ImageAttachmentRef> {
    throw new Error('not used')
  }

  readImage(): Promise<StoredImageAttachment> {
    throw new Error('not used')
  }
}

const VIDEO_LIMITS = {
  maxVideoBytes: 4,
  maxVideosPerMessage: 2,
  maxMessageVideoBytes: 5,
  mediaTypes: ['video/mp4'] as const,
}

class VideoRecordingStore extends RecordingStore {
  override readonly videoLimits = VIDEO_LIMITS

  override async validateVideo(input: SaveVideoAttachment): Promise<void> {
    this.calls.push('validate-video:' + String(input.data[0] ?? 0))
  }

  override async saveVideo(input: SaveVideoAttachment): Promise<VideoAttachmentRef> {
    const value = input.data[0] ?? 0
    this.calls.push('save-video:' + String(value))
    return {
      attachmentId: AttachmentId('sha256:' + String(value).padStart(64, '0')),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
    }
  }

  override readVideo(_ref: VideoAttachmentRef): Promise<StoredVideoAttachment> {
    throw new Error('not used')
  }
}

function image(value: number, mediaType: ImageMediaType = 'image/png'): SaveImageAttachment {
  return { data: Uint8Array.of(value), mediaType, name: `${value}.png` }
}

describe('AttachmentStore.saveImages', () => {
  it('validates the complete batch before saving in input order', async () => {
    const store = new RecordingStore(new Context())

    const refs = await store.saveImages([image(1), image(2)])

    expect(store.calls).toEqual(['validate:1', 'validate:2', 'save:1', 'save:2'])
    expect(refs.map(ref => ref.name)).toEqual(['1.png', '2.png'])
  })

  it('rejects count, aggregate bytes, and deployment media types before validation', async () => {
    const store = new RecordingStore(new Context())

    await expect(store.saveImages([image(1), image(2), image(3)]))
      .rejects.toMatchObject({ code: 'TOO_MANY_IMAGES' })
    await expect(store.saveImages([
      { data: Uint8Array.of(1, 2, 3), mediaType: 'image/png' },
      { data: Uint8Array.of(4, 5, 6), mediaType: 'image/png' },
    ])).rejects.toMatchObject({ code: 'IMAGES_TOO_LARGE' })
    await expect(store.saveImages([image(1, 'image/jpeg')]))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_TYPE' })
    expect(store.calls).toEqual([])
  })

  it('starts no writes when any member fails validation', async () => {
    const store = new RecordingStore(new Context())
    store.rejectValidationAt = 2

    await expect(store.saveImages([image(1), image(2)]))
      .rejects.toThrow('invalid:2')
    expect(store.calls).toEqual(['validate:1', 'validate:2'])
  })

  it('returns no partial references when storage fails after an earlier commit', async () => {
    const store = new RecordingStore(new Context())
    store.rejectSaveAt = 2

    await expect(store.saveImages([image(1), image(2)]))
      .rejects.toThrow('write:2')
    expect(store.calls).toEqual(['validate:1', 'validate:2', 'save:1', 'save:2'])
  })
})

describe('AttachmentStore.readImageRequest', () => {
  it('reports unsupported request projection while preserving cancellation', async () => {
    const store = new UnsupportedProjectionStore(new Context())
    const ref = await new RecordingStore(new Context()).saveImage(image(1))
    await expect(store.readImageRequest(ref, { maxPixels: 1, maxBytes: 1 }))
      .rejects.toMatchObject({ code: 'ATTACHMENT_PROJECTION_UNSUPPORTED' })
    const controller = new AbortController()
    const reason = new Error('cancel unsupported projection')
    controller.abort(reason)
    expect(() => store.readImageRequest(ref, { maxPixels: 1, maxBytes: 1 }, controller.signal)).toThrow(reason)
  })
})

describe('AttachmentStore.saveVideos', () => {
  it('validates count, bytes, media type, and then preserves order', async () => {
    const store = new VideoRecordingStore(new Context())
    const refs = await store.saveVideos([
      { data: Uint8Array.of(1), mediaType: 'video/mp4', name: 'one.mp4' },
      { data: Uint8Array.of(2), mediaType: 'video/mp4', name: 'two.mp4' },
    ])
    expect(store.calls).toEqual(['validate-video:1', 'validate-video:2', 'save-video:1', 'save-video:2'])
    expect(refs.map(ref => ref.mediaType)).toEqual(['video/mp4', 'video/mp4'])
    await expect(store.saveVideos([
      { data: Uint8Array.of(1), mediaType: 'video/mp4' },
      { data: Uint8Array.of(2), mediaType: 'video/mp4' },
      { data: Uint8Array.of(3), mediaType: 'video/mp4' },
    ])).rejects.toMatchObject({ code: 'TOO_MANY_VIDEOS' })
    await expect(store.saveVideos([
      { data: Uint8Array.of(1, 2, 3), mediaType: 'video/mp4' },
      { data: Uint8Array.of(4, 5, 6), mediaType: 'video/mp4' },
    ])).rejects.toMatchObject({ code: 'VIDEOS_TOO_LARGE' })
  })
})

describe('isVideoAdmissionError', () => {
  it('recognizes caller-correctable video failures', () => {
    expect(isVideoAdmissionError(new AttachmentError('bad', 'INVALID_VIDEO_BASE64'))).toBe(true)
    expect(isVideoAdmissionError(new AttachmentError('too many', 'TOO_MANY_VIDEOS'))).toBe(true)
    expect(isVideoAdmissionError(new AttachmentError('corrupt', 'ATTACHMENT_CORRUPT'))).toBe(false)
  })
})

describe('isImageAdmissionError', () => {
  it('separates caller-correctable image admission failures from storage faults', () => {
    expect(isImageAdmissionError(new AttachmentError('bad bytes', 'INVALID_IMAGE'))).toBe(true)
    expect(isImageAdmissionError(new AttachmentError('bad base64', 'INVALID_IMAGE_BASE64'))).toBe(true)
    expect(isImageAdmissionError(new AttachmentError('too many', 'TOO_MANY_IMAGES'))).toBe(true)
    expect(isImageAdmissionError(Object.assign(new Error('foreign policy error'), { code: 'IMAGE_TOO_LARGE' }))).toBe(true)
    expect(isImageAdmissionError(new AttachmentError('corrupt object', 'ATTACHMENT_CORRUPT'))).toBe(false)
    expect(isImageAdmissionError(new AttachmentError('disk failed', 'ATTACHMENT_WRITE_FAILED'))).toBe(false)
    expect(isImageAdmissionError(new Error('unknown failure'))).toBe(false)
  })
})
