// NSFW classification runs entirely in this worker so the main thread is never
// blocked by parsing nsfwjs + tfjs (~1MB of JS) or by the model classify pass.
// Main thread sends Blob in, gets predictions out via postMessage.

const NSFWJS_CDN = 'https://cdn.jsdelivr.net/npm/nsfwjs@4.2.1/+esm'
const TFJS_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/+esm'
const MODEL_KEY = 'indexeddb://pixilate-nsfw-v1'

type InitMsg = { type: 'init'; baseUrl: string }
type ClassifyMsg = { type: 'classify'; id: number; blob: Blob }
type Msg = InitMsg | ClassifyMsg

let modelPromise: Promise<unknown> | null = null
let baseUrl = '/'

async function getModel(): Promise<{ classify: (img: unknown) => Promise<Array<{ className: string; probability: number }>> }> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [nsfwMod, tfMod] = await Promise.all([
        import(/* @vite-ignore */ NSFWJS_CDN) as Promise<{ load: (url: string) => Promise<unknown>; NSFWJS: new (m: unknown) => unknown }>,
        import(/* @vite-ignore */ TFJS_CDN) as Promise<{ loadGraphModel: (url: string) => Promise<unknown> }>,
      ])
      const networkUrl = `${baseUrl}nsfw-model/model.json`
      try {
        const cached = await tfMod.loadGraphModel(MODEL_KEY)
        return new nsfwMod.NSFWJS(cached) as { classify: (img: unknown) => Promise<Array<{ className: string; probability: number }>> }
      } catch {
        // not in IDB yet, fall through
      }
      const model = await nsfwMod.load(networkUrl) as { classify: (img: unknown) => Promise<Array<{ className: string; probability: number }>>; model: { save: (k: string) => Promise<unknown> } }
      try { await model.model.save(MODEL_KEY) } catch { /* private browsing / quota */ }
      return model
    })()
  }
  return modelPromise as Promise<{ classify: (img: unknown) => Promise<Array<{ className: string; probability: number }>> }>
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data
  if (msg.type === 'init') {
    baseUrl = msg.baseUrl
    try {
      await getModel()
      ;(self as unknown as Worker).postMessage({ type: 'ready' })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  if (msg.type === 'classify') {
    try {
      const model = await getModel()
      const bitmap = await createImageBitmap(msg.blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      bitmap.close()
      const preds = await model.classify(imageData)
      ;(self as unknown as Worker).postMessage({ type: 'result', id: msg.id, preds })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ type: 'result', id: msg.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
