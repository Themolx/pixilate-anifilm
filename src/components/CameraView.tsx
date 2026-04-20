import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Frame } from '../lib/types'
import {
  buildFramePaths,
  insertFrameRow,
  listFrames,
  subscribeFrames,
  uploadFrameBlobs,
} from '../lib/db'
import { captureFrame } from '../lib/capture'
import { classifyBlob, loadModel } from '../lib/moderation'
import { framePublicUrl } from '../lib/supabase'
import { getDisplayName } from '../lib/onboarding'
import { Timeline } from './Timeline'

const POLL_FALLBACK_MS = 10_000
const POLL_INTERVAL_MS = 10_000

export function CameraView() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tintCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map())

  const [frames, setFrames] = useState<Frame[]>([])
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [onionOpacity, setOnionOpacity] = useState(0.3)
  const [flash, setFlash] = useState(false)

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCameraReady(false)
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.onloadeddata = () => setCameraReady(true)
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Camera error')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [startCamera])

  // Warm up the NSFW model so the first capture doesn't wait for a cold download.
  useEffect(() => {
    loadModel().catch(err => {
      // eslint-disable-next-line no-console
      console.warn('[moderation] model preload failed', err)
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const rows = await listFrames()
      setFrames(rows)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[refresh]', err)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Realtime + polling fallback (captive portals block WebSockets).
  useEffect(() => {
    let gotEvent = false
    let fallbackTimer: number | null = null
    let pollTimer: number | null = null

    const unsubscribe = subscribeFrames(ev => {
      gotEvent = true
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

    fallbackTimer = window.setTimeout(() => {
      if (!gotEvent) pollTimer = window.setInterval(refresh, POLL_INTERVAL_MS)
    }, POLL_FALLBACK_MS)

    return () => {
      unsubscribe()
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [refresh])

  // Onion skin: last 3 frames tinted green, stacked
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (frames.length === 0) return

    const lastThree = frames.slice(-3)
    let cancelled = false
    ;(async () => {
      const canvases = await Promise.all(lastThree.map(f => getTinted(f.storage_path, tintCacheRef.current)))
      if (cancelled) return
      canvases.forEach((off, i) => {
        if (!off) return
        const layerOpacity = onionOpacity * ((i + 1) / lastThree.length)
        ctx.globalAlpha = layerOpacity
        const scale = Math.max(canvas.width / off.width, canvas.height / off.height)
        const w = off.width * scale
        const h = off.height * scale
        ctx.drawImage(off, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
      })
      ctx.globalAlpha = 1
    })()
    return () => { cancelled = true }
  }, [frames, onionOpacity])

  async function doCapture() {
    const v = videoRef.current
    if (!v || capturing) return
    if (!cameraReady || !v.videoWidth) {
      setStatus('Camera not ready')
      setTimeout(() => setStatus(null), 1500)
      return
    }
    setCapturing(true)
    setStatus('Capturing…')
    try {
      const cap = await captureFrame(v)

      setStatus('Checking…')
      try {
        const verdict = await classifyBlob(cap.thumb)
        if (!verdict.safe) throw new Error(`moderation:${verdict.reason ?? 'Content blocked'}`)
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        if (m.startsWith('moderation:')) throw e
        // eslint-disable-next-line no-console
        console.warn('[moderation] classify failed, allowing upload', e)
      }

      const { id, fullPath, thumbPath } = buildFramePaths()
      // Row first: DB triggers enforce cap + rate. If this fails, no orphan blob.
      await insertFrameRow({
        id,
        capture: { width: cap.width, height: cap.height, bytes: cap.full.size },
        fullPath,
        thumbPath,
        displayName: getDisplayName(),
      })
      setFlash(true)
      setTimeout(() => setFlash(false), 140)
      await uploadFrameBlobs(fullPath, thumbPath, cap.full, cap.thumb)
      setStatus('Saved')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('moderation:'))      setStatus(msg.slice('moderation:'.length))
      else if (msg.includes('rate_limit'))    setStatus('Slow down! (12 frames/min max)')
      else if (msg.includes('frame_cap_reached')) setStatus('Festival frame cap reached')
      else                                    setStatus(`Error: ${msg}`)
    } finally {
      setCapturing(false)
      setTimeout(() => setStatus(null), 2000)
    }
  }

  return (
    <div className="app">
      <div className="viewport">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} className="onion-layer" />
        {flash && <div className="capture-flash" />}

        <div className="frame-count">
          {frames.length} frames · Anifilm 2026
          {status && <div className="frame-count-status">{status}</div>}
          {!cameraReady && !cameraError && <div className="frame-count-hint">Starting camera…</div>}
          {cameraError && (
            <div className="frame-count-error">
              {cameraError}{' '}
              <button className="inline-btn" onClick={startCamera}>Retry</button>
            </div>
          )}
        </div>

        <div className="onion-control">
          <span>Onion {Math.round(onionOpacity * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={onionOpacity * 100}
            onChange={e => setOnionOpacity(Number(e.target.value) / 100)}
          />
        </div>
      </div>

      <div className="controls">
        <button className="side-btn" onClick={() => navigate('/admin')} title="Admin">⚙</button>
        <button
          className="capture-btn"
          onClick={doCapture}
          disabled={capturing}
          title="Capture"
        />
        <button
          className="side-btn"
          onClick={() => navigate('/play')}
          disabled={frames.length === 0}
          title="Play"
        >▶</button>
      </div>

      <Timeline frames={frames} />
    </div>
  )
}

async function getTinted(
  path: string,
  cache: Map<string, HTMLCanvasElement>,
): Promise<HTMLCanvasElement | null> {
  const cached = cache.get(path)
  if (cached) return cached
  try {
    const img = await loadImage(framePublicUrl(path))
    const maxW = 640
    const scale = Math.min(1, maxW / img.width)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const ctx = off.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = '#44ff88'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    cache.set(path, off)
    if (cache.size > 12) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
    return off
  } catch {
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}
