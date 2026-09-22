/**
 * Notes that have no home yet.
 *
 * A new note opens straight into the editor without touching the disk. There
 * is no dialog to answer before writing the first word, and no file left
 * behind by a note that turned out not to be worth keeping. It lives in the
 * app, survives the app being closed, and stops being a draft the moment the
 * person saves it and says where it goes.
 *
 * The text is kept in the browser's own storage, beside the session. That is
 * a per machine store and never leaves it, which suits a draft: it is not yet
 * a file anyone else is meant to find.
 */

const STORAGE_KEY = 'markdown-viewer.drafts'

/**
 * The base id every draft tab carries.
 *
 * It is never a real base, so the rest of the app can tell a draft from a file
 * by asking one question, and nothing tries to read it from disk.
 */
export const DRAFT_BASE = 'rascunho:'

export interface Draft {
  /** Unique within the cache, and the path half of the tab's id. */
  id: string
  name: string
  text: string
  /** When it was last written, so the oldest goes first if room runs out. */
  at: number
  /** Named by hand, so it no longer takes its name from its first line. */
  named?: boolean
}

export function isDraft(tab: { baseId: string }): boolean {
  return tab.baseId === DRAFT_BASE
}

/** A name nobody is using yet: `Sem título`, then `Sem título 2`, and so on. */
export function nextDraftName(taken: readonly string[]): string {
  const base = 'Sem título'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(base + ' ' + n)) n++
  return base + ' ' + n
}

/**
 * The name a note written on the edge of the screen gives itself.
 *
 * Nobody names a sticky note before writing it, so the name is taken from the
 * first line that has anything on it, with the heading marks and the list
 * bullet taken off. An empty note keeps the name it was born with.
 */
export function noteTitle(text: string, fallback: string): string {
  for (const line of text.split('\n')) {
    const stripped = line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '')
      .replace(/^\s*>\s?/, '')
      .trim()
    if (stripped !== '') return stripped.slice(0, 60)
  }
  return fallback
}

export function loadDrafts(): Draft[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (draft): draft is Draft =>
        typeof draft === 'object' &&
        draft !== null &&
        typeof (draft as Draft).id === 'string' &&
        typeof (draft as Draft).name === 'string' &&
        typeof (draft as Draft).text === 'string',
    )
  } catch {
    return []
  }
}

export function saveDrafts(drafts: readonly Draft[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // Storage full or blocked. The draft stays open and editable for as long
    // as the app is running; only the memory of it across restarts is lost,
    // and there is nothing useful to say about that mid keystroke.
  }
}
