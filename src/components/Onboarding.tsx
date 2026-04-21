import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markOnboarded, markCameraOk, setDisplayName, getDisplayName } from '../lib/onboarding'
import { listFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import { logger } from '../lib/logger'
import { getDeviceId } from '../lib/device'
import { t } from '../lib/i18n'

type Step = 'start' | 'name' | 'preview' | 'camera'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('start')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [name, setName] = useState(getDisplayName() === 'Anonymous' ? '' : getDisplayName())
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [previewDone, setPreviewDone] = useState(false)
  const [previewPhase, setPreviewPhase] = useState<'intro' | 'playing'>('intro')
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
        const thumbUrls = frames.reverse().slice(0, 12).map(f => framePublicUrl(f.thumb_path))
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

  // 2s anticipation screen before the animation plays.
  useEffect(() => {
    if (step !== 'preview') return
    if (previewPhase !== 'intro') return
    const timer = window.setTimeout(() => setPreviewPhase('playing'), 2000)
    return () => clearTimeout(timer)
  }, [step, previewPhase])

  // Animation loop for preview — play once at 6fps, then auto-advance.
  useEffect(() => {
    if (step !== 'preview') return
    if (previewPhase !== 'playing') return
    if (previewDone) return

    if (previewFrames.length === 0) {
      const t = window.setTimeout(() => setStep('camera'), 500)
      return () => clearTimeout(t)
    }

    const timeouts: number[] = []
    let cancelled = false

    const checkLoaded = () => {
      if (cancelled) return
      let loaded = 0
      for (const url of previewFrames) {
        if (imagePreloadRef.current.has(url)) loaded++
      }
      if (loaded === previewFrames.length) startAnimation()
      else timeouts.push(window.setTimeout(checkLoaded, 50))
    }

    const startAnimation = () => {
      if (cancelled) return
      let frameIdx = 0
      animationIntervalRef.current = window.setInterval(() => {
        frameIdx++
        setCurrentFrameIndex(frameIdx)
        if (frameIdx >= previewFrames.length - 1) {
          if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
          setPreviewDone(true)
          timeouts.push(window.setTimeout(() => setStep('camera'), 500))
        }
      }, 1000 / 6)
    }

    checkLoaded()

    return () => {
      cancelled = true
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
      timeouts.forEach(clearTimeout)
    }
  }, [step, previewFrames, previewDone, previewPhase])

  const skipPreview = () => {
    if (step !== 'preview') return
    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
    animationIntervalRef.current = null
    setPreviewDone(true)
    setStep('camera')
  }

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
            <p className="onboard-tag">{t('tagline')}<br />{t('festival')}</p>
            <p className="onboard-body">{t('intro')}</p>
            <button className="primary" onClick={() => setStep('name')}>{t('start')}</button>
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
            <h2>{t('nameQuestion')}</h2>
            <p className="onboard-body">{t('nameHint')}</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={24}
              autoFocus
            />
            <button className="primary" onClick={() => setStep('preview')}>{t('continue')}</button>
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
            onClick={skipPreview}
            style={{ cursor: 'pointer' }}
          >
            {previewLoading ? (
              <>
                <h2>{t('liveAnimation')}</h2>
                <p className="onboard-body">{t('loadingPreview')}</p>
              </>
            ) : previewError ? (
              <>
                <h2>{t('liveAnimation')}</h2>
                <p className="onboard-body">{t('previewFailed')} {previewError}</p>
              </>
            ) : previewFrames.length === 0 ? (
              <p className="onboard-body">{t('readyNext')}</p>
            ) : (
              <AnimatePresence mode="wait">
                {previewPhase === 'intro' ? (
                  <motion.div
                    key="intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <h2>{t('latestAnimation')}</h2>
                    <p className="onboard-body">{t('latestAnimationSub')}</p>
                  </motion.div>
                ) : !previewDone ? (
                  <motion.div
                    key="playing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="onboarding-animation" style={{ position: 'relative' }}>
                      <img src={previewFrames[currentFrameIndex]} alt="" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                      {currentFrameIndex > 0 && (
                        <motion.img
                          src={previewFrames[currentFrameIndex - 1]}
                          alt=""
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: 0.08 }}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                        />
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.p key="done" className="onboard-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {t('readyNext')}
                  </motion.p>
                )}
              </AnimatePresence>
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
            <h2>{t('cameraAccess')}</h2>
            <p className="onboard-body">{t('cameraAccessBody')}</p>
            {cameraError && (
              <motion.div
                className="onboard-error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <strong>{t('cameraDenied')}</strong>
                <p>{cameraError}</p>
                <p className="onboard-hint">{t('cameraHint')}</p>
              </motion.div>
            )}
            <button className="primary" onClick={requestCamera}>
              {cameraError ? t('tryAgain') : t('allowCamera')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
