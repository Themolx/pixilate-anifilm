export type Frame = {
  id: string
  seq: number
  storage_path: string
  thumb_path: string
  device_id: string
  display_name: string | null
  width: number
  height: number
  bytes: number
  created_at: string
  deleted_at: string | null
}

export type Report = {
  id: string
  frame_id: string
  reason: string
  reporter_device_id: string
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export type Admin = {
  user_id: string
  email: string
  added_at: string
}
