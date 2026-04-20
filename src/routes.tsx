import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CameraView } from './components/CameraView'
import { PlaybackView } from './components/PlaybackView'
import { Onboarding } from './components/Onboarding'
import { isOnboarded } from './lib/onboarding'
import { AdminGate } from './components/admin/AdminGate'
import { AdminFrames } from './components/admin/AdminFrames'
import { AdminReports } from './components/admin/AdminReports'

function HomeGate() {
  const [ready, setReady] = useState(isOnboarded())
  if (!ready) return <Onboarding onDone={() => setReady(true)} />
  return <CameraView />
}

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/"                element={<HomeGate />} />
        <Route path="/play"            element={<PlaybackView />} />
        <Route path="/admin"           element={<AdminGate><AdminFrames /></AdminGate>} />
        <Route path="/admin/reports"   element={<AdminGate><AdminReports /></AdminGate>} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
