import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markOnboarded, markCameraOk, setDisplayName, getDisplayName } from '../lib/onboarding'
import { listFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'
import { logger } from '../lib/logger'
import { getDeviceId } from '../lib/device'
import { t } from '../lib/i18n'

type Step = 'start' | 'name' | 'preview' | 'camera'

const PREVIEW_FPS = 6
const PREVIEW_FRAMES = 24

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('start')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [name, setName] = useState(getDisplayName() === 'Anonymous' ? '' : getDisplayName())
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewReady, setPreviewReady] = useState(false)
  const previewIntervalRef = useRef<number | null>(null)

  const deviceId = getDeviceId()

  // Fetch + preload last N frames — SAME source + slice as the main rewind
  // button: all frames (ASC), take the last PREVIEW_FRAMES. listFrames returns
  // ASC by seq; we must slice the TAIL, not reverse the first N.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await listFrames()
        if (!alive) return
        const tail = rows.slice(-PREVIEW_FRAMES)
        const urls = tail.map(f => framePublicUrl(f.storage_path))

        if (urls.length < 3) {
          setPreviewFrames([])
          setPreviewReady(true)
          logger.log('info', 'SYSTEM', `Onboarding: only ${urls.length} frames, skipping preview`)
          return
        }

        await Promise.all(
          urls.map(
            url =>
              new Promise<void>(resolve => {
                const img = new Image()
                img.onload = () => resolve()
                img.onerror = () => resolve()
                img.src = url
              }),
          ),
        )
        if (!alive) return
        setPreviewFrames(urls)
        setPreviewReady(true)
        logger.log('info', 'SYSTEM', `Onboarding: ${urls.length} preview frames preloaded`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.log('error', 'ERROR', `Onboarding preview fetch failed: ${msg}`)
        setPreviewFrames([])
        setPreviewReady(true)
      }
    })()
    return () => { alive = false }
  }, [])

  // Play the preview exactly like the main rewind button: iterate once at 6fps.
  useEffect(() => {
    if (step !== 'preview') return
    if (!previewReady) return
    if (previewFrames.length === 0) return

    let frameIdx = 0
    setPreviewIndex(0)
    previewIntervalRef.current = window.setInterval(() => {
      frameIdx++
      setPreviewIndex(frameIdx)
      if (frameIdx >= previewFrames.length - 1) {
        if (previewIntervalRef.current) clearInterval(previewIntervalRef.current)
        previewIntervalRef.current = null
      }
    }, 1000 / PREVIEW_FPS)

    return () => {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current)
      previewIntervalRef.current = null
    }
  }, [step, previewReady, previewFrames])

  const advanceFromPreview = () => {
    if (step !== 'preview') return
    if (previewIntervalRef.current) clearInterval(previewIntervalRef.current)
    previewIntervalRef.current = null
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

  // Preview step: full-screen player matching the main rewind-2s UX.
  if (step === 'preview') {
    return (
      <motion.div
        className="preview-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={advanceFromPreview}
        style={{ position: 'fixed', inset: 0, zIndex: 50, cursor: 'pointer' }}
      >
        {!previewReady ? (
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
            {t('loadingPreview')}
          </div>
        ) : previewFrames.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: '#fff', textAlign: 'center', padding: 24 }}>
            <h2 style={{ fontSize: 22 }}>{t('latestAnimation')}</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
              {t('latestAnimationSub')}
            </p>
            <button className="primary" onClick={(e) => { e.stopPropagation(); advanceFromPreview() }}>
              {t('continue')}
            </button>
          </div>
        ) : (
          <>
            <img
              src={previewFrames[previewIndex]}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
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
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                pointerEvents: 'none',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2 }}>
                {t('latestAnimation')}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                {t('latestAnimationSub')}
              </span>
            </div>
          </>
        )}
      </motion.div>
    )
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
            <p className="onboard-body onboard-hint">{t('limitsHint')}</p>
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
            <p className="onboard-body">
              {t('nameHint')} <strong>{t('nameHintOptional')}</strong>
            </p>
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
            <p className="onboard-body onboard-hint">{t('publicNotice')}</p>
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
