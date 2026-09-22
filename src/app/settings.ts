/**
 * Reading settings.
 *
 * Almost every setting is a CSS variable, which is why changing one takes
 * effect while the person is still dragging the slider: nothing is rebuilt, the
 * browser just reflows. Read-only is the exception, because it is editor state
 * and not paint.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Side } from './dock-layout'

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
  /** Width of the outline and links panel, in px. Dragged, not typed. */
  infoWidth: number
  /** Whether the outline and links panel is showing. */
  infoPanel: boolean
  /** Whether the history at the foot of the sidebar is open. */
  recentsOpen: boolean
  /** Whether the tree shows the files this editor cannot open. */
  showAllFiles: boolean
  themeMode: ThemeMode
  readOnly: boolean
  /** Whether a pause in the typing writes the file by itself. */
  autosave: boolean
  /** Whether the pinned notes sit on the edge of the screen. */
  dock: boolean
  /** Which edge they sit on. */
  dockSide: Side
  /**
   * How solid a note that floats over everything else is, from 0 to 1.
   *
   * A note pinned open sits on top of the work it is about. Letting a little
   * of that work through is what stops it reading as a hole punched in the
   * screen; letting too much through is what stops it being readable.
   */
  noteOpacity: number
}

export const DEFAULTS: Settings = {
  measurePx: 1024,
  fontSize: 15.5,
  lineHeight: 1.7,
  bodyFont: 'sans',
  uiScale: 1.12,
  sidebarWidth: 216,
  infoWidth: 240,
  infoPanel: false,
  recentsOpen: false,
  showAllFiles: false,
  themeMode: 'system',
  readOnly: false,
  // Off: the file is written when the person asks, with Mod-S. Writing behind
  // somebody's back is the kind of help that is only welcome when it was asked
  // for.
  autosave: false,
  // On, but empty: with nothing pinned there is one square on the edge, the
  // one that writes a note, and it is the only thing that shows the feature
  // exists.
  dock: true,
  // The right, because that is where the scrollbar already is and where the
  // text is not.
  dockSide: 'right',
  noteOpacity: 0.94,
}

export const LIMITS = {
  measurePx: { min: 520, max: 1600, step: 8 },
  fontSize: { min: 12, max: 22, step: 0.5 },
  lineHeight: { min: 1.3, max: 2.2, step: 0.05 },
  uiScale: { min: 0.9, max: 1.35, step: 0.05 },
  sidebarWidth: { min: 170, max: 620, step: 1 },
  infoWidth: { min: 180, max: 520, step: 1 },
  // Never fully see-through: a note you can read the desktop through is not a
  // note, and below about three quarters the text starts fighting whatever is
  // behind it.
  noteOpacity: { min: 0.72, max: 1, step: 0.01 },
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

/**
 * The settings as they are on disk.
 *
 * Exported because the two panels need to paint themselves with the same
 * numbers as the app without joining in the writing of them: they read, they
 * apply, and they never store. Storage is shared between the windows, so a
 * panel that wrote back a copy it read a minute ago would quietly undo a
 * setting somebody had just changed in the app.
 */
export function loadSettings(): Settings {
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

export function applySettings(settings: Settings): void {
  const root = document.documentElement.style
  root.setProperty('--measure', settings.measurePx + 'px')
  root.setProperty('--ui-scale', String(settings.uiScale))
  root.setProperty('--sidebar-width', settings.sidebarWidth + 'px')
  root.setProperty('--info-width', settings.infoWidth + 'px')
  root.setProperty('--font-size', settings.fontSize + 'px')
  root.setProperty('--line-height', String(settings.lineHeight))
  root.setProperty('--font-body', FONT_STACKS[settings.bodyFont])
  root.setProperty('--font-heading', FONT_STACKS[settings.bodyFont])
  root.setProperty('--note-opacity', String(settings.noteOpacity))
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    applySettings(settings)
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
