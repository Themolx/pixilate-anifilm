import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { logger, type LogEntry } from '../lib/logger'

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLogs(logger.getLogs())

    const unsub = logger.subscribe(entry => {
      setLogs(prev => [...prev, entry])
    })

    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight
      }, 0)
    }
  }, [logs])

  function handleClear() {
    if (confirm('Clear all logs?')) {
      logger.clear()
      setLogs([])
    }
  }

  return (
    <div className="logs-view">
      <div className="logs-header">
        <h2>Console</h2>
        <button onClick={handleClear}>Clear</button>
      </div>

      {logs.length === 0 ? (
        <div className="logs-empty">No logs yet</div>
      ) : (
        <div className="logs-container" ref={containerRef}>
          {logs.map(entry => (
            <div key={entry.id} className="log-entry">
              <div className="log-time">{formatTime(entry.ts)}</div>
              <div className={`log-tag ${entry.tag}`}>{entry.tag}</div>
              <div className="log-message">{entry.message}</div>
            </div>
          ))}
        </div>
      )}

      <div className="logs-footer">
        <Link to="/">← Back to camera</Link>
      </div>
    </div>
  )
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}
