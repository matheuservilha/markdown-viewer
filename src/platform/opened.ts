/**
 * Files the operating system asks this app to open.
 *
 * Double clicking a `.md` in the file manager reaches the app in a different
 * way on each system: macOS sends it to the running process, Windows and Linux
 * put it on the command line. Both end up here, as a list of absolute paths.
 */

import { isDesktop } from './index'

/**
 * Calls back with every path the system hands over, now and later. Returns the
 * way to stop listening. Off the desktop there is nothing to listen to.
 */
export function onOpenedPaths(handle: (paths: string[]) => void): () => void {
  if (!isDesktop()) return () => {}

  let stop: (() => void) | undefined
  let dropped = false

  void (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')

    // What arrived before the interface was ready to hear it.
    const waiting = await invoke<string[]>('take_opened_paths')
    if (!dropped && waiting.length > 0) handle(waiting)

    const unlisten = await listen<string[]>('files-opened', (event) => handle(event.payload))
    if (dropped) unlisten()
    else stop = unlisten
  })()

  return () => {
    dropped = true
    stop?.()
  }
}
