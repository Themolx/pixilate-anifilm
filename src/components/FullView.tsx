import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { listAllFrames, subscribeFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'
import { logger } from '../lib/logger'

const FPS = 12
// How many frames ahead of the playhead we keep warm in the browser image
// cache. Two seconds of buffer is enough to absorb a network hiccup without
// downloading the whole festival up front.
const PREFETCH_AHEAD = 24
// Periodic resync against the DB. Realtime websockets sometimes silently
// fall behind during a multi-hour TV run; a coarse refetch every minute
// catches anything we missed without hammering the API.
const RESYNC_MS = 60_000

export function FullView() {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Frame[]>([])
  const [idx, setIdx] = useState(0)
  const [hasInitial, setHasInitial] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const hideTimer = useRef<number | null>(null)

  // Initial fetch — paginated so it scales past 1000 rows, no upfront image
  // preload (the previous version Promise.all'd every full image and stalled
  // the loading screen on big festivals).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await listAllFrames()
        if (!alive) return
        setFrames(rows)
        setHasInitial(true)
        logger.log('info', 'SYSTEM', `FullView: loaded ${rows.length} frames`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.log('error', 'ERROR', `FullView initial fetch failed: ${msg}`)
        // Don't strand the TV — show "no frames" rather than a permanent spinner.
        if (alive) setHasInitial(true)
      }
    })()
    return () => { alive = false }
  }, [])

  // Realtime append + soft-delete handling. New frames are inserted in seq
  // order so the loop just picks them up next iteration.
  useEffect(() => {
    const unsub = subscribeFrames(ev => {
      setFrames(prev => {
        if (ev.type === 'INSERT') {
          if (prev.some(f => f.id === ev.frame.id)) return prev
          return [...prev, ev.frame].sort((a, b) => a.seq - b.seq)
        }
        return prev.map(f => (f.id === ev.frame.id ? ev.frame : f)).filter(f => !f.deleted_at)
      })
    })
    return unsub
  }, [])

  // Resync watchdog: refetch every minute. Catches any realtime drops that
  // the websocket layer didn't surface, important for multi-hour TV displays.
  useEffect(() => {
    if (!hasInitial) return
    const id = window.setInterval(async () => {
      try {
        const rows = await listAllFrames()
        setFrames(prev => {
          // Only replace if we actually have more or different rows.
          if (rows.length === prev.length) return prev
          return rows
        })
      } catch (err) {
        logger.log('warn', 'SYSTEM', `FullView resync failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, RESYNC_MS)
    return () => clearInterval(id)
  }, [hasInitial])

  // Playhead loop.
  useEffect(() => {
    if (!hasInitial || frames.length === 0) return
    const interval = window.setInterval(() => {
      setIdx(prev => (prev + 1) % frames.length)
    }, Math.round(1000 / FPS))
    return () => clearInterval(interval)
  }, [hasInitial, frames.length])

  // Prefetch ring: keep PREFETCH_AHEAD frames warm in the image cache so the
  // playback never stalls on a single slow request. The browser holds onto
  // these via its HTTP cache; we drop our references right away.
  useEffect(() => {
    if (!hasInitial || frames.length === 0) return
    for (let i = 0; i < PREFETCH_AHEAD; i++) {
      const target = frames[(idx + i) % frames.length]
      if (target) {
        const img = new Image()
        img.src = framePublicUrl(target.storage_path)
      }
    }
  }, [idx, frames, hasInitial])

  const pokeUI = () => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowUI(false), 2500)
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const current = frames[idx]

  return (
    <div
      onClick={pokeUI}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {!hasInitial && (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          Loading…
        </div>
      )}

      {hasInitial && frames.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          No frames yet
        </div>
      )}

      {hasInitial && current && (
        <img
          key={current.id}
          src={framePublicUrl(current.storage_path)}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      )}

      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#fff',
              fontSize: 13,
              fontFamily: 'monospace',
              pointerEvents: 'none',
            }}
          >
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: 999, backdropFilter: 'blur(8px)' }}>
              {String(idx + 1).padStart(3, '0')} / {String(frames.length).padStart(3, '0')}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigate('/') }}
              style={{
                pointerEvents: 'auto',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 13,
                backdropFilter: 'blur(8px)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
