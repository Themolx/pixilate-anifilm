import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { listFrames, subscribeFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import type { Frame } from '../lib/types'

const FPS = 12

export function FullView() {
  const navigate = useNavigate()
  const [frames, setFrames] = useState<Frame[]>([])
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = await listFrames()
      if (!alive) return
      setFrames(rows)
      // Preload all thumbs so the loop doesn't stutter
      await Promise.all(rows.map(f => new Promise<void>(resolve => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = framePublicUrl(f.storage_path)
      })))
      if (alive) setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

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

  useEffect(() => {
    if (!loaded || frames.length === 0) return
    const interval = setInterval(() => {
      setIdx(prev => (prev + 1) % frames.length)
    }, Math.round(1000 / FPS))
    return () => clearInterval(interval)
  }, [loaded, frames.length])

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
      {!loaded && (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          Loading {frames.length} frames…
        </div>
      )}

      {loaded && frames.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          No frames yet
        </div>
      )}

      {loaded && current && (
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
