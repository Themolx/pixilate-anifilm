// Capture a full JPEG + a ~240px-wide thumbnail from a playing <video>.
// Re-encodes via canvas so EXIF is stripped on the way out.

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

function drawCropped(source: CanvasImageSource, sw: number, sh: number, isThumbnail: boolean) {
  // Always save full 9:16 frame. Zoom is display-only (like animation software):
  // the stored file is immutable so live view and onion skin always reference
  // the same underlying pixels.
  const targetRatio = 9 / 16
  const sourceRatio = sw / sh

  let cropW = sw
  let cropH = sh

  if (sourceRatio > targetRatio) {
    cropW = sh * targetRatio
  } else if (sourceRatio < targetRatio) {
    cropH = sw / targetRatio
  }

  const sx = (sw - cropW) / 2
  const sy = (sh - cropH) / 2

  // Use full resolution for full image, scaled down for thumbnail only
  let w = Math.round(cropW)
  let h = Math.round(cropH)

  if (isThumbnail) {
    const scale = Math.min(1, THUMB_WIDTH / w)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingQuality = 'high'

  // Draw center-cropped source
  ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, w, h)
  return canvas
}

export async function captureFrame(video: HTMLVideoElement): Promise<Capture> {
  const sw = video.videoWidth
  const sh = video.videoHeight
  if (!sw || !sh) throw new Error('video not ready')

  const fullCanvas = drawCropped(video, sw, sh, false)
  const thumbCanvas = drawCropped(video, sw, sh, true)

  const [full, thumb] = await Promise.all([
    toBlob(fullCanvas, FULL_QUALITY),
    toBlob(thumbCanvas, THUMB_QUALITY),
  ])

  return { full, thumb, width: fullCanvas.width, height: fullCanvas.height }
}
