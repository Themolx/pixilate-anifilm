#!/usr/bin/env node
// Download every full-quality frame from the festival into a local folder
// so the film editor can pull them into After Effects / DaVinci / ffmpeg.
//
// Usage:
//   npm run download-frames        (full quality, for the festival film)
//   npm run download-thumbs        (small thumbs, for quick previews)
//
// Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env.local (the same
// vars the app uses). Writes ./frames-export/frame-NNNN.jpg numbered
// sequentially by the seq column plus metadata.json with full row data so
// credits / timestamps / authors are recoverable.
//
// Idempotent — already-downloaded files are skipped, so you can re-run
// during the festival to incrementally pull new frames.

import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
  console.error('Run with: node --env-file=.env scripts/download-frames.mjs')
  process.exit(1)
}

const BUCKET = 'pixilate-frames'
const OUT = path.resolve('./frames-export')
const PARALLELISM = 8
// "thumb" downloads the small ~25KB previews, "full" downloads the
// high-quality originals you'll want for the film. Default is full.
const VARIANT = (process.argv.includes('--thumbs')) ? 'thumb' : 'full'

const sb = createClient(url, key)

async function listAllFrames() {
  const PAGE = 1000
  const HARD_STOP = 100_000
  const all = []
  let offset = 0
  while (offset < HARD_STOP) {
    const { data, error } = await sb
      .from('frames')
      .select('*')
      .is('deleted_at', null)
      .order('seq', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

function publicUrl(storagePath) {
  return sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

async function downloadOne(targetPath, sourceUrl) {
  if (existsSync(targetPath)) return { skipped: true }
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(targetPath, buf)
  return { skipped: false, bytes: buf.length }
}

async function run() {
  await mkdir(OUT, { recursive: true })
  console.log(`Listing frames from ${url} …`)
  const frames = await listAllFrames()
  console.log(`Found ${frames.length} frames. Variant: ${VARIANT}.`)

  if (frames.length === 0) {
    console.log('Nothing to download.')
    return
  }

  // Pad enough digits to cover the count with a little headroom so files
  // sort lexicographically the same way as numerically.
  const padLen = Math.max(4, String(frames.length).length)

  // Metadata sidecar: editor / archivist needs author + timestamp + ids.
  const meta = frames.map((f, i) => ({
    fileIndex: String(i + 1).padStart(padLen, '0'),
    seq: f.seq,
    id: f.id,
    display_name: f.display_name,
    created_at: f.created_at,
    width: f.width,
    height: f.height,
    bytes: f.bytes,
    storage_path: f.storage_path,
    thumb_path: f.thumb_path,
  }))
  const metaPath = path.join(OUT, 'metadata.json')
  await writeFile(metaPath, JSON.stringify(meta, null, 2))
  console.log(`Wrote ${metaPath}`)

  let done = 0, skipped = 0, failed = 0
  for (let i = 0; i < frames.length; i += PARALLELISM) {
    const batch = frames.slice(i, i + PARALLELISM)
    await Promise.all(batch.map(async (f, j) => {
      const idx = i + j
      const padded = String(idx + 1).padStart(padLen, '0')
      const filename = `frame-${padded}.jpg`
      const target = path.join(OUT, filename)
      const source = publicUrl(VARIANT === 'thumb' ? f.thumb_path : f.storage_path)
      try {
        const res = await downloadOne(target, source)
        if (res.skipped) {
          skipped++
          console.log(`[${idx + 1}/${frames.length}] ${filename} (already exists)`)
        } else {
          done++
          console.log(`[${idx + 1}/${frames.length}] ${filename} ${(res.bytes / 1024).toFixed(0)} KB`)
        }
      } catch (err) {
        failed++
        console.error(`[${idx + 1}/${frames.length}] ${filename} failed: ${err.message}`)
      }
    }))
  }

  console.log(`\nDone. Downloaded ${done}, skipped ${skipped}, failed ${failed}, total ${frames.length}.`)
  console.log(`Output: ${OUT}`)
  if (done > 0 || skipped > 0) {
    console.log(`\nQuick ffmpeg recipe (12 fps, lossless):`)
    console.log(`  ffmpeg -framerate 12 -i ${OUT}/frame-%0${padLen}d.jpg -c:v libx264 -pix_fmt yuv420p -crf 14 pixilate-anifilm-2026.mp4`)
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
