import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { Frame } from '../lib/types'
import { buildFramePaths, insertFrameRow, listFrames, subscribeFrames, uploadFrameBlobs } from '../lib/db'
import { captureFrame } from '../lib/capture'
import { classifyBlob, loadModel } from '../lib/moderation'
import { framePublicUrl } from '../lib/supabase'
import { getDisplayName } from '../lib/onboarding'
import { getDeviceId } from '../lib/device'
import { logger } from '../lib/logger'
import { t } from '../lib/i18n'
import { getTodayTopic, hasSeenTodayTopic, markTodayTopicSeen } from '../lib/daily'
import { BrushDeco } from './BrushDeco'

const POLL_FALLBACK_MS = 10_000
const POLL_INTERVAL_MS = 10_000
const PREVIEW_FPS = 6

export function CameraView() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [frames, setFrames] = useState<Frame[]>([])
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info')
  const [onionOpacity, setOnionOpacity] = useState(0.5)
  const [flash, setFlash] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [throttleMs, setThrottleMs] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [localCapture, setLocalCapture] = useState<{ id: string; url: string } | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [topic] = useState(() => getTodayTopic())
  const [showTopicIntro, setShowTopicIntro] = useState(() => !hasSeenTodayTopic())

  const dismissTopic = useCallback(() => {
    markTodayTopicSeen()
    setShowTopicIntro(false)
  }, [])

  useEffect(() => {
    if (!showTopicIntro) return
    const timer = window.setTimeout(dismissTopic, 4000)
    return () => clearTimeout(timer)
  }, [showTopicIntro, dismissTopic])
  const previewIntervalRef = useRef<number | null>(null)
  const lastDistanceRef = useRef(0)

  const startCameraWithFacing = useCallback(async (facing: 'environment' | 'user') => {
    setCameraError(null)
    setCameraReady(false)
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      setFacingMode(facing)
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.onloadeddata = () => setCameraReady(true)
      }
      logger.log('info', 'SYSTEM', `Camera started (${facing})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera error'
      setCameraError(msg)
      logger.log('error', 'ERROR', `Camera start failed: ${msg}`)
    }
  }, [])

  const startCamera = useCallback(() => {
    startCameraWithFacing(facingMode)
  }, [facingMode, startCameraWithFacing])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [startCamera])

  // Init logger + warm up NSFW model
  useEffect(() => {
    logger.log('info', 'SYSTEM', `CameraView started (device: ${getDeviceId()})`)
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

  // Onion skin: split image load from opacity redraw so dragging the slider
  // doesn't reload the image (which caused visible flicker).
  // - tintedRef holds the pre-tinted offscreen canvas for the current frame.
  // - Loader effect only re-runs when the target frame or its URL changes.
  // - Render effect redraws when opacity changes — cheap, no image traffic.
  const tintedRef = useRef<HTMLCanvasElement | null>(null)

  const lastFrame = frames.length > 0 ? frames[frames.length - 1] : null
  const lastFrameId = lastFrame?.id ?? null
  const lastFrameUrl = lastFrame
    ? (localCapture && localCapture.id === lastFrame.id
        ? localCapture.url
        : framePublicUrl(lastFrame.storage_path))
    : null

  const renderOnion = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const tinted = tintedRef.current
    if (!tinted) return
    ctx.globalAlpha = onionOpacity
    ctx.drawImage(tinted, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1
  }, [onionOpacity])

  // Loader: fetch image, build tinted offscreen canvas once per frame change.
  useEffect(() => {
    if (!lastFrameId || !lastFrameUrl) {
      tintedRef.current = null
      renderOnion()
      return
    }

    let cancelled = false
    let retryTimer: number | null = null

    const attempt = (tryNum: number) => {
      if (cancelled) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        // Build at device resolution of the current viewport
        const canvas = canvasRef.current
        if (!canvas) return
        const W = canvas.offsetWidth * window.devicePixelRatio
        const H = canvas.offsetHeight * window.devicePixelRatio
        const off = document.createElement('canvas')
        off.width = W
        off.height = H
        const offCtx = off.getContext('2d')!
        const scale = Math.max(W / img.width, H / img.height)
        const w = img.width * scale
        const h = img.height * scale
        offCtx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
        offCtx.globalCompositeOperation = 'multiply'
        offCtx.fillStyle = '#4edca2'
        offCtx.fillRect(0, 0, W, H)
        offCtx.globalCompositeOperation = 'source-over'
        tintedRef.current = off
        renderOnion()
      }
      img.onerror = () => {
        if (cancelled || tryNum >= 6) return
        retryTimer = window.setTimeout(() => attempt(tryNum + 1), 400 * (tryNum + 1))
      }
      img.src = lastFrameUrl
    }

    attempt(0)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [lastFrameId, lastFrameUrl, renderOnion])

  // Render whenever opacity changes (cheap: just draws the cached tinted canvas).
  useEffect(() => {
    renderOnion()
  }, [onionOpacity, renderOnion])

  function showStatusMessage(msg: string, type: 'info' | 'error' | 'success' = 'info') {
    setStatus(msg)
    setStatusType(type)
    setTimeout(() => setStatus(null), 2000)
  }

  async function handlePreviewOpen() {
    if (frames.length < 1) return
    const thumbs = frames.slice(-24).map(f => framePublicUrl(f.storage_path))
    setPreviewFrames(thumbs)
    setPreviewIndex(0)
    setShowPreview(true)

    logger.log('info', 'SYSTEM', `Preview opening: preloading ${thumbs.length} frames…`)

    // Preload all images before starting animation
    const preloadPromises = thumbs.map(
      url =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => resolve()
          img.onerror = () => {
            logger.log('warn', 'SYSTEM', `Preview image failed to load: ${url}`)
            resolve()
          }
          img.src = url
        })
    )

    await Promise.all(preloadPromises)
    logger.log('info', 'SYSTEM', `Preview: ${thumbs.length} frames preloaded, starting playback`)

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

  const handleFlipCamera = useCallback(() => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment'
    startCameraWithFacing(newFacing)
  }, [facingMode, startCameraWithFacing])

  async function doCapture() {
    const v = videoRef.current
    if (!v || capturing || throttleMs > 0) return
    if (!cameraReady || !v.videoWidth) {
      showStatusMessage(t('cameraNotReady'), 'error')
      return
    }

    setCapturing(true)
    logger.log('info', 'CAPTURE', 'Starting capture')

    try {
      const cap = await captureFrame(v, zoom)
      logger.log('info', 'CAPTURE', `Frame captured: ${cap.width}x${cap.height}, ${Math.round(cap.full.size / 1024)}kB`)

      try {
        const verdict = await classifyBlob(cap.thumb)
        logger.log('info', 'MODERATION', `Scores: ${JSON.stringify(verdict.scores)}`)
        if (!verdict.safe) {
          const filterMsg = verdict.reason ?? 'Content blocked'
          logger.log('warn', 'MODERATION', `BLOCKED: ${filterMsg}`)
          throw new Error(`moderation:${filterMsg}`)
        }
        logger.log('info', 'MODERATION', 'PASSED (safe content)')
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        if (m.startsWith('moderation:')) throw e
        logger.log('error', 'MODERATION', `Classify error: ${m}`)
      }

      const { id, fullPath, thumbPath } = buildFramePaths()
      const blobUrl = URL.createObjectURL(cap.full)
      setLocalCapture(prev => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { id, url: blobUrl }
      })
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
        showStatusMessage(t('slowDown'), 'error')
        logger.log('warn', 'RATE_LIMIT', 'Rate limit triggered')
      } else if (msg.includes('frame_cap_reached')) {
        showStatusMessage(t('frameCapReached'), 'error')
      } else {
        showStatusMessage(`Error: ${msg}`, 'error')
      }
    } finally {
      setCapturing(false)
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const [t1, t2] = [e.touches[0], e.touches[1]]
    const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    if (lastDistanceRef.current === 0) {
      lastDistanceRef.current = distance
      return
    }

    const ratio = distance / lastDistanceRef.current
    setZoom(prev => Math.max(1, Math.min(3, prev * ratio)))
    lastDistanceRef.current = distance
  }

  function handleTouchEnd() {
    lastDistanceRef.current = 0
  }

  return (
    <div className="app">
      <div className="viewport-wrap">
      <div className="viewport" onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{ touchAction: 'none' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ transform: `scale(${zoom})` }} />
        <canvas ref={canvasRef} className="onion-layer" />

        {showGrid && (
          <svg
            className="grid-overlay"
            viewBox="0 0 3 3"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <line x1="1" y1="0" x2="1" y2="3" stroke="rgba(255,255,255,0.45)" strokeWidth="0.01" />
            <line x1="2" y1="0" x2="2" y2="3" stroke="rgba(255,255,255,0.45)" strokeWidth="0.01" />
            <line x1="0" y1="1" x2="3" y2="1" stroke="rgba(255,255,255,0.45)" strokeWidth="0.01" />
            <line x1="0" y1="2" x2="3" y2="2" stroke="rgba(255,255,255,0.45)" strokeWidth="0.01" />
          </svg>
        )}

        {/* Daily topic pill (tap to re-open the modal) */}
        <button
          onClick={() => setShowTopicIntro(true)}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            padding: '5px 9px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.22)',
            border: 'none',
            color: 'rgba(255,255,255,0.8)',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            maxWidth: 'calc(100% - 72px)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            opacity: 0.7,
          }}
        >
          <span style={{ opacity: 0.65, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('dailyTopicLabel')}
          </span>
          <span style={{ fontWeight: 600 }}>{topic}</span>
        </button>

        {/* Frame counter at top — tap to view the whole animation */}
        <button
          onClick={() => navigate('/full')}
          title="View the whole animation"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: '5px 10px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 600,
            letterSpacing: 0.5,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          ▶ {String(frames.length).padStart(3, '0')}
        </button>

        {flash && <div className="capture-flash" />}
      </div>
      </div>

      <div className="bottom-panel">
      <motion.div
        className="onion-control-bar"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="onion-row">
          <div className="onion-icon" title="Onion skin opacity">◐</div>
          <input
            type="range"
            min={0}
            max={80}
            value={Math.round(onionOpacity * 100)}
            onChange={e => setOnionOpacity(Number(e.target.value) / 100)}
            aria-label="Onion opacity"
          />
          <button
            className={`grid-toggle ${showGrid ? 'on' : ''}`}
            onClick={() => setShowGrid(g => !g)}
            title="Toggle 3×3 grid"
            aria-label="Toggle grid"
            aria-pressed={showGrid}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1.5" y="1.5" width="13" height="13" />
              <line x1="6" y1="1.5" x2="6" y2="14.5" />
              <line x1="10" y1="1.5" x2="10" y2="14.5" />
              <line x1="1.5" y1="6" x2="14.5" y2="6" />
              <line x1="1.5" y1="10" x2="14.5" y2="10" />
            </svg>
          </button>
        </div>
      </motion.div>

      <div className="controls">
        <div className="controls-left">
          <button
            className="preview-btn"
            onClick={handlePreviewOpen}
            disabled={frames.length === 0}
            title="Rewind last 2 seconds"
            aria-label="Rewind 2s"
          >
            <span className="rewind-label">2s</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="6" width="2" height="12" rx="0.5" />
              <polygon points="14,6 14,18 7,12" />
              <polygon points="22,6 22,18 15,12" />
            </svg>
          </button>
        </div>

        <button
          className="capture-btn"
          onClick={doCapture}
          disabled={capturing || !cameraReady || throttleMs > 0}
          title={throttleMs > 0 ? `Wait ${Math.ceil(throttleMs / 1000)}s` : 'Capture frame'}
        />

        <div className="controls-right">
          <button
            className="flip-btn"
            onClick={handleFlipCamera}
            title={facingMode === 'environment' ? 'Switch to selfie' : 'Switch to rear'}
            aria-label="Flip camera"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15.3-6.36L21 8" />
              <polyline points="21 3 21 8 16 8" />
              <path d="M21 12a9 9 0 0 1-15.3 6.36L3 16" />
              <polyline points="3 21 3 16 8 16" />
            </svg>
          </button>
        </div>
      </div>
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
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          >
            {/* Current frame - always visible */}
            <img src={previewFrames[previewIndex]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            {/* Previous frame - fades out on top */}
            {previewIndex > 0 && (
              <motion.img
                src={previewFrames[previewIndex - 1]}
                alt=""
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.08 }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTopicIntro && (
          <motion.div
            key="topic-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={dismissTopic}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              background: 'rgba(255,255,255,0.98)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              padding: 32,
              textAlign: 'left',
              cursor: 'pointer',
              overflow: 'hidden',
              isolation: 'isolate',
            }}
          >
            <BrushDeco count={3} />
            <div style={{ position: 'relative', zIndex: 1, color: 'var(--ok)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
              {t('dailyTopicIntro')}
            </div>
            <div style={{ position: 'relative', zIndex: 1, color: 'var(--text)', fontSize: 36, fontWeight: 700, lineHeight: 1.1, marginBottom: 20, maxWidth: 360 }}>
              {topic}
            </div>
            <div style={{ position: 'relative', zIndex: 1, color: 'var(--text-muted)', fontSize: 14, maxWidth: 320 }}>
              {t('dailyTopicHint')}
            </div>
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
            <strong>{t('cameraErrorPrefix')} {cameraError}</strong>
            <p className="onboard-hint">{t('cameraHint')}</p>
            <button className="primary" onClick={startCamera} style={{ marginTop: '8px', maxWidth: 'none' }}>
              {t('tryAgain')}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

