// Public API for NSFW moderation. All real work happens in moderation.worker.ts
// so parsing nsfwjs + tfjs and running classification never blocks the main
// thread. This is what keeps onboarding + camera UI responsive on fresh
// devices that don't have the JS in HTTP cache.

export type ModerationResult = {
  safe: boolean
  reason: string | null
  scores: Record<string, number>
}

const PORN_THRESHOLD = 0.5
const HENTAI_THRESHOLD = 0.5
const COMBINED_THRESHOLD = 0.6
const SEXY_THRESHOLD = 0.85

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (msg: { preds?: Array<{ className: string; probability: number }>; error?: string }) => void>()
let initPromise: Promise<void> | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./moderation.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; id?: number; preds?: Array<{ className: string; probability: number }>; error?: string }
      if (msg.type === 'result' && typeof msg.id === 'number') {
        const cb = pending.get(msg.id)
        if (cb) {
          pending.delete(msg.id)
          cb({ preds: msg.preds, error: msg.error })
        }
      }
    }
    worker.onerror = (e: ErrorEvent) => {
      // Reject anything in flight so callers don't hang forever.
      for (const cb of pending.values()) cb({ error: e.message || 'worker error' })
      pending.clear()
      initPromise = null
    }
  }
  return worker
}

export function loadModel(): Promise<void> {
  if (!initPromise) {
    const w = getWorker()
    initPromise = new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data as { type: string; error?: string }
        if (msg.type === 'ready') {
          w.removeEventListener('message', handler)
          resolve()
        } else if (msg.type === 'error') {
          w.removeEventListener('message', handler)
          initPromise = null
          reject(new Error(msg.error ?? 'model load failed'))
        }
      }
      w.addEventListener('message', handler)
      w.postMessage({ type: 'init', baseUrl })
    })
  }
  return initPromise
}

export async function classifyBlob(blob: Blob): Promise<ModerationResult> {
  const w = getWorker()
  const id = nextId++
  const result = await new Promise<{ preds?: Array<{ className: string; probability: number }>; error?: string }>(resolve => {
    pending.set(id, resolve)
    w.postMessage({ type: 'classify', id, blob })
  })

  if (result.error || !result.preds) {
    // Fail-open: a worker / model failure shouldn't block legitimate captures.
    // Admin moderation in /admin/reports is the backup defense.
    return { safe: true, reason: null, scores: {} }
  }

  const scores: Record<string, number> = {}
  for (const p of result.preds) scores[p.className] = p.probability

  const porn = scores.Porn ?? 0
  const hentai = scores.Hentai ?? 0
  const sexy = scores.Sexy ?? 0

  if (porn >= PORN_THRESHOLD || hentai >= HENTAI_THRESHOLD || porn + hentai >= COMBINED_THRESHOLD) {
    return { safe: false, reason: 'Explicit content blocked', scores }
  }
  if (sexy >= SEXY_THRESHOLD) {
    return { safe: false, reason: 'Inappropriate content blocked', scores }
  }
  return { safe: true, reason: null, scores }
}
