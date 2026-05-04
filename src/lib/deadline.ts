// Festival cutoff. After this moment in the user's local time the app
// stops accepting captures and shows DeadlineView instead. Editable here
// in one place; everything else reads isPastDeadline().

export const DEADLINE = new Date('2026-05-10T15:00:00')

export function isPastDeadline(now: Date = new Date()): boolean {
  return now.getTime() >= DEADLINE.getTime()
}
