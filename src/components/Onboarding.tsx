import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markOnboarded, markCameraOk, setDisplayName, getDisplayName } from '../lib/onboarding'
import { listFrames } from '../lib/db'
import { framePublicUrl } from '../lib/supabase'

type Step = 'preview' | 'welcome' | 'camera' | 'name'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('preview')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [name, setName] = useState(getDisplayName() === 'Anonymous' ? '' : getDisplayName())
  const [previewFrames, setPreviewFrames] = useState<string[]>([])
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const animationIntervalRef = useRef<number | null>(null)

  // Load frames for preview animation
  useEffect(() => {
    ;(async () => {
      try {
        const frames = await listFrames(12)
        if (frames.length < 3) {
          setStep('welcome')
          return
        }
        const thumbUrls = frames
          .slice(-12)
          .map(f => framePublicUrl(f.thumb_path))
        setPreviewFrames(thumbUrls)
      } catch {
        setStep('welcome')
      }
    })()
  }, [])

  // Animation loop for preview
  useEffect(() => {
    if (step !== 'preview' || previewFrames.length === 0) return

    animationIntervalRef.current = window.setInterval(() => {
      setCurrentFrameIndex(prev => (prev + 1) % previewFrames.length)
    }, 1000 / 12)

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current)
    }
  }, [step, previewFrames])

  async function requestCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      stream.getTracks().forEach(t => t.stop())
      markCameraOk()
      setStep('name')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied'
      setCameraError(msg)
    }
  }

  function finish() {
    setDisplayName(name)
    markOnboarded()
    onDone()
  }

  function skipCamera() {
    setStep('name')
  }

  const stepVariants = {
    enter: { opacity: 0, y: 20 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  }

  return (
    <motion.div className="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <AnimatePresence mode="wait">
        {step === 'preview' && previewFrames.length > 0 && (
          <motion.div
            key="preview"
            className="onboard-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <h1 style={{ marginBottom: '12px', fontSize: '32px' }}>Pixilate</h1>
            <motion.div className="onboarding-animation">
              <motion.img
                key={currentFrameIndex}
                src={previewFrames[currentFrameIndex]}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.05 }}
              />
            </motion.div>
            <p className="onboard-tag">Live animation from the festival</p>
            <button
              className="primary"
              onClick={() => setStep('welcome')}
              style={{ marginTop: '12px' }}
            >
              Continue
            </button>
          </motion.div>
        )}

        {step === 'welcome' && (
          <motion.div
            key="welcome"
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
            <button className="primary" onClick={() => setStep('camera')}>
              Start
            </button>
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
            <h2>Camera access</h2>
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
            <button className="ghost" onClick={skipCamera}>
              Skip for now
            </button>
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
            <button className="primary" onClick={finish}>
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
