import { supabase, BUCKET } from './supabase'
import type { Frame } from './types'
import { getDeviceId } from './device'

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

  if (error) throw error
  return data as Frame
}

export async function uploadFrameBlobs(
  fullPath: string,
  thumbPath: string,
  full: Blob,
  thumb: Blob,
): Promise<void> {
  const [a, b] = await Promise.all([
    supabase.storage.from(BUCKET).upload(fullPath,  full,  { contentType: 'image/jpeg', upsert: false }),
    supabase.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: false }),
  ])
  if (a.error) throw a.error
  if (b.error) throw b.error
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
