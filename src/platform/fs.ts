/**
 * The filesystem port.
 *
 * Everything above this file talks only to these types. Each platform supplies
 * one adapter: the browser one uses the File System Access API, and the desktop
 * one will use Tauri. Paths are always '/' separated and relative to the root of
 * the base folder they belong to, with '' meaning the root itself.
 */

import type { TextShape } from './text'

export type EntryKind = 'file' | 'directory'

export interface Entry {
  /** '<baseId>:<path>', unique across every open base. */
  id: string
  baseId: string
  /** Path relative to the base root. '' is the root. */
  path: string
  name: string
  kind: EntryKind
}

export interface Base {
  id: string
  name: string
  /** Absolute path when the platform can tell us one, else just the name. */
  label: string
}

export interface LoadedFile {
  text: string
  shape: TextShape
  /** Stamp used to notice that the file changed behind our back. */
  version: FileVersion
}

export interface FileVersion {
  size: number
  modifiedAt: number
}

/**
 * A file opened from outside every base. It is addressed like anything else,
 * through a base id of its own and an empty path, so reading and writing it
 * needs no separate code path.
 */
export interface LooseFile {
  baseId: string
  name: string
  /** Full path when the platform can tell us one, else just the name. */
  label: string
}

/**
 * The outcome of trying to reopen something from a previous session.
 *
 * `needs-permission` exists because of the browser: a folder handle survives a
 * reload, but the permission to read it does not, and asking for it again is
 * only allowed from inside a click. The desktop never returns it.
 */
export type Restored<T> =
  { status: 'ok'; value: T } | { status: 'needs-permission' } | { status: 'gone' }

export interface FileSystem {
  /** Asks the person for a folder and adds it as a base. */
  openBase(): Promise<Base | null>
  /** Asks the person for a single file, which does not enter the tree. */
  openFile(): Promise<LooseFile | null>
  /**
   * Reopens a base by the id it had last time. `interactive` must only be true
   * when this is running inside a click, because that is the only moment a
   * browser lets us ask for permission again.
   */
  restoreBase(baseId: string, interactive: boolean): Promise<Restored<Base>>
  restoreFile(baseId: string, interactive: boolean): Promise<Restored<LooseFile>>
  /** Direct children of `path` inside `base`, already sorted. */
  list(baseId: string, path: string): Promise<Entry[]>
  read(baseId: string, path: string): Promise<LoadedFile>
  /** The raw bytes, for the files that are not text: images and the like. */
  readBinary(baseId: string, path: string): Promise<Uint8Array>
  /**
   * Writes a throwaway file and hands it to the system. It exists because the
   * desktop web view cannot print: the document goes out to the browser.
   */
  openTemporary(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>
  /** Asks where to put a new file and writes it. Null when nobody chose. */
  saveAs(suggestedName: string, bytes: Uint8Array<ArrayBuffer>): Promise<string | null>

  /** Creates an empty file and hands back its entry. */
  createFile(baseId: string, path: string): Promise<Entry>
  createFolder(baseId: string, path: string): Promise<Entry>
  /** Renames, and moves, within one base. */
  move(baseId: string, from: string, to: string): Promise<Entry>
  /** Copies a file beside itself under a free name. */
  duplicate(baseId: string, path: string): Promise<Entry>
  /**
   * Sends the entry to the system trash. Adapters that cannot reach a trash
   * throw instead of deleting for good: losing a file is not a fallback.
   */
  trash(baseId: string, path: string): Promise<void>
  /** Shows the entry in the system's file manager. */
  reveal(baseId: string, path: string): Promise<void>
  /** The absolute path, when the platform is willing to tell us. */
  absolutePath(baseId: string, path: string): string | null
  /** What this platform can actually do, so the menu can hide the rest. */
  readonly can: Capabilities
  write(baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion>
  /**
   * Calls back whenever anything under the base changes on disk. Returns the
   * function that stops watching. Where the platform has no watcher it returns
   * null, and the app falls back to asking.
   */
  watch(baseId: string, onChange: () => void): Promise<(() => void) | null>
  /** Current stamp, or null when the file is gone. */
  stat(baseId: string, path: string): Promise<FileVersion | null>
}

export interface Capabilities {
  trash: boolean
  reveal: boolean
  absolutePath: boolean
}

export const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt'] as const

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** True for files the editor opens as plain text, with no Markdown parsing. */
export function isPlainText(name: string): boolean {
  return name.toLowerCase().endsWith('.txt')
}

export function entryId(baseId: string, path: string): string {
  return baseId + ':' + path
}

export function joinPath(parent: string, name: string): string {
  return parent === '' ? name : parent + '/' + name
}

/** The folder an entry sits in. '' when it sits at the root of the base. */
export function parentPath(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

export function baseName(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? path : path.slice(cut + 1)
}

/** `nota.md` becomes `nota copia.md`, keeping the extension where it belongs. */
export function copyName(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name + ' ' + suffix
  return name.slice(0, dot) + ' ' + suffix + name.slice(dot)
}

/** Folders first, then files, each group by name, the way Finder shows them. */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}
