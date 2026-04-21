// Capture a full JPEG + a ~240px-wide thumbnail from a playing <video>.
// Re-encodes via canvas so EXIF is stripped on the way out.

const FULL_MAX_WIDTH = 1280
const THUMB_WIDTH = 240
const FULL_QUALITY = 0.82
const THUMB_QUALITY = 0.75

export type Capture = {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    )
  })
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number, targetW: number) {
  const scale = Math.min(1, targetW / sw)
  let w = Math.round(sw * scale)
  let h = Math.round(sh * scale)

  // Enforce 9:16 aspect ratio (portrait)
  const targetRatio = 9 / 16
  const currentRatio = w / h
  if (currentRatio > targetRatio) {
    // Too wide, constrain width
    w = Math.round(h * targetRatio)
  } else if (currentRatio < targetRatio) {
    // Too tall, constrain height
    h = Math.round(w / targetRatio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingQuality = 'high'

  // Center crop from source
  const sx = (sw - (sw * w / w)) / 2
  const sy = (sh - (sh * h / h)) / 2
  ctx.drawImage(source, sx, sy, Math.round(sw * w / w), Math.round(sh * h / h), 0, 0, w, h)
  return canvas
}

export async function captureFrame(video: HTMLVideoElement): Promise<Capture> {
  const sw = video.videoWidth
  const sh = video.videoHeight
  if (!sw || !sh) throw new Error('video not ready')

  const fullCanvas = drawScaled(video, sw, sh, FULL_MAX_WIDTH)
  const thumbCanvas = drawScaled(fullCanvas, fullCanvas.width, fullCanvas.height, THUMB_WIDTH)

  const [full, thumb] = await Promise.all([
    toBlob(fullCanvas, FULL_QUALITY),
    toBlob(thumbCanvas, THUMB_QUALITY),
  ])

  return { full, thumb, width: fullCanvas.width, height: fullCanvas.height }
}
