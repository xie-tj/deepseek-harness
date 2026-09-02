import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MediaLightbox.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface MediaLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

/**
 * Document-level original-media preview opened by clicking a thumbnail.
 * Closes on Escape, backdrop press, or the close control, and restores focus
 * to the opener on unmount. Rendered through a body portal: an opener inside
 * a transformed or filtered ancestor would otherwise trap the fixed backdrop
 * in that ancestor's box instead of covering the viewport.
 *
 * @param props.src - the original media URL.
 * @param props.alt - the media's accessible name.
 * @param props.video - render a playing video control instead of an image.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @returns the modal preview dialog.
 */
export function MediaLightbox({ src, alt, video = false, labels, onClose }: {
  src: string
  alt: string
  video?: boolean
  labels: MediaLightboxLabels
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      className={css.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
    >
      <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
      {video
        ? // Autoplay with sound mirrors a player opened deliberately; muted
      // would defeat the point of opening the original clip.
        <video className={css.media} src={src} controls autoPlay aria-label={alt} />
        : <img className={css.media} src={src} alt={alt} />}
      <button ref={closeRef} type="button" className={css.close} aria-label={labels.close} onClick={onClose}>
        <IconCloseOutline16 size={16} />
      </button>
    </div>,
    document.body,
  )
}
