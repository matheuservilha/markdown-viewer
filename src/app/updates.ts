/**
 * Following a download that only reports how much just arrived.
 *
 * The updater does not hand over a percentage. It announces the total size
 * once, at the start, then reports each chunk as it lands, and says nothing
 * about the sum. Keeping that sum is this module's whole job, and it lives
 * apart from the desktop call so the arithmetic can be exercised without one.
 *
 * The total is allowed to be missing: a server is free to answer without a
 * content length, and a bar that cannot be drawn is better than a bar that
 * lies. That is why `percent` can answer nothing.
 */

/** What the updater reports while it pulls the new version down. */
export type DownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

export interface Download {
  /** Bytes the whole thing weighs, or zero while that is still unknown. */
  total: number
  /** Bytes that have arrived so far. */
  received: number
}

export const NOT_STARTED: Download = { total: 0, received: 0 }

/** Folds one report into the running count. */
export function advance(download: Download, event: DownloadEvent): Download {
  switch (event.event) {
    case 'Started':
      // A restarted download would otherwise keep counting from where the
      // abandoned one stopped, and report more bytes than the file has.
      return { total: event.data.contentLength ?? 0, received: 0 }
    case 'Progress':
      return { ...download, received: download.received + event.data.chunkLength }
    case 'Finished':
      // Whatever the count reached, arriving means it is whole.
      return {
        total: download.total || download.received,
        received: download.total || download.received,
      }
  }
}

/**
 * How far along, from 0 to 100, or nothing when the size was never announced.
 *
 * Clamped because the two numbers come from different reports and a server
 * that understates the length would otherwise push the bar past its end.
 */
export function percent(download: Download): number | null {
  if (download.total <= 0) return null
  return Math.min(100, Math.round((download.received / download.total) * 100))
}
