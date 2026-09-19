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

export interface FileSystem {
  /** Asks the person for a folder and adds it as a base. */
  openBase(): Promise<Base | null>
  /** Direct children of `path` inside `base`, already sorted. */
  list(baseId: string, path: string): Promise<Entry[]>
  read(baseId: string, path: string): Promise<LoadedFile>
  write(baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion>
  /** Current stamp, or null when the file is gone. */
  stat(baseId: string, path: string): Promise<FileVersion | null>
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

/** Folders first, then files, each group by name, the way Finder shows them. */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}
