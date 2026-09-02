import type { MessageVideosProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { VideoGallery } from '../MessageVideo.tsx'
import { messageVideoLabels } from './labels.ts'

/** Historical message-video slot entry. */
export function MessageVideos({ videos, loadVideo, align, t }: MessageVideosProps) {
  return <VideoGallery videos={videos} load={loadVideo} align={align} labels={messageVideoLabels(t)} />
}
