import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { listAllFrames, subscribeFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'
import { logger } from '../lib/logger'

const FPS = 12
// How many frames must be cached before playback starts. ~2.5s of buffer
// at 12fps is enough to absorb network jitter without making the user
// stare at "Loading…" forever.
const INITIAL_BUFFER = 30
// Once playback is running, keep this many frames warm ahead of the
// playhead so live loading rides along without stalling.
const PREFETCH_AHEAD = 30

export function FullView() {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Frame[]>([])
  const [idx, setIdx] = useState(0)
  const [hasInitial, setHasInitial] = useState(false)
  const [bufferReady, setBufferReady] = useState(false)
  const [bufferLoaded, setBufferLoaded] = useState(0)
  const [showUI, setShowUI] = useState(false)
  const hideTimer = useRef<number | null>(null)

  // Track which frame URLs we've already kicked off a fetch for, so the
  // prefetch ring doesn't duplicate work as the playhead advances.
  const startedRef = useRef<Set<string>>(new Set())

  // Initial paginated fetch.
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

  // Realtime + soft-delete handling.
  useEffect(() => {
    return subscribeFrames(ev => {
      setFrames(prev => {
        if (ev.type === 'INSERT') {
          if (prev.some(f => f.id === ev.frame.id)) return prev
          return [...prev, ev.frame].sort((a, b) => a.seq - b.seq)
        }
        return prev.map(f => (f.id === ev.frame.id ? ev.frame : f)).filter(f => !f.deleted_at)
      })
    })
  }, [])

  // Initial buffer fill: download the first N thumbs upfront so playback
  // starts smooth. Done once; new frames that stream in later are picked up
  // by the prefetch ring instead.
  useEffect(() => {
    if (!hasInitial || bufferReady || frames.length === 0) return
    const target = Math.min(INITIAL_BUFFER, frames.length)
    let loaded = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      loaded++
      setBufferLoaded(loaded)
      if (loaded >= target) {
        setBufferReady(true)
        logger.log('info', 'SYSTEM', `FullView: buffer ready (${loaded}/${target})`)
      }
    }

    for (let i = 0; i < target; i++) {
      const frame = frames[i]
      if (!frame) { tick(); continue }
      if (startedRef.current.has(frame.id)) { tick(); continue }
      startedRef.current.add(frame.id)
      const img = new Image()
      img.onload = tick
      img.onerror = tick
      img.src = framePublicUrl(frame.thumb_path)
    }

    // Safety net: if all frames in the buffer were already started before
    // (cached from an earlier mount), the loop above never advanced.
    if (target === 0) setBufferReady(true)

    return () => { cancelled = true }
  }, [hasInitial, frames, bufferReady])

  // Playback loop: fixed FPS, runs only after the initial buffer is ready.
  // No per-frame gating — the prefetch ring keeps later frames warm so a
  // single missed cache hit briefly flickers but doesn't change pace.
  useEffect(() => {
    if (!bufferReady || frames.length === 0) return
    const interval = window.setInterval(() => {
      setIdx(prev => (prev + 1) % frames.length)
    }, Math.round(1000 / FPS))
    return () => clearInterval(interval)
  }, [bufferReady, frames.length])

  // Prefetch ring: keep PREFETCH_AHEAD frames warm in the image cache.
  useEffect(() => {
    if (!bufferReady || frames.length === 0) return
    for (let i = 0; i < PREFETCH_AHEAD; i++) {
      const target = frames[(idx + i) % frames.length]
      if (!target || startedRef.current.has(target.id)) continue
      startedRef.current.add(target.id)
      const img = new Image()
      img.src = framePublicUrl(target.thumb_path)
    }
  }, [idx, frames, bufferReady])

  const pokeUI = () => {
    setShowUI(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowUI(false), 2500)
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const current = frames[idx]
  const showBufferLabel = !bufferReady
  const target = Math.min(INITIAL_BUFFER, frames.length)

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
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          Loading…
        </div>
      )}

      {hasInitial && frames.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          No frames yet
        </div>
      )}

      {hasInitial && frames.length > 0 && showBufferLabel && (
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontFamily: 'monospace' }}>
          Buffering {bufferLoaded} / {target}
        </div>
      )}

      {bufferReady && current && (
        <img
          key={current.id}
          src={framePublicUrl(current.thumb_path)}
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      )}

      {/* Always-visible bottom strip: counter (left), author (right). */}
      {bufferReady && current && (
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
          <span style={{ opacity: 0.85 }}>{current.display_name || 'Anonymous'}</span>
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
              right: 16,
              pointerEvents: 'none',
            }}
          >
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
