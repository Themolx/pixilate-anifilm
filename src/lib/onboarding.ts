const ONBOARDED = 'pixilate_onboarded_v1'
const DISPLAY_NAME = 'pixilate_display_name'
const CAMERA_OK = 'pixilate_camera_ok'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* blocked */ }
}

export function isOnboarded(): boolean {
  return safeGet(ONBOARDED) === '1'
}

export function markOnboarded() {
  safeSet(ONBOARDED, '1')
}

export function getDisplayName(): string {
  const n = safeGet(DISPLAY_NAME)
  return n && n.length > 0 ? n : 'Anonymous'
}

export function setDisplayName(name: string) {
  const cleaned = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 24)
  safeSet(DISPLAY_NAME, cleaned || 'Anonymous')
}

export function markCameraOk() {
  safeSet(CAMERA_OK, '1')
}

export function cameraPrimed(): boolean {
  return safeGet(CAMERA_OK) === '1'
}
