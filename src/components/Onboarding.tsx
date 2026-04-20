import { useState } from 'react'
import { markOnboarded, markCameraOk, setDisplayName, getDisplayName } from '../lib/onboarding'

type Step = 'welcome' | 'camera' | 'name'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('welcome')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [name, setName] = useState(getDisplayName() === 'Anonymous' ? '' : getDisplayName())

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

  return (
    <div className="onboarding">
      {step === 'welcome' && (
        <div className="onboard-step">
          <h1>PIXILATE</h1>
          <p className="onboard-tag">Exquisite corpse, stop-motion.<br/>Anifilm 2026.</p>
          <p className="onboard-body">
            One shared animation for the whole festival.
            Add a frame, watch it live as others add theirs.
          </p>
          <button className="primary" onClick={() => setStep('camera')}>Start</button>
        </div>
      )}

      {step === 'camera' && (
        <div className="onboard-step">
          <h2>Camera access</h2>
          <p className="onboard-body">
            Pixilate needs your camera to capture frames.
            Photos go into the shared festival timeline.
          </p>
          {cameraError && (
            <div className="onboard-error">
              <strong>Couldn't access the camera.</strong>
              <p>{cameraError}</p>
              <p className="onboard-hint">
                iOS: Settings → Safari → Camera → Allow.
                Desktop: click the camera icon in the address bar and allow.
              </p>
            </div>
          )}
          <button className="primary" onClick={requestCamera}>
            {cameraError ? 'Try again' : 'Allow camera'}
          </button>
          <button className="ghost" onClick={() => setStep('name')}>Skip for now</button>
        </div>
      )}

      {step === 'name' && (
        <div className="onboard-step">
          <h2>What should we call you?</h2>
          <p className="onboard-body">Shown next to frames you capture. Optional.</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            autoFocus
          />
          <button className="primary" onClick={finish}>Continue</button>
        </div>
      )}
    </div>
  )
}
