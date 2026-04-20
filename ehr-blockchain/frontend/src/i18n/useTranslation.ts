import { useSyncExternalStore } from 'react'
import { getLocale, onLocaleChange, setLocale, t } from './translations'

/**
 * EXT-7: React hook that re-renders when the locale changes.
 *
 * Usage:
 *   const { t, locale, setLocale } = useTranslation()
 *   <span>{t('Dashboard')}</span>
 */
export function useTranslation() {
  const locale = useSyncExternalStore(
    (cb) => onLocaleChange(cb),
    () => getLocale(),
    () => getLocale(),
  )
  return { t, locale, setLocale }
}
