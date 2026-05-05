import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CameraView } from './components/CameraView'
import { PlaybackView } from './components/PlaybackView'
import { FullView } from './components/FullView'
import { Onboarding } from './components/Onboarding'
import { LogsView } from './components/LogsView'
import { DeadlineView } from './components/DeadlineView'
import { isOnboarded } from './lib/onboarding'
import { isPastDeadline, DEADLINE } from './lib/deadline'
import { AdminGate } from './components/admin/AdminGate'
import { AdminFrames } from './components/admin/AdminFrames'
import { AdminReports } from './components/admin/AdminReports'

function HomeGate() {
  const [ready, setReady] = useState(isOnboarded())
  const [past, setPast] = useState(isPastDeadline())

  // If the user keeps the tab open across the cutoff, flip to the deadline
  // screen the moment we cross it instead of waiting for a manual reload.
  useEffect(() => {
    if (past) return
    const ms = DEADLINE.getTime() - Date.now()
    if (ms <= 0) { setPast(true); return }
    // setTimeout caps at 2^31-1 ms (~24.8 days). The festival starts a few
    // days before the cutoff so we're well inside that range, but clamp
    // defensively just in case.
    const id = window.setTimeout(() => setPast(true), Math.min(ms, 2_000_000_000))
    return () => clearTimeout(id)
  }, [past])

  if (past) return <DeadlineView />
  if (!ready) return <Onboarding onDone={() => setReady(true)} />
  return <CameraView />
}

function RoutesContent() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/"                element={<HomeGate />} />
        <Route path="/play"            element={<PlaybackView />} />
        <Route path="/full"            element={<FullView />} />
        <Route path="/logs"            element={<LogsView />} />
        <Route path="/end"             element={<DeadlineView />} />
        <Route path="/admin"           element={<AdminGate><AdminFrames /></AdminGate>} />
        <Route path="/admin/reports"   element={<AdminGate><AdminReports /></AdminGate>} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export function AppRoutes() {
  return (
    <HashRouter>
      <RoutesContent />
    </HashRouter>
  )
}
