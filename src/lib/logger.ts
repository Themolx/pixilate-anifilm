export type LogLevel = 'info' | 'warn' | 'error'
export type LogTag = 'CAPTURE' | 'UPLOAD' | 'MODERATION' | 'REALTIME' | 'RATE_LIMIT' | 'ERROR' | 'SYSTEM'

export type LogEntry = {
  id: number
  ts: Date
  level: LogLevel
  tag: LogTag
  message: string
}

type Subscriber = (entry: LogEntry) => void

class LogStore {
  private entries: LogEntry[] = []
  private subscribers: Set<Subscriber> = new Set()
  private nextId = 0
  private readonly maxEntries = 200

  log(level: LogLevel, tag: LogTag, message: string) {
    const entry: LogEntry = {
      id: this.nextId++,
      ts: new Date(),
      level,
      tag,
      message,
    }

    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }

    this.subscribers.forEach(fn => fn(entry))
  }

  subscribe(fn: Subscriber) {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  getLogs(): LogEntry[] {
    return [...this.entries]
  }

  clear() {
    this.entries = []
    this.nextId = 0
  }
}

export const logger = new LogStore()
