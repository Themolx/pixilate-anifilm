import { useEffect, useMemo, useState } from 'react'
import {
  adminListFrames,
  restoreFrames,
  softDeleteFrames,
} from '../../lib/db'
import { framePublicUrl } from '../../lib/supabase'
import type { Frame } from '../../lib/types'

export function AdminFrames() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeDeleted, setIncludeDeleted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<Frame | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      setFrames(await adminListFrames(includeDeleted))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [includeDeleted])

  const selectedArr = useMemo(() => [...selected], [selected])

  function toggle(id: string, e: React.MouseEvent) {
    const next = new Set(selected)
    if (e.shiftKey && selected.size > 0) {
      const ids = frames.map(f => f.id)
      const lastSel = [...selected][selected.size - 1]
      const a = ids.indexOf(lastSel)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        for (let i = lo; i <= hi; i++) next.add(ids[i])
      }
    } else {
      if (next.has(id)) next.delete(id)
      else next.add(id)
    }
    setSelected(next)
  }

  async function bulkDelete() {
    if (selectedArr.length === 0) return
    if (!confirm(`Soft-delete ${selectedArr.length} frame(s)?`)) return
    await softDeleteFrames(selectedArr)
    setSelected(new Set())
    await refresh()
  }

  async function bulkRestore() {
    if (selectedArr.length === 0) return
    await restoreFrames(selectedArr)
    setSelected(new Set())
    await refresh()
  }

  const activeCount = frames.filter(f => !f.deleted_at).length

  return (
    <div>
      <div className="admin-toolbar">
        <h2>Frames</h2>
        <span className="muted">{activeCount} active · {frames.length} shown</span>
        <label>
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={e => setIncludeDeleted(e.target.checked)}
          />
          Include deleted
        </label>
        <button className="ghost" onClick={refresh}>Refresh</button>
      </div>

      <div className="admin-bulk">
        <span>{selectedArr.length} selected</span>
        <button className="danger" disabled={selectedArr.length === 0} onClick={bulkDelete}>Delete</button>
        <button className="ghost"  disabled={selectedArr.length === 0} onClick={bulkRestore}>Restore</button>
        <button className="ghost"  disabled={selectedArr.length === 0} onClick={() => setSelected(new Set())}>Clear</button>
      </div>

      {loading && <div className="loading">Loading…</div>}

      <div className="admin-grid">
        {frames.map(f => {
          const isSel = selected.has(f.id)
          return (
            <div
              key={f.id}
              className={`admin-tile ${isSel ? 'selected' : ''} ${f.deleted_at ? 'deleted' : ''}`}
              onClick={e => toggle(f.id, e)}
              onDoubleClick={() => setLightbox(f)}
            >
              <img src={framePublicUrl(f.thumb_path)} loading="lazy" alt="" />
              <div className="admin-tile-meta">
                #{f.seq}{f.display_name ? ` · ${f.display_name}` : ''}
              </div>
            </div>
          )
        })}
        {!loading && frames.length === 0 && <div className="empty">No frames.</div>}
      </div>

      {lightbox && (
        <div className="admin-lightbox" onClick={() => setLightbox(null)}>
          <img src={framePublicUrl(lightbox.storage_path)} alt="" />
          <div className="admin-lightbox-meta">
            #{lightbox.seq} · {lightbox.width}×{lightbox.height} · {Math.round(lightbox.bytes / 1024)}kB
            {lightbox.display_name ? ` · ${lightbox.display_name}` : ''}
            {lightbox.deleted_at ? ' · deleted' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
