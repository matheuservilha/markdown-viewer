/**
 * The two windows that are not the app: the dock on the edge of the screen and
 * the note that floats beside it.
 *
 * Everything here is desktop only. In a browser there is no second window to
 * place, so each call is a no-op and the interface above simply never offers
 * the dock.
 */

import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from '.'
import type { Rect } from '~/app/dock-layout'

export type PanelLabel = 'dock' | 'peek' | 'note'

/** The usable part of the screen the app is on, in that screen's CSS pixels. */
export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/**
 * How long the answer is reused for.
 *
 * Asking which monitor the app is on crosses to the main thread of the window
 * system, and the panels ask on every move of the pointer. A screen does not
 * change size between two hovers; a couple of seconds is short enough to
 * follow the app onto another monitor and long enough that opening the list
 * and resting on a row is one question rather than three.
 */
const AREA_TTL = 2000

let cachedArea: { at: number; value: WorkArea } | null = null

export async function workArea(fresh = false): Promise<WorkArea | null> {
  if (!isDesktop()) return null
  if (!fresh && cachedArea && Date.now() - cachedArea.at < AREA_TTL) return cachedArea.value
  try {
    const value = await invoke<WorkArea>('work_area')
    cachedArea = { at: Date.now(), value }
    return value
  } catch {
    // A screen the system will not describe is a screen we do not place
    // panels on, which is better than placing them at a guess.
    return null
  }
}

/** Opens the panel if it is not open yet, and puts it exactly here. */
export async function placePanel(
  label: PanelLabel,
  rect: Rect,
  options: { focus?: boolean } = {},
): Promise<void> {
  if (!isDesktop()) return
  await invoke('panel_place', {
    label,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    focus: options.focus ?? false,
  })
}

/**
 * Watches the pointer against these rectangles, and says which one it is over.
 *
 * The tabs cannot notice the pointer themselves. On macOS a window is only
 * sent mouse-moved events while its application is the active one, and this
 * one is on top of everybody else's work precisely so that it never has to be.
 * The first click on another app would end the hovering for good.
 *
 * So the system is asked instead, on the other side, by a thread that reports
 * only when the answer changes. An empty list stops the watching.
 */
export async function watchChips(rects: readonly Rect[]): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('watch_chips', { rects })
  } catch {
    // Nothing to watch with. The tabs still answer to a click.
  }
}

/** The index of the tab the pointer is over, or -1, whenever that changes. */
export function onChipUnderPointer(handle: (index: number) => void): () => void {
  if (!isDesktop()) return () => {}
  let stop: (() => void) | null = null
  let cancelled = false

  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<number>('pointer:chip', (event) => handle(event.payload)))
    .then((off) => {
      if (cancelled) off()
      else stop = off
    })
    .catch(() => {})

  return () => {
    cancelled = true
    stop?.()
  }
}

/**
 * Builds the panel off screen so that the first time it is wanted it is
 * already loaded. A window created on the hover that wants it spends that
 * hover loading a web app.
 */
export async function preparePanel(label: PanelLabel): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('panel_prepare', { label })
  } catch {
    // It will be built on first use instead, a beat later.
  }
}

/** Takes the panel off the screen. What is inside it stays loaded. */
export async function hidePanel(label: PanelLabel): Promise<void> {
  if (!isDesktop()) return
  await invoke('panel_hide', { label })
}

export async function panelIsOpen(label: PanelLabel): Promise<boolean> {
  if (!isDesktop()) return false
  try {
    return await invoke<boolean>('panel_is_open', { label })
  } catch {
    return false
  }
}

/** Brings the app's own window back from the tray, or from behind everything. */
export async function showMainWindow(): Promise<void> {
  if (!isDesktop()) {
    window.focus()
    return
  }
  await invoke('show_main')
}

/** Closes the app for good, panels and all. */
export async function quitApp(): Promise<void> {
  if (!isDesktop()) return
  await invoke('quit_app')
}

/**
 * Opens the system's own menu over a tab.
 *
 * The system's, and not one drawn inside the window, because the column is
 * thirty pixels wide: anything the interface draws past its own edge is cut
 * off by the system, and three lines of menu have nowhere to go in there.
 */
export async function openChipMenu(open: boolean): Promise<void> {
  if (!isDesktop()) return
  try {
    await invoke('chip_menu', { open })
  } catch {
    // No menu on this platform is a tab that answers to clicks only.
  }
}

/** Which line of that menu was chosen, as its id. */
export function onChipMenuChoice(handle: (id: string) => void): () => void {
  if (!isDesktop()) return () => {}
  let stop: (() => void) | null = null
  let cancelled = false

  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen<string>('chip:chose', (event) => handle(event.payload)))
    .then((off) => {
      if (cancelled) off()
      else stop = off
    })
    .catch(() => {
      // Without the listener the menu simply does nothing when chosen.
    })

  return () => {
    cancelled = true
    stop?.()
  }
}
