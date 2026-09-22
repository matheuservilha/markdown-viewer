/**
 * Looking for a new version, and putting it in place.
 *
 * Only the desktop build has anywhere to install to, so in the browser every
 * call here answers that there is nothing, and the interface draws nothing.
 *
 * Looking is allowed to fail quietly. There is no network on a plane, the
 * repository may not have a release yet, and none of that is worth a message
 * over a document someone is writing. Installing is not: by then the person
 * asked for it and is waiting, so a failure has to reach them.
 */

import { advance, NOT_STARTED, type Download, type DownloadEvent } from '~/app/updates'
import { isDesktop } from '.'

export interface PendingUpdate {
  /** The version being offered, as the release names it. */
  version: string
  /** Downloads and installs it, reporting progress as the bytes land. */
  install: (watch: (download: Download) => void) => Promise<void>
}

/** The new version on offer, or nothing when there is none to be had. */
export async function lookForUpdate(): Promise<PendingUpdate | null> {
  if (!isDesktop()) return null

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const found = await check()
    if (!found) return null

    return {
      version: found.version,
      install: async (watch) => {
        // The updater reports each chunk as it lands and never the sum, so the
        // running total is kept here and handed over whole.
        let download = NOT_STARTED
        await found.downloadAndInstall((event) => {
          download = advance(download, event as DownloadEvent)
          watch(download)
        })
      },
    }
  } catch {
    return null
  }
}

/** Closes the app and opens it again, now on the version just installed. */
export async function restart(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
