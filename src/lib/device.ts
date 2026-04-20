const KEY = 'pixilate_device_id_v1'

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && existing.length >= 8) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    // localStorage blocked (iOS private). Stable within the tab only.
    const w = window as unknown as { __pixilate_fallback_id?: string }
    if (!w.__pixilate_fallback_id) w.__pixilate_fallback_id = crypto.randomUUID()
    return w.__pixilate_fallback_id
  }
}
