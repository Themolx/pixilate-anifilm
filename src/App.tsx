import { ErrorBoundary } from './components/ErrorBoundary'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
      <div className="landscape-lock" aria-hidden="true">
        <div className="icon">↺</div>
        <h2>Please rotate to portrait</h2>
        <p>Pixilate is designed for vertical use. Rotate your device to continue.</p>
      </div>
    </ErrorBoundary>
  )
}
