/**
 * What has been opened before.
 *
 * Only ids, paths and names are kept, never content. A folder recorded here can
 * be reopened in one click, which on the web still costs a permission prompt
 * but no longer costs finding the folder again in a dialog.
 */

const STORAGE_KEY = 'markdown-viewer.recents'
const MAX_FILES = 40
const MAX_BASES = 12

export interface RecentFile {
  baseId: string
  path: string
  name: string
  /** Full path, for a file opened from outside every base. */
  label?: string
  at: number
}

export interface RecentBase {
  id: string
  name: string
  label: string
  at: number
}

export interface Recents {
  files: RecentFile[]
  bases: RecentBase[]
}

const EMPTY: Recents = { files: [], bases: [] }

export function loadRecents(): Recents {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return EMPTY
    const value = JSON.parse(stored) as Partial<Recents>
    return { files: value.files ?? [], bases: value.bases ?? [] }
  } catch {
    return EMPTY
  }
}

function save(recents: Recents): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recents))
  } catch {
    // A history that cannot be written is a history that starts empty.
  }
}

/** Moves an entry to the front, or adds it, and trims the tail. */
function promote<T>(list: T[], entry: T, same: (a: T, b: T) => boolean, cap: number): T[] {
  return [entry, ...list.filter((item) => !same(item, entry))].slice(0, cap)
}

export function rememberFile(file: Omit<RecentFile, 'at'>): Recents {
  const recents = loadRecents()
  const next: Recents = {
    ...recents,
    files: promote(
      recents.files,
      { ...file, at: Date.now() },
      (a, b) => a.baseId === b.baseId && a.path === b.path,
      MAX_FILES,
    ),
  }
  save(next)
  return next
}

export function rememberBase(base: Omit<RecentBase, 'at'>): Recents {
  const recents = loadRecents()
  const next: Recents = {
    ...recents,
    bases: promote(recents.bases, { ...base, at: Date.now() }, (a, b) => a.id === b.id, MAX_BASES),
  }
  save(next)
  return next
}

export function forgetFile(baseId: string, path: string): Recents {
  const recents = loadRecents()
  const next: Recents = {
    ...recents,
    files: recents.files.filter((file) => file.baseId !== baseId || file.path !== path),
  }
  save(next)
  return next
}

export function forgetBase(id: string): Recents {
  const recents = loadRecents()
  const next: Recents = { ...recents, bases: recents.bases.filter((base) => base.id !== id) }
  save(next)
  return next
}

export function clearRecents(): Recents {
  save(EMPTY)
  return EMPTY
}
