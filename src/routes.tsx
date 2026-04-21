import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CameraView } from './components/CameraView'
import { PlaybackView } from './components/PlaybackView'
import { Onboarding } from './components/Onboarding'
import { LogsView } from './components/LogsView'
import { isOnboarded } from './lib/onboarding'
import { AdminGate } from './components/admin/AdminGate'
import { AdminFrames } from './components/admin/AdminFrames'
import { AdminReports } from './components/admin/AdminReports'

function HomeGate() {
  const [ready, setReady] = useState(isOnboarded())
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
        <Route path="/logs"            element={<LogsView />} />
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
