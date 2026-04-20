import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'

type Props = {
  frames: Frame[]
  currentIndex?: number
  onSelect?: (index: number) => void
  maxVisible?: number
}

export function Timeline({ frames, currentIndex, onSelect, maxVisible = 40 }: Props) {
  if (frames.length === 0) return null
  const start = Math.max(0, frames.length - maxVisible)
  const slice = frames.slice(start)

  return (
    <div className="timeline">
      {slice.map((f, i) => {
        const realIdx = start + i
        const isCurrent = currentIndex === realIdx || (currentIndex === undefined && realIdx === frames.length - 1)
        return (
          <img
            key={f.id}
            src={framePublicUrl(f.thumb_path)}
            className={`timeline-thumb${isCurrent ? ' current' : ''}`}
            onClick={() => onSelect?.(realIdx)}
            loading="lazy"
            alt=""
          />
        )
      })}
    </div>
  )
}
