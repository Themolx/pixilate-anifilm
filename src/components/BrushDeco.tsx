import { useMemo } from 'react'

const BASE = import.meta.env.BASE_URL

type Props = {
  count?: number
  minOpacity?: number
  maxOpacity?: number
}

export function BrushDeco({ count = 2, minOpacity = 0.18, maxOpacity = 0.38 }: Props) {
  const strokes = useMemo(() => {
    return Array.from({ length: count }, () => ({
      top: Math.random() * 75 - 5,
      left: Math.random() * 90 - 20,
      rot: (Math.random() - 0.5) * 90,
      scale: 0.55 + Math.random() * 0.9,
      opacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
      flip: Math.random() < 0.5 ? -1 : 1,
    }))
  }, [count, minOpacity, maxOpacity])

  return (
    <div
      aria-hidden
      className="brush-deco"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {strokes.map((s, i) => (
        <img
          key={i}
          src={`${BASE}brush.png`}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: '60%',
            transform: `rotate(${s.rot}deg) scale(${s.scale * s.flip}, ${s.scale})`,
            transformOrigin: 'center center',
            opacity: s.opacity,
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  )
}
