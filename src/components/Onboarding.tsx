import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markOnboarded, markCameraOk, setDisplayName, getDisplayName } from '../lib/onboarding'
import { listFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import { logger } from '../lib/logger'
import { getDeviceId } from '../lib/device'

type Step = 'start' | 'name' | 'preview' | 'camera'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('start')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [name, setName] = useState(getDisplayName() === 'Anonymous' ? '' : getDisplayName())
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [previewPlayed, setPreviewPlayed] = useState(false)
  const animationIntervalRef = useRef<number | null>(null)
  const imagePreloadRef = useRef<Map<string, HTMLImageElement>>(new Map())

  const deviceId = getDeviceId()

  // Fetch preview frames immediately on mount
  useEffect(() => {
    ;(async () => {
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        const frames = await listFrames(12)
        if (frames.length < 3) {
          setPreviewFrames([])
          logger.log('info', 'SYSTEM', `Onboarding: only ${frames.length} frames available, skipping preview`)
          return
        }
        const thumbUrls = frames.slice(-12).map(f => framePublicUrl(f.thumb_path))
        setPreviewFrames(thumbUrls)

        // Preload all images to avoid black flicker
        for (const url of thumbUrls) {
          const img = new Image()
          img.onload = () => {
            imagePreloadRef.current.set(url, img)
          }
          img.onerror = () => {
            logger.log('warn', 'SYSTEM', `Failed to preload ${url}`)
          }
          img.src = url
        }

        logger.log('info', 'SYSTEM', `Onboarding: ${thumbUrls.length} preview frames loaded`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.log('error', 'ERROR', `Failed to fetch preview frames: ${msg}`)
        setPreviewError(msg)
        setPreviewFrames([])
      } finally {
        setPreviewLoading(false)
      }
    })()
  }, [])

  // Animation loop for preview — play once, then auto-advance
  useEffect(() => {
    if (step !== 'preview' || previewFrames.length === 0 || previewPlayed) return

    // Wait for all images to be preloaded
    let loadedCount = 0
    const checkLoaded = () => {
      loadedCount = 0
      for (const url of previewFrames) {
        if (imagePreloadRef.current.has(url)) loadedCount++
      }
      if (loadedCount === previewFrames.length) startAnimation()
      else setTimeout(checkLoaded, 50)
    }

    const startAnimation = () => {
      let frameIdx = 0
      animationIntervalRef.current = window.setInterval(() => {
        frameIdx++
        setCurrentFrameIndex(frameIdx)
        if (frameIdx >= previewFrames.length - 1) {
          if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
          setPreviewPlayed(true)
          setTimeout(() => setStep('camera'), 500)
        }
      }, 1000 / 12)
    }

    checkLoaded()

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
    }
  }, [step, previewFrames, previewPlayed])

  async function requestCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      stream.getTracks().forEach(t => t.stop())
      markCameraOk()
      logger.log('info', 'SYSTEM', `Camera permission granted (device: ${deviceId})`)
      setDisplayName(name)
      markOnboarded()
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied'
      setCameraError(msg)
      logger.log('error', 'ERROR', `Camera permission denied: ${msg}`)
    }
  }

  const stepVariants = {
    enter: { opacity: 0, y: 20 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  }

  return (
    <motion.div className="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <AnimatePresence mode="wait">
        {step === 'start' && (
          <motion.div
            key="start"
            className="onboard-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <h1>PIXILATE</h1>
            <p className="onboard-tag">Exquisite corpse, stop-motion.<br />Anifilm 2026.</p>
            <p className="onboard-body">One shared animation for the whole festival. Add a frame, watch it live as others add theirs.</p>
            <button className="primary" onClick={() => setStep('name')}>Start</button>
          </motion.div>
        )}

        {step === 'name' && (
          <motion.div
            key="name"
            className="onboard-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <h2>What should we call you?</h2>
            <p className="onboard-body">Shown next to frames you capture. Optional.</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoFocus
            />
            <button className="primary" onClick={() => setStep('preview')}>Continue</button>
          </motion.div>
        )}

        {step === 'preview' && (
          <motion.div
            key="preview"
            className="onboard-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <h2>Live animation</h2>
            {previewLoading ? (
              <p className="onboard-body">Loading preview…</p>
            ) : previewError ? (
              <p className="onboard-body">Could not load preview: {previewError}</p>
            ) : previewFrames.length > 0 && !previewPlayed ? (
              <>
                <motion.div className="onboarding-animation">
                  <motion.img
                    key={currentFrameIndex}
                    src={previewFrames[currentFrameIndex]}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.05 }}
                    alt=""
                  />
                </motion.div>
                <p className="onboard-tag">Playing {previewFrames.length} frames at 12fps…</p>
              </>
            ) : (
              <p className="onboard-body">Ready for next step…</p>
            )}
          </motion.div>
        )}

        {step === 'camera' && (
          <motion.div
            key="camera"
            className="onboard-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <h2>Camera access required</h2>
            <p className="onboard-body">Pixilate needs your camera to capture frames. Photos go into the shared festival timeline.</p>
            {cameraError && (
              <motion.div
                className="onboard-error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <strong>Couldn't access the camera.</strong>
                <p>{cameraError}</p>
                <p className="onboard-hint">
                  iOS: Settings → Safari → Camera → Allow.
                  Desktop: click the camera icon in the address bar and allow.
                </p>
              </motion.div>
            )}
            <button className="primary" onClick={requestCamera}>
              {cameraError ? 'Try again' : 'Allow camera'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
