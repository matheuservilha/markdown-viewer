import { useEffect, useState } from 'react'
import type { ThemeMode } from '~/app/settings'

export type Theme = 'light' | 'dark'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * Resolves the chosen mode against the system. Following the system means
 * following it live, so a machine that switches at sunset switches the app too.
 */
export function useResolvedTheme(mode: ThemeMode): Theme {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const theme: Theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return theme
}
