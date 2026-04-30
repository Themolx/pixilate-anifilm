import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { listAllFrames, subscribeFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'
import { Timeline } from './Timeline'
import { logger } from '../lib/logger'

const FPS_OPTIONS = [6, 8, 12, 24] as const

export function PlaybackView() {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Frame[]>([])
  const [loading, setLoading] = useState(true)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState<number>(12)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const f = await listAllFrames()
        if (!live) return
        setFrames(f)
      } catch (err) {
        logger.log('error', 'ERROR', `PlaybackView fetch failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  // Realtime append: new frames during playback get added live
  useEffect(() => {
    const unsub = subscribeFrames(ev => {
      setFrames(prev => {
        if (ev.type === 'INSERT') {
          if (prev.some(f => f.id === ev.frame.id)) return prev
          return [...prev, ev.frame].sort((a, b) => a.seq - b.seq)
        }
        return prev
          .map(f => (f.id === ev.frame.id ? ev.frame : f))
          .filter(f => !f.deleted_at)
      })
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!playing || frames.length === 0) return
    const interval = setInterval(() => {
      setIdx(prev => {
        const next = prev + 1
        if (next >= frames.length) {
          setPlaying(false)
          return frames.length - 1
        }
        return next
      })
    }, Math.round(1000 / fps))
    return () => clearInterval(interval)
  }, [playing, fps, frames.length])

  if (loading) return <div className="loading">Loading…</div>
  if (frames.length === 0) {
    return (
      <motion.div
        className="session-picker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1>No frames yet</h1>
        <button className="primary" onClick={() => navigate('/')}>Back to camera</button>
      </motion.div>
    )
  }

  const current = frames[Math.min(idx, frames.length - 1)]

  const handlePlayPause = () => {
    if (playing) {
      setPlaying(false)
      logger.log('info', 'SYSTEM', 'Playback paused')
    } else {
      setIdx(0)
      setPlaying(true)
      logger.log('info', 'SYSTEM', 'Playback started')
    }
  }

  return (
    <motion.div
      className="playback-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.img
        key={current.id}
        src={framePublicUrl(current.storage_path)}
        alt={`Frame ${idx + 1}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      />
      <div className="playback-controls">
        <button onClick={handlePlayPause}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <span>{idx + 1} / {frames.length}</span>
        <label className="fps-select">
          FPS
          <select
            value={fps}
            onChange={e => {
              const newFps = Number(e.target.value)
              setFps(newFps)
              logger.log('info', 'SYSTEM', `FPS changed to ${newFps}`)
            }}
          >
            {FPS_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button onClick={() => navigate('/')}>✕ Close</button>
      </div>
      <Timeline frames={frames} currentIndex={idx} onSelect={i => { setPlaying(false); setIdx(i) }} />
    </motion.div>
  )
}
