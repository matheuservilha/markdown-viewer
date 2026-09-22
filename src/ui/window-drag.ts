/**
 * Dragging the desktop window by the interface.
 *
 * The attribute Tauri offers for this only works when the press lands on the
 * exact element that carries it, never on a child, so a title bar made of text
 * and buttons never drags. Here the press is caught on the way up, the region
 * is found with `closest`, and the window is told to start dragging itself.
 *
 * The window object is fetched once, at install time, because the call has to
 * happen inside the press: waiting for a dynamic import first loses the gesture.
 */

import { isDesktop } from '~/platform'

interface AppWindow {
  startDragging: () => Promise<void>
  toggleMaximize: () => Promise<void>
}

/** Areas that must keep their own behaviour, even inside a drag region. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="tab"], .resizer, .cm-editor'

/**
 * Whether a press on this element should move the window.
 *
 * Exported because it is the part that decides, and the part that can be wrong:
 * the call into the window itself cannot be exercised outside the desktop.
 */
export function isDragRegion(target: Element | null): boolean {
  if (!target?.closest('[data-drag-window]')) return false
  return target.closest(INTERACTIVE) === null
}

/**
 * `maximize` is off for the floating note. Double clicking its header there is
 * somebody missing the close button, not somebody asking for a note the size
 * of the screen.
 */
export async function installWindowDrag({ maximize = true }: { maximize?: boolean } = {}): Promise<
  () => void
> {
  if (!isDesktop()) return () => {}

  let appWindow: AppWindow
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    appWindow = getCurrentWindow()
  } catch {
    return () => {}
  }

  const region = (event: MouseEvent) => isDragRegion(event.target as Element | null)

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail > 1 || !region(event)) return
    event.preventDefault()
    void appWindow.startDragging()
  }

  const onDoubleClick = (event: MouseEvent) => {
    if (!region(event)) return
    void appWindow.toggleMaximize()
  }

  window.addEventListener('mousedown', onMouseDown)
  if (maximize) window.addEventListener('dblclick', onDoubleClick)
  return () => {
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('dblclick', onDoubleClick)
  }
}
