/** Durable attachment storage seam (`ctx.attachments`). @module @deepseek-ai/dsh-attachment */

import { Context, Service } from '@deepseek-ai/cordis'
import { AttachmentError } from './error.ts'
import type {
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageRequestPolicy,
  RequestImageAttachment,
  SaveImageAttachment,
  StoredImageAttachment,
  SaveVideoAttachment,
  StoredVideoAttachment,
  VideoAttachmentLimits,
  VideoAttachmentRef,
} from './types.ts'

export { AttachmentId, ImageVariantId } from './brand.ts'
export { AttachmentError, isImageAdmissionError, isVideoAdmissionError } from './error.ts'
export type { AttachmentErrorCode, ImageAdmissionErrorCode, VideoAdmissionErrorCode } from './error.ts'
export { admitEncodedImages } from './admission.ts'
export type {
  AttachmentId as AttachmentIdType,
  EncodedImageAttachment,
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageRequestPolicy,
  ImageMediaType,
  RequestImageAttachment,
  SaveImageAttachment,
  StoredImageAttachment,
  SaveVideoAttachment,
  StoredVideoAttachment,
  VideoAttachmentLimits,
  VideoAttachmentRef,
  VideoMediaType,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    attachments: AttachmentStore
  }
}

const NO_VIDEO_LIMITS: VideoAttachmentLimits = Object.freeze({
  maxVideoBytes: 0,
  maxVideosPerMessage: 0,
  maxMessageVideoBytes: 0,
  mediaTypes: Object.freeze([]),
})

/** Immutable binary attachment service. Implementations validate bytes before publishing a reference. */
export abstract class AttachmentStore extends Service {
  /** Empty by default so image-only stores remain valid until they opt into video. */
  readonly videoLimits: VideoAttachmentLimits = NO_VIDEO_LIMITS

  constructor(ctx: Context) {
    super(ctx, 'attachments')
  }

  /** Deployment-resolved image policy used by authoritative and fast-path validation. */
  abstract readonly imageLimits: ImageAttachmentLimits

  /**
   * Validate one image without persisting it.
   * Batch callers validate every member before saving any member.
   * @param input - encoded bytes, declared media type, and optional display name.
   * @returns completion after the encoded raster has been fully decoded.
   */
  abstract validateImage(input: SaveImageAttachment): Promise<void>

  /**
   * Validate one ordered image batch before committing any member.
   * Validation failures start no writes; storage failures return no partial
   * references, although already published content-addressed objects may stay
   * unreachable until a future retention policy collects them.
   * @param inputs - encoded images in their owning message order.
   * @returns durable references in the exact input order.
   */
  protected validateImageBatch(inputs: readonly SaveImageAttachment[]): void {
    const { maxImagesPerMessage, maxMessageImageBytes, mediaTypes } = this.imageLimits
    if (inputs.length > maxImagesPerMessage) {
      throw new AttachmentError('Image batch exceeds the configured image-count limit.', 'TOO_MANY_IMAGES')
    }
    const totalBytes = inputs.reduce((sum, input) => sum + input.data.byteLength, 0)
    if (totalBytes > maxMessageImageBytes) {
      throw new AttachmentError('Image batch exceeds the configured aggregate image-byte limit.', 'IMAGES_TOO_LARGE')
    }
    for (const input of inputs) {
      if (!mediaTypes.includes(input.mediaType)) {
        throw new AttachmentError(`Image type ${input.mediaType} is not accepted by this deployment.`, 'UNSUPPORTED_IMAGE_TYPE')
      }
    }
  }

