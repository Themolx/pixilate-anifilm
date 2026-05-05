import { getLang } from './i18n'

// =============================================================================
// FESTIVAL TOPICS — Anifilm 2026, 5.–10. května 2026.
// Edit the cs / en strings for each day below. The date keys are matched
// against the user's local calendar day. Outside the festival window the app
// falls back to the first day's topic so nothing breaks if someone opens it
// the day before / after.
// =============================================================================

type Topic = { date: string; cs: string; en: string }

const TOPICS: Topic[] = [
  { date: '2026-05-05', cs: 'Výprava',    en: 'Journey' },
  { date: '2026-05-06', cs: 'Trojúhelník',          en: 'Triangle' },
  { date: '2026-05-07', cs: 'Setkání',     en: 'Get together' },
  { date: '2026-05-08', cs: 'Žížeň',           en: 'Craving' },
  { date: '2026-05-09', cs: 'Rozmanitost',         en: 'Variety' },
  { date: '2026-05-10', cs: 'Hora', en: 'Mountain' },
]

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getTodayTopic(): string {
  const lang = getLang()
  const today = todayKey()
  const match = TOPICS.find(t => t.date === today)
  if (match) return match[lang]
  // Outside the festival window: show the first day so the UI is never empty.
  return TOPICS[0][lang]
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
