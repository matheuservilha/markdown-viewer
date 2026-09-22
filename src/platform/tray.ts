/**
 * What the icon beside the clock asks for.
 *
 * The tray is drawn on the Rust side, because it has to exist whether or not
 * any window does. The one thing it cannot do by itself is write a note, so it
 * says so and the app's window answers.
 */

import { isDesktop } from '.'

const NEW_NOTE = 'tray:new-note'

export function onTrayNewNote(handle: () => void): () => void {
  if (!isDesktop()) return () => {}
  let stop: (() => void) | null = null
  let cancelled = false

  void import('@tauri-apps/api/event')
    .then(({ listen }) => listen(NEW_NOTE, () => handle()))
    .then((off) => {
      if (cancelled) off()
      else stop = off
    })
    .catch(() => {
      // No tray on this platform, or none this build could install. The menu
      // and the keyboard still write notes.
    })

  return () => {
    cancelled = true
    stop?.()
  }
}