  /**
   * Validate and durably commit one ordered image batch.
   * @param inputs - encoded images in owning-message order.
   * @returns durable normalized attachment references in the same order after every member succeeds.
   */
  async saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]> {
    this.validateImageBatch(inputs)
    for (const input of inputs) await this.validateImage(input)

    const refs: ImageAttachmentRef[] = []
    for (const input of inputs) refs.push(await this.saveImage(input))
    return refs
  }

  /**
   * Validate and durably commit one image before its owning session event is appended.
   * The returned reference describes the persisted normalized image. When
   * normalization reduces the raster, its `originalDimensions` records the
   * orientation-applied input dimensions.
   * @param input - encoded bytes, declared media type, and optional display name.
   * @returns the durable content-addressed normalized image reference.
   */
  abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>

  /**
   * Read one image and verify that bytes still match the recorded reference.
   * @param ref - durable reference from the session log.
   * @param signal - optional cancellation for backend read and verification work.
   * @returns the verified bytes and normalized attachment reference.
   * @throws the signal reason when aborted, or a storage error when verification fails.
   */
  abstract readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>

  /**
   * Generate or read one deterministic model-request version from the stored normalized image.
   * @param ref - durable provider-independent normalized attachment reference.
   * @param policy - exact route pixel and encoded-byte budget.
   * @param signal - optional cancellation.
   * @returns request bytes and the cache/upload identity covering every transform input.
   */
  readImageRequest(
    ref: ImageAttachmentRef,
    policy: ImageRequestPolicy,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment> {
    signal?.throwIfAborted()
    void ref
    void policy
    return Promise.reject(new AttachmentError(
      'The mounted attachment provider cannot derive model-request images.',
      'ATTACHMENT_PROJECTION_UNSUPPORTED',
    ))
  }

  /**
   * Reject video when the concrete store has not opted into video persistence.
   * @param _input - validated candidate ignored by the image-only default.
   * @returns nothing; rejection is the unsupported-video signal.
   */
  async validateVideo(_input: SaveVideoAttachment): Promise<void> {
    throw new AttachmentError('Video input is not supported by this attachment backend.', 'UNSUPPORTED_VIDEO_TYPE')
  }

  /**
   * Validate one ordered video batch before committing any member.
   * @param inputs - caller-ordered candidates checked against the configured video limits.
   * @returns durable references in input order; no reference exists unless every member validates.
   */
  async saveVideos(inputs: readonly SaveVideoAttachment[]): Promise<readonly VideoAttachmentRef[]> {
    const { maxVideosPerMessage, maxMessageVideoBytes, mediaTypes } = this.videoLimits
    if (inputs.length > maxVideosPerMessage) {
      throw new AttachmentError('Video batch exceeds the configured video-count limit.', 'TOO_MANY_VIDEOS')
    }
    const totalBytes = inputs.reduce((sum, input) => sum + input.data.byteLength, 0)
    if (totalBytes > maxMessageVideoBytes) {
      throw new AttachmentError('Video batch exceeds the configured aggregate video-byte limit.', 'VIDEOS_TOO_LARGE')
    }
    for (const input of inputs) {
      if (!mediaTypes.includes(input.mediaType)) {
        throw new AttachmentError(`Video type ${input.mediaType} is not accepted by this deployment.`, 'UNSUPPORTED_VIDEO_TYPE')
      }
      if (input.data.byteLength > this.videoLimits.maxVideoBytes) {
        throw new AttachmentError('Video exceeds the configured byte limit.', 'VIDEO_TOO_LARGE')
      }
    }
    for (const input of inputs) await this.validateVideo(input)

    const refs: VideoAttachmentRef[] = []
    for (const input of inputs) refs.push(await this.saveVideo(input))
    return refs
  }

  /**
   * Validate and durably commit one video; concrete stores opt in by overriding this method.
   * @param _input - validated candidate ignored by the image-only default.
   * @returns the committed durable reference.
   */
  async saveVideo(_input: SaveVideoAttachment): Promise<VideoAttachmentRef> {
    throw new AttachmentError('Video input is not supported by this attachment backend.', 'UNSUPPORTED_VIDEO_TYPE')
  }

  /**
   * Read one verified video; concrete stores opt in by overriding this method.
   * @param _ref - durable reference ignored by the image-only default.
   * @param _signal - optional cancellation ignored by the default.
   * @returns the stored bytes with their verified metadata.
   */
  async readVideo(_ref: VideoAttachmentRef, _signal?: AbortSignal): Promise<StoredVideoAttachment> {
    throw new AttachmentError('Video input is not supported by this attachment backend.', 'UNSUPPORTED_VIDEO_TYPE')
  }
}

export default AttachmentStore
