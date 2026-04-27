// Client-side NSFW filter. Runs before upload so the blob never touches Supabase
// if it looks explicit. Fail-open on load/classify errors — staffer watching /admin
// is the backup defense.
//
// nsfwjs and tfjs are loaded from jsdelivr at runtime so Vite doesn't ship the
// 3 model variants as 30MB of chunks. Model weights live under /public/nsfw-model.
//
// First visit downloads the model (~10MB) and saves it to IndexedDB. Subsequent
// visits load from IDB so users on slow internet don't re-download every time
// they open the app.

import type * as NSFWJS from 'nsfwjs'

type LoadFn = typeof NSFWJS.load
type Model = Awaited<ReturnType<LoadFn>>
type NSFWJSCtor = new (model: unknown, options?: unknown) => Model

const NSFWJS_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/+esm'
const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/+esm'
const MODEL_KEY = 'indexeddb://pixilate-nsfw-v1'

let modelPromise: Promise<Model> | null = null

export function loadModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [nsfwMod, tfMod] = await Promise.all([
        import(/* @vite-ignore */ NSFWJS_CDN) as Promise<{ load: LoadFn; NSFWJS: NSFWJSCtor }>,
        import(/* @vite-ignore */ TFJS_CDN) as Promise<typeof import('@tensorflow/tfjs')>,
      ])
      const base = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`
      const networkUrl = `${base}nsfw-model/model.json`

      // Fast path: model already in IndexedDB from a previous visit.
      try {
        const cached = await tfMod.loadGraphModel(MODEL_KEY)
        return new nsfwMod.NSFWJS(cached)
      } catch {
        // Not cached or IDB unavailable; fall through to network.
      }

      // Slow path: load from network, then persist to IDB for next time.
      const model = await nsfwMod.load(networkUrl)
      try {
        await (model.model as unknown as { save: (key: string) => Promise<unknown> }).save(MODEL_KEY)
      } catch {
        // Private browsing / quota / IDB blocked — model still works in memory.
      }
      return model
    })().catch(err => {
      modelPromise = null
      throw err
    })
  }
  return modelPromise
}

export type ModerationResult = {
  safe: boolean
  reason: string | null
  scores: Record<string, number>
}

const PORN_THRESHOLD = 0.5
const HENTAI_THRESHOLD = 0.5
const COMBINED_THRESHOLD = 0.6
const SEXY_THRESHOLD = 0.85

export async function classifyBlob(blob: Blob): Promise<ModerationResult> {
  const model = await loadModel()
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const preds = await model.classify(img)
    const scores: Record<string, number> = {}
    for (const p of preds) scores[p.className] = p.probability

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
  } finally {
    URL.revokeObjectURL(url)
  }
}
