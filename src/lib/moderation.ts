// Client-side NSFW filter. Runs before upload so the blob never touches Supabase
// if it looks explicit. Fail-open on load/classify errors — staffer watching /admin
// is the backup defense.
//
// Library (nsfwjs/core) and tfjs load from jsdelivr at runtime (not bundled —
// avoids Vite eagerly shipping all 3 model variants as 30MB of chunks).
// Model weights are self-hosted under /public/nsfw-model so the festival isn't
// dependent on a third-party CDN for the hot path.

import type * as NSFWJS from 'nsfwjs'

type LoadFn = typeof NSFWJS.load
type Model = Awaited<ReturnType<LoadFn>>

const NSFWJS_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/+esm'

let modelPromise: Promise<Model> | null = null

export function loadModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const mod = (await import(/* @vite-ignore */ NSFWJS_CDN)) as { load: LoadFn }
      const base = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`
      return mod.load(`${base}nsfw-model/model.json`)
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
