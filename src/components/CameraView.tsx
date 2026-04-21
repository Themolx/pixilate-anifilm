import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Frame } from '../lib/types'
import { buildFramePaths, insertFrameRow, listFrames, subscribeFrames, uploadFrameBlobs } from '../lib/db'
import { captureFrame } from '../lib/capture'
import { classifyBlob, loadModel } from '../lib/moderation'
import { framePublicUrl } from '../lib/supabase'
import { getDisplayName } from '../lib/onboarding'
import { logger } from '../lib/logger'

const POLL_FALLBACK_MS = 10_000
const POLL_INTERVAL_MS = 10_000
const PREVIEW_FPS = 12

export function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tintCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map())

  const [frames, setFrames] = useState<Frame[]>([])
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info')
  const [onionOpacity, setOnionOpacity] = useState(0.3)
  const [flash, setFlash] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [throttleMs, setThrottleMs] = useState(0)
  const previewIntervalRef = useRef<number | null>(null)

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
      logger.log('info', 'SYSTEM', 'Camera started')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera error'
      setCameraError(msg)
      logger.log('error', 'ERROR', `Camera start failed: ${msg}`)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [startCamera])

  // Warm up NSFW model
  useEffect(() => {
    loadModel().catch(err => {
      logger.log('warn', 'MODERATION', `Model preload failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      const rows = await listFrames()
      setFrames(rows)
    } catch (err) {
      logger.log('error', 'ERROR', `Refresh failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime + polling fallback
  useEffect(() => {
    let gotEvent = false
    let fallbackTimer: number | null = null
    let pollTimer: number | null = null

    const unsubscribe = subscribeFrames(ev => {
      gotEvent = true
      logger.log('info', 'REALTIME', `Frame ${ev.type}: ${ev.frame.id}`)
      setFrames(prev => {
        if (ev.type === 'INSERT') {
          if (prev.some(f => f.id === ev.frame.id)) return prev
          return [...prev, ev.frame].sort((a, b) => a.seq - b.seq)
        }
        return prev.map(f => (f.id === ev.frame.id ? ev.frame : f)).filter(f => !f.deleted_at)
      })
    })

    fallbackTimer = window.setTimeout(() => {
      if (!gotEvent) {
        logger.log('info', 'SYSTEM', 'Realtime timeout, falling back to polling')
        pollTimer = window.setInterval(refresh, POLL_INTERVAL_MS)
      }
    }, POLL_FALLBACK_MS)

    return () => {
      unsubscribe()
      if (fallbackTimer) clearTimeout(fallbackTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [refresh])

  // Throttle cooldown timer
  useEffect(() => {
    if (throttleMs <= 0) return
    const timer = setInterval(() => {
      setThrottleMs(prev => Math.max(0, prev - 100))
    }, 100)
    return () => clearInterval(timer)
  }, [throttleMs])

  // Onion skin
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth * window.devicePixelRatio
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
    return () => {
      cancelled = true
    }
  }, [frames, onionOpacity])

  function showStatusMessage(msg: string, type: 'info' | 'error' | 'success' = 'info') {
    setStatus(msg)
    setStatusType(type)
    setTimeout(() => setStatus(null), 2000)
  }

  function handlePreviewOpen() {
    if (frames.length < 1) return
    const thumbs = frames.slice(-24).map(f => framePublicUrl(f.thumb_path))
    setPreviewFrames(thumbs)
    setPreviewIndex(0)
    setShowPreview(true)

    logger.log('info', 'SYSTEM', `Preview opened: ${thumbs.length} frames at 12fps`)

    let frameIdx = 0
    previewIntervalRef.current = window.setInterval(() => {
      frameIdx++
      setPreviewIndex(frameIdx)
      if (frameIdx >= thumbs.length - 1) {
        if (previewIntervalRef.current) clearInterval(previewIntervalRef.current)
        setTimeout(() => handlePreviewClose(), 500)
      }
    }, 1000 / PREVIEW_FPS)
  }

  function handlePreviewClose() {
    setShowPreview(false)
    if (previewIntervalRef.current) clearInterval(previewIntervalRef.current)
  }

  async function doCapture() {
    const v = videoRef.current
    if (!v || capturing || throttleMs > 0) return
    if (!cameraReady || !v.videoWidth) {
      showStatusMessage('Camera not ready', 'error')
      return
    }

    setCapturing(true)
    showStatusMessage('Capturing…', 'info')
    logger.log('info', 'CAPTURE', 'Starting capture')

    try {
      const cap = await captureFrame(v)
      logger.log('info', 'CAPTURE', `Frame captured: ${cap.width}x${cap.height}, ${Math.round(cap.full.size / 1024)}kB`)

      showStatusMessage('Checking…', 'info')
      try {
        const verdict = await classifyBlob(cap.thumb)
        if (!verdict.safe) {
          const filterMsg = verdict.reason ?? 'Content blocked'
          logger.log('warn', 'MODERATION', `BLOCKED: ${filterMsg}`)
          throw new Error(`moderation:${filterMsg}`)
        }
        logger.log('info', 'MODERATION', 'Frame passed (safe)')
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        if (m.startsWith('moderation:')) throw e
        logger.log('warn', 'MODERATION', `Classify failed, allowing upload: ${m}`)
      }

      const { id, fullPath, thumbPath } = buildFramePaths()
      logger.log('info', 'UPLOAD', `Inserting row: ${id}`)
      await insertFrameRow({
        id,
        capture: { width: cap.width, height: cap.height, bytes: cap.full.size },
        fullPath,
        thumbPath,
        displayName: getDisplayName(),
      })

      setFlash(true)
      setTimeout(() => setFlash(false), 140)

      logger.log('info', 'UPLOAD', `Uploading blobs…`)
      await uploadFrameBlobs(fullPath, thumbPath, cap.full, cap.thumb)

      logger.log('info', 'CAPTURE', 'Success!')
      showStatusMessage('Saved', 'success')
      setThrottleMs(1500)
    } catch (err) {
      let msg = 'Unknown error'
      try {
        if (err instanceof Error) {
          msg = err.message
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
          msg = String((err as any).message)
        } else if (typeof err === 'string') {
          msg = err
        } else {
          msg = JSON.stringify(err)
        }
      } catch {
        msg = 'Failed to format error'
      }

      logger.log('error', 'ERROR', `Capture failed: ${msg}`)

      if (msg.startsWith('moderation:')) {
        showStatusMessage(msg.slice('moderation:'.length), 'error')
      } else if (msg.includes('rate_limit')) {
        showStatusMessage('Slow down! (12 frames/min max)', 'error')
        logger.log('warn', 'RATE_LIMIT', 'Rate limit triggered')
      } else if (msg.includes('frame_cap_reached')) {
        showStatusMessage('Festival frame cap reached', 'error')
      } else {
        showStatusMessage(`Error: ${msg}`, 'error')
      }
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="app">
      <div className="viewport">
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} className="onion-layer" />
        {flash && <div className="capture-flash" />}
      </div>

      <motion.div
        className="onion-control-bar"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="onion-icon">◐</div>
        <input
          type="range"
          min={0}
          max={100}
          value={onionOpacity * 100}
          onChange={e => setOnionOpacity(Number(e.target.value) / 100)}
        />
      </motion.div>

      <div className="controls">
        <div className="controls-group">
          <button
            className="preview-btn"
            onClick={handlePreviewOpen}
            disabled={frames.length === 0}
            title="Preview last 2 seconds"
          >
            ⏯
          </button>
        </div>

        <button
          className="capture-btn"
          onClick={doCapture}
          disabled={capturing || !cameraReady || throttleMs > 0}
          title={throttleMs > 0 ? `Wait ${Math.ceil(throttleMs / 1000)}s` : 'Capture frame'}
        />

        <div className="frame-count">{String(frames.length).padStart(3, '0')}</div>
      </div>

      <AnimatePresence>
        {status && (
          <motion.div
            className={`status-toast ${statusType}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {status}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreview && previewFrames.length > 0 && (
          <motion.div
            className="preview-overlay"
            onClick={handlePreviewClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.img
              key={previewIndex}
              src={previewFrames[previewIndex]}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.05 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {cameraError && (
        <motion.div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100% - 24px)',
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="onboard-error">
            <strong>Camera error: {cameraError}</strong>
            <p className="onboard-hint">
              iOS: Settings → Safari → Camera → Allow. Desktop: click the camera icon in the address bar.
            </p>
            <button className="primary" onClick={startCamera} style={{ marginTop: '8px', maxWidth: 'none' }}>
              Retry
            </button>
          </div>
        </motion.div>
      )}
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
