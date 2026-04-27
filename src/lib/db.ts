import { supabase, BUCKET } from './supabase'
import type { Frame } from './types'
import { getDeviceId } from './device'

// Retry helper for the capture path. Festival wifi is unreliable; a single
// transient failure shouldn't lose a user's frame. Caller decides if the
// operation is idempotent (uploads use upsert; inserts treat 23505 as ok).
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 800,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, baseMs * Math.pow(2, i)))
      }
    }
  }
  throw lastErr
}

export async function listFrames(limit = 5000): Promise<Frame[]> {
  const { data, error } = await supabase
    .from('frames')
    .select('*')
    .is('deleted_at', null)
    .order('seq', { ascending: true })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as Frame[]
}

// Latest N frames in ascending seq order. Used by CameraView and the
// onboarding preview so neither has to download the entire festival.
export async function listLatestFrames(n = 50): Promise<Frame[]> {
  const { data, error } = await supabase
    .from('frames')
    .select('*')
    .is('deleted_at', null)
    .order('seq', { ascending: false })
    .limit(n)

  if (error) throw error
  return ((data ?? []) as Frame[]).slice().reverse()
}

export async function countFrames(): Promise<number> {
  const { count, error } = await supabase
    .from('frames')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
  if (error) throw error
  return count ?? 0
}

export type FramePaths = { id: string; fullPath: string; thumbPath: string }

export function buildFramePaths(): FramePaths {
  const id = crypto.randomUUID()
  return {
    id,
    fullPath:  `frames/${id}.jpg`,
    thumbPath: `frames/${id}-thumb.jpg`,
  }
}

export type InsertFrameInput = {
  id: string
  capture: { width: number; height: number; bytes: number }
  fullPath: string
  thumbPath: string
  displayName: string
}

export async function insertFrameRow(i: InsertFrameInput): Promise<Frame> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('frames')
      .insert({
        id:            i.id,
        storage_path:  i.fullPath,
        thumb_path:    i.thumbPath,
        device_id:     getDeviceId(),
        display_name:  i.displayName,
        width:         i.capture.width,
        height:        i.capture.height,
        bytes:         i.capture.bytes,
      })
      .select('*')
      .single()

    if (error) {
      // 23505 = unique_violation. Means the previous attempt actually succeeded
      // and we just lost the response; fetch the row instead of erroring.
      if (error.code === '23505') {
        const { data: existing, error: fetchErr } = await supabase
          .from('frames').select('*').eq('id', i.id).single()
        if (fetchErr) throw fetchErr
        return existing as Frame
      }
      throw error
    }
    return data as Frame
  })
}

export async function uploadFrameBlobs(
  fullPath: string,
  thumbPath: string,
  full: Blob,
  thumb: Blob,
): Promise<void> {
  // upsert: true makes retries idempotent — same UUID re-uploaded just
  // overwrites the partial blob from the failed attempt.
  await withRetry(async () => {
    const [a, b] = await Promise.all([
      supabase.storage.from(BUCKET).upload(fullPath,  full,  { contentType: 'image/jpeg', upsert: true }),
      supabase.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: true }),
    ])
    if (a.error) throw a.error
    if (b.error) throw b.error
  })
}

export type FrameEvent =
  | { type: 'INSERT'; frame: Frame }
  | { type: 'UPDATE'; frame: Frame }

export function subscribeFrames(onEvent: (e: FrameEvent) => void) {
  const channel = supabase
    .channel('frames:global')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'frames' },
      payload => onEvent({ type: 'INSERT', frame: payload.new as Frame }),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'frames' },
      payload => onEvent({ type: 'UPDATE', frame: payload.new as Frame }),
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export async function reportFrame(frameId: string, reason: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    frame_id: frameId,
    reason: reason.slice(0, 500),
    reporter_device_id: getDeviceId(),
  })
  if (error) throw error
}

// ---------- admin ----------

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

export async function adminListFrames(includeDeleted: boolean, limit = 5000): Promise<Frame[]> {
  let q = supabase.from('frames').select('*').order('seq', { ascending: false }).limit(limit)
  if (!includeDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Frame[]
}

export async function softDeleteFrames(ids: string[]) {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('frames')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
}

export async function restoreFrames(ids: string[]) {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('frames')
    .update({ deleted_at: null })
    .in('id', ids)
  if (error) throw error
}
