import { useCallback, useEffect, useState } from 'react'
import type { VideoAttachmentRef } from '@deepseek-ai/dsh-attachment'
import css from './MessageVideo.module.css'

/** Loads a session-authorized durable video URL. */
export type VideoLoader = (attachment: VideoAttachmentRef) => Promise<string>

/** Message-video strings the owner resolves from its own locale namespace. */
export interface MessageVideoLabels {
  /** Fallback accessible name for an unnamed video. */
  video: string
  /** Loading placeholder shown until bytes resolve. */
  loading: string
  /** Retry-control label shown when the load fails. */
  loadFailed: string
}

/**
 * Inline history player with retryable loading: a loaded video renders its
 * native controls directly (click-to-open adds nothing a player doesn't
 * already do), bounded by the bubble width and never upscaled past the
 * encoded size's layout box.
 *
 * @param props.attachment - the durable video reference to load.
 * @param props.load - session-authorized URL loader.
 * @param props.labels - resolved strings (loading, retry).
 * @returns the bounded player, or the retry control on failure.
 */
export function MessageVideo({ attachment, load, labels }: {
  attachment: VideoAttachmentRef
  load: VideoLoader
  labels: MessageVideoLabels
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  // Retry re-arms the one load effect below, so every attempt — first load or
  // retry — runs under the same liveness guard and the same reset.
  const [attempt, setAttempt] = useState(0)
  const request = useCallback(() => { setAttempt(a => a + 1) }, [])

  useEffect(() => {
    let live = true
    setError(false)
    setSrc(null)
    void load(attachment).then((url) => { if (live) setSrc(url) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, load, attempt])

  if (error) return <button type="button" className={css.error} onClick={request}>{labels.loadFailed}</button>
  return (
    <div className={css.frame}>
      {src === null
        ? <span className={css.loading}>{labels.loading}</span>
        : <video className={css.player} src={src} controls preload="metadata" aria-label={attachment.name ?? labels.video} />}
    </div>
  )
}

/** Wrapping video group shared by user history rows: each video keeps its
 * natural aspect inside the bubble-width column (mirrors the image gallery's
 * alignment contract). */
export function VideoGallery({ videos, load, align, labels }: {
  videos: readonly { attachment: VideoAttachmentRef }[]
  load: VideoLoader
  align: 'start' | 'end'
  labels: MessageVideoLabels
}) {
  if (videos.length === 0) return null
  return (
    <div className={css.gallery} data-align={align}>
      {videos.map((video, index) => (
        <MessageVideo key={`${video.attachment.attachmentId}:${index}`} {...video} load={load} labels={labels} />
      ))}
    </div>
  )
}
