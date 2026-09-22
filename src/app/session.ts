/**
 * What is open, remembered between sessions.
 *
 * Nothing of the person's own content is stored here: only ids, paths and where
 * the cursor was. The files themselves stay where they are.
 */

const STORAGE_KEY = 'markdown-viewer.session'

export interface ViewState {
  selection: { anchor: number; head: number }
  scrollTop: number
}

export interface SessionTab {
  id: string
  baseId: string
  path: string
  name: string
  label?: string
  preview: boolean
  view?: ViewState
}

export interface Session {
  version: 1
  /** Ids of the folders that were open, in order. */
  bases: string[]
  /** Ids of the files opened from outside every folder. */
  files: string[]
  /** Entry ids of the folders that were expanded in the tree. */
  expanded: string[]
  tabs: SessionTab[]
  activeId: string | null
  sidebarOpen: boolean
}

export function loadSession(): Session | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const session = JSON.parse(stored) as Session
    return session.version === 1 ? session : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // A session that cannot be written is a session that starts empty.
  }
}

/** Shallow folders first, so a child is never expanded before its parent. */
export function byDepth(entryIds: string[]): string[] {
  return entryIds.toSorted((a, b) => a.split('/').length - b.split('/').length)
}

/**
 * Whether restoring the session may still choose which tab is in front.
 *
 * Restoring is slow: every file is read from disk before the session can say
 * which of them was in front last time. A file handed over by the system, from
 * a double click in the file manager, arrives in the middle of that and opens
 * a tab of its own. Whoever finishes last would otherwise win, and it is the
 * restore that finishes last, so the file the person just asked for loses to
 * the one they had open yesterday.
 *
 * So the restore only decides while every tab on screen is one it opened.
 * A tab it does not recognise means somebody else chose, and that choice is
 * the newer one.
 */
export function restoreMayChooseActive(
  currentActiveId: string | null,
  restoredIds: readonly string[],
): boolean {
  if (currentActiveId === null) return true
  return restoredIds.includes(currentActiveId)
}
