import { ErrorBoundary } from './components/ErrorBoundary'
import { AppRoutes } from './routes'
import { t } from './lib/i18n'
import { rt } from './lib/format'

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
      <div className="landscape-lock" aria-hidden="true">
        <div className="icon">↺</div>
        <h2>{t('landscapeTitle')}</h2>
        <p>{t('landscapeBody')}</p>
        <p className="landscape-tip">{rt(t('landscapeLockTip'))}</p>
      </div>
    </ErrorBoundary>
  )
}
