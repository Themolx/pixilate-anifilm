import { getLang } from './i18n'

// Simple deterministic rotation: day-of-year indexes into the topic list for
// the current language. Each day has one topic, same for everyone.
const TOPICS = {
  en: [
    'Motion with your hands',
    'A loop',
    'Something small',
    'Morning light',
    'A surprise',
    'Collaboration',
    'A face',
    'An object in motion',
    'Shadow play',
    'Transformation',
    'A festival moment',
    'Someone you met',
  ],
  cs: [
    'Pohyb rukama',
    'Smyčka',
    'Něco malého',
    'Ranní světlo',
    'Překvapení',
    'Spolupráce',
    'Obličej',
    'Předmět v pohybu',
    'Stíny',
    'Proměna',
    'Festivalový moment',
    'Někdo, koho jsi potkal',
  ],
} as const

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayIndex(): number {
  const d = new Date()
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / 86400000)
}

export function getTodayTopic(): string {
  const list = TOPICS[getLang()] ?? TOPICS.en
  return list[dayIndex() % list.length]
}

const SEEN_PREFIX = 'pixilate:daily:'

export function hasSeenTodayTopic(): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + todayKey()) === 'seen'
  } catch {
    return false
  }
}

export function markTodayTopicSeen(): void {
  try {
    localStorage.setItem(SEEN_PREFIX + todayKey(), 'seen')
  } catch {
    // ignore storage errors
  }
}
