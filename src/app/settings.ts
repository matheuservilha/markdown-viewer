/**
 * Reading settings.
 *
 * Almost every setting is a CSS variable, which is why changing one takes
 * effect while the person is still dragging the slider: nothing is rebuilt, the
 * browser just reflows. Read-only is the exception, because it is editor state
 * and not paint.
 */

import { useCallback, useEffect, useState } from 'react'

export type BodyFont = 'sans' | 'serif' | 'mono'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  /** Width of the reading column, in px. */
  measurePx: number
  /** Body size, in px. */
  fontSize: number
  lineHeight: number
  bodyFont: BodyFont
  /** Scale of the interface around the editor, as a multiplier. */
  uiScale: number
  /** Width of the file tree, in px. Dragged, not typed. */
  sidebarWidth: number
  themeMode: ThemeMode
  readOnly: boolean
}

export const DEFAULTS: Settings = {
  measurePx: 1024,
  fontSize: 15.5,
  lineHeight: 1.7,
  bodyFont: 'sans',
  uiScale: 1.12,
  sidebarWidth: 216,
  themeMode: 'system',
  readOnly: false,
}

export const LIMITS = {
  measurePx: { min: 520, max: 1600, step: 8 },
  fontSize: { min: 12, max: 22, step: 0.5 },
  lineHeight: { min: 1.3, max: 2.2, step: 0.05 },
  uiScale: { min: 0.9, max: 1.35, step: 0.05 },
  sidebarWidth: { min: 170, max: 620, step: 1 },
} as const

const FONT_STACKS: Record<BodyFont, string> = {
  sans: 'var(--font-ui)',
  serif: "'Iowan Old Style', Palatino, Georgia, ui-serif, serif",
  mono: 'var(--font-mono)',
}

export const FONT_LABELS: Record<BodyFont, string> = {
  sans: 'Sans',
  serif: 'Serifa',
  mono: 'Mono',
}

const STORAGE_KEY = 'markdown-viewer.settings'

function load(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULTS
    // Unknown or missing keys fall back, so an old stored shape cannot break
    // the app after a setting is renamed.
    return { ...DEFAULTS, ...(JSON.parse(stored) as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

function apply(settings: Settings): void {
  const root = document.documentElement.style
  root.setProperty('--measure', settings.measurePx + 'px')
  root.setProperty('--ui-scale', String(settings.uiScale))
  root.setProperty('--sidebar-width', settings.sidebarWidth + 'px')
  root.setProperty('--font-size', settings.fontSize + 'px')
  root.setProperty('--line-height', String(settings.lineHeight))
  root.setProperty('--font-body', FONT_STACKS[settings.bodyFont])
  root.setProperty('--font-heading', FONT_STACKS[settings.bodyFont])
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    apply(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // A browser with storage blocked still gets the settings, just not the
      // memory of them.
    }
  }, [settings])

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const reset = useCallback(() => setSettings(DEFAULTS), [])

  return { settings, update, reset }
}
