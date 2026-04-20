import { useEffect, useState } from 'react'
import { supabase, framePublicUrl } from '../../lib/supabase'
import { softDeleteFrames } from '../../lib/db'
import type { Report, Frame } from '../../lib/types'

type Joined = Report & { frame?: Frame | null }

export function AdminReports() {
  const [rows, setRows] = useState<Joined[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      let q = supabase.from('reports').select('*, frame:frame_id(*)').order('created_at', { ascending: false }).limit(200)
      if (!showResolved) q = q.is('resolved_at', null)
      const { data, error } = await q
      if (error) throw error
      setRows((data ?? []) as Joined[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [showResolved])

  async function resolve(r: Joined) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('reports').update({
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
    }).eq('id', r.id)
    await refresh()
  }

  async function resolveAndDelete(r: Joined) {
    if (!r.frame) return
    await softDeleteFrames([r.frame.id])
    await resolve(r)
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h2>Reports ({rows.length})</h2>
        <label>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
          />
          Include resolved
        </label>
        <button className="ghost" onClick={refresh}>Refresh</button>
      </div>

      {loading && <div className="loading">Loading…</div>}

      <div className="report-list">
        {rows.map(r => (
          <div key={r.id} className={`report-item ${r.resolved_at ? 'resolved' : ''}`}>
            {r.frame ? (
              <img
                className="report-thumb"
                src={framePublicUrl(r.frame.thumb_path)}
                alt=""
                loading="lazy"
              />
            ) : (
              <div className="report-thumb missing">?</div>
            )}
            <div className="report-body">
              <div className="report-reason">{r.reason}</div>
              <div className="muted">
                {new Date(r.created_at).toLocaleString()}
                {r.frame ? ` · frame #${r.frame.seq}` : ''}
                {r.resolved_at ? ` · resolved ${new Date(r.resolved_at).toLocaleString()}` : ''}
              </div>
            </div>
            {!r.resolved_at && (
              <div className="report-actions">
                <button className="danger" onClick={() => resolveAndDelete(r)}>Delete frame + resolve</button>
                <button className="ghost" onClick={() => resolve(r)}>Dismiss</button>
              </div>
            )}
          </div>
        ))}
        {!loading && rows.length === 0 && <div className="empty">No reports.</div>}
      </div>
    </div>
  )
}
