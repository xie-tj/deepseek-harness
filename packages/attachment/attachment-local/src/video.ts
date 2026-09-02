/** Container-header validation for local native video attachments. */

import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { VideoMediaType } from '@deepseek-ai/dsh-attachment'

/** Header metadata proven by the admission parser. */
export interface DetectedVideo {
  mediaType: VideoMediaType
}

function ascii(data: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...data.subarray(start, start + length))
}

function isMp4(data: Uint8Array): boolean {
  if (data.byteLength < 12 || ascii(data, 4, 4) !== 'ftyp') return false
  const brand = ascii(data, 8, 4)
  return ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'hvc1', 'hev1'].includes(brand)
}

function isQuickTime(data: Uint8Array): boolean {
  return data.byteLength >= 12 && ascii(data, 4, 4) === 'ftyp' && ascii(data, 8, 4) === 'qt  '
}

function isWebm(data: Uint8Array): boolean {
  return data.byteLength >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3
}

/**
 * Verify a supported container header and its declared media type.
 * @param data - complete encoded video bytes.
 * @param declaredMediaType - media type supplied by the upload boundary.
 * @returns the accepted media type.
 * @throws an AttachmentError when the bytes are empty, malformed, or mismatched.
 */
export function detectVideo(data: Uint8Array, declaredMediaType: VideoMediaType): DetectedVideo {
  if (data.byteLength === 0) throw new AttachmentError('Video is empty.', 'INVALID_VIDEO_BASE64')
  const detected: VideoMediaType | undefined = isQuickTime(data)
    ? 'video/quicktime'
    : isMp4(data)
      ? 'video/mp4'
      : isWebm(data)
        ? 'video/webm'
        : undefined
  if (detected === undefined) throw new AttachmentError('Unsupported or malformed video data.', 'INVALID_VIDEO_BASE64')
  if (detected !== declaredMediaType) throw new AttachmentError('Declared video type does not match its bytes.', 'UNSUPPORTED_VIDEO_TYPE')
  return { mediaType: detected }
}
