import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { isCurrentUserAdmin } from '../../lib/db'

type Status = 'loading' | 'signed_out' | 'not_admin' | 'ok'

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  async function refresh() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setStatus('signed_out'); setUserEmail(null); return }
    setUserEmail(session.user.email ?? null)
    const admin = await isCurrentUserAdmin()
    setStatus(admin ? 'ok' : 'not_admin')
  }

  useEffect(() => {
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh() })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  async function sendLink() {
    setError(null)
    const redirect = `${location.origin}${import.meta.env.BASE_URL}#/admin`
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect },
    })
    if (err) setError(err.message)
    else setSent(true)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (status === 'loading') return <div className="loading">Loading…</div>

  if (status === 'signed_out') {
    return (
      <div className="admin-gate">
        <h1>Pixilate Admin</h1>
        {sent ? (
          <div className="admin-sent">
            <p>Magic link sent to <strong>{email}</strong>.</p>
            <p>Check your inbox, then return here.</p>
            <button className="ghost" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
            />
            {error && <div className="picker-error">{error}</div>}
            <button className="primary" onClick={sendLink} disabled={!email.includes('@')}>
              Send magic link
            </button>
            <Link to="/" className="admin-link-back">← Back to Pixilate</Link>
          </>
        )}
      </div>
    )
  }

  if (status === 'not_admin') {
    return (
      <div className="admin-gate">
        <h1>Not authorized</h1>
        <p className="picker-sub">
          Signed in as <strong>{userEmail}</strong> but this account isn't in the admins list.
        </p>
        <button className="ghost" onClick={signOut}>Sign out</button>
        <Link to="/" className="admin-link-back">← Back to Pixilate</Link>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link to="/admin" className="admin-logo">Pixilate Admin</Link>
        <nav>
          <Link to="/admin">Frames</Link>
          <Link to="/admin/reports">Reports</Link>
          <Link to="/">App ↗</Link>
          <button className="admin-signout" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  )
}
