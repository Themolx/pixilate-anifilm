import { motion } from 'framer-motion'
import { t } from '../lib/i18n'
import { rt } from '../lib/format'
import { BrushDeco } from './BrushDeco'

export function DeadlineView() {
  return (
    <motion.div
      className="onboarding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="onboard-step"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <BrushDeco count={3} />
        <h1>{t('deadlineTitle')}</h1>
        <p className="onboard-body">{rt(t('deadlineBody'))}</p>
        <p className="onboard-body onboard-hint">{t('deadlineFooter')}</p>
        <a
          href="https://instagram.com/anifilmpixilace"
          target="_blank"
          rel="noopener noreferrer"
          className="onboard-ig"
        >
          <span className="onboard-ig-label">{t('followUs')}</span>
          <span className="onboard-ig-handle">{t('instagramHandle')}</span>
        </a>
      </motion.div>
    </motion.div>
  )
}
