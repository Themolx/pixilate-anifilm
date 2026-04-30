import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { listAllFrames, subscribeFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'
import { logger } from '../lib/logger'

const FPS = 12
// Prefetch this many frames ahead of the playhead. Two seconds of buffer
// covers a single slow request without forcing us to download the whole
// festival before playback can start.
const PREFETCH_AHEAD = 24
// Periodic resync against the DB. Catches anything realtime missed during
// long-lived sessions; cheap because listAllFrames is paginated.
const RESYNC_MS = 60_000

export function FullView() {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Frame[]>([])
  const [idx, setIdx] = useState(0)
  const [hasInitial, setHasInitial] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const hideTimer = useRef<number | null>(null)

  // Track which frame IDs have actually finished loading their image. The
  // playhead refuses to advance to a frame that isn't ready yet, so the user
  // never sees a blank image / black flash even when the network is slower
  // than the 83ms-per-frame playback budget.
  const startedRef = useRef<Set<string>>(new Set())
  const [readyIds, setReadyIds] = useState<Set<string>>(new Set())
  const readyIdsRef = useRef(readyIds)
  readyIdsRef.current = readyIds

  const markReady = (id: string) => {
    setReadyIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  // Initial fetch — paginated, no upfront image preload. Playback gates on
  // readyIds so the loop only advances over frames that have actually loaded.
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
        if (alive) setHasInitial(true)
      }
    })()
    return () => { alive = false }
  }, [])

  // Realtime append + soft-delete handling.
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

  // Resync watchdog for long-running sessions.
  useEffect(() => {
    if (!hasInitial) return
    const id = window.setInterval(async () => {
      try {
        const rows = await listAllFrames()
        setFrames(prev => (rows.length === prev.length ? prev : rows))
      } catch (err) {
        logger.log('warn', 'SYSTEM', `FullView resync failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, RESYNC_MS)
    return () => clearInterval(id)
  }, [hasInitial])

  // Playhead loop — advances only when the next frame is ready. If the next
  // image hasn't loaded yet we hold on the current frame, so playback slows
  // gracefully on bad networks instead of flashing black.
  useEffect(() => {
    if (!hasInitial || frames.length === 0) return
    const interval = window.setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % frames.length
        const nextFrame = frames[next]
        if (nextFrame && readyIdsRef.current.has(nextFrame.id)) return next
        return prev
      })
    }, Math.round(1000 / FPS))
    return () => clearInterval(interval)
  }, [hasInitial, frames])

  // Prefetch ring: kick off Image() loads for the next PREFETCH_AHEAD frames.
  // We use thumbs (~25KB) so even a slow connection keeps up with 12fps.
  // startedRef dedupes so we don't refetch the same frame on every tick.
  useEffect(() => {
    if (!hasInitial || frames.length === 0) return
    for (let i = 0; i < PREFETCH_AHEAD; i++) {
      const target = frames[(idx + i) % frames.length]
      if (!target || startedRef.current.has(target.id)) continue
      startedRef.current.add(target.id)
      const img = new Image()
      const id = target.id
      img.onload = () => markReady(id)
      // Treat errors as "ready" so a single missing thumb can't permanently
      // stall the playhead. Worst case the user sees a brief broken-image
      // tick when that index comes around.
      img.onerror = () => markReady(id)
      img.src = framePublicUrl(target.thumb_path)
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
  const currentReady = current && readyIds.has(current.id)

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

      {hasInitial && current && currentReady && (
        <img
          key={current.id}
          src={framePublicUrl(current.thumb_path)}
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            imageRendering: 'auto',
          }}
        />
      )}

      {/* Always-visible overlay: frame counter (left) + author name (right) */}
      {hasInitial && current && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#fff',
            fontSize: 13,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
          }}
        >
          <span>{String(idx + 1).padStart(3, '0')} / {String(frames.length).padStart(3, '0')}</span>
          <span style={{ fontFamily: 'inherit', opacity: 0.85 }}>{current.display_name || 'Anonymous'}</span>
        </div>
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
            <div />
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
