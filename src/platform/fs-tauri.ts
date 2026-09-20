/**
 * Desktop adapter for the filesystem port, on the Tauri plugins.
 *
 * The folder the person picks in the system dialog is handed to the Rust side,
 * which opens the plugin's scope to exactly that folder. Nothing they have not
 * chosen is reachable from the web layer.
 */

import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import {
  copyFile,
  mkdir,
  readDir,
  readFile,
  rename,
  stat,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import {
  baseName,
  compareEntries,
  copyName,
  entryId,
  joinPath,
  parentPath,
  type Base,
  type Entry,
  type FileSystem,
  type FileVersion,
  type LoadedFile,
  type LooseFile,
  type Capabilities,
  type Restored,
} from './fs'
import { decode } from './text'

function basename(path: string): string {
  return path.split('/').findLast(Boolean) ?? path
}

export class TauriFileSystem implements FileSystem {
  /** Base id is the absolute path of the root, which is already unique. */
  private roots = new Map<string, string>()

  async openBase(): Promise<Base | null> {
    const picked = await open({ directory: true, multiple: false })
    if (typeof picked !== 'string') return null

    await invoke('allow_base', { path: picked })
    this.roots.set(picked, picked)
    return { id: picked, name: basename(picked), label: picked }
  }

  async openFile(): Promise<LooseFile | null> {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Texto e Markdown', extensions: ['md', 'markdown', 'txt'] }],
    })
    if (typeof picked !== 'string') return null

    await invoke('allow_base', { path: picked })
    // The file is its own base: the root of that base is the file itself, so
    // the empty path resolves straight to it.
    this.roots.set(picked, picked)
    return { baseId: picked, name: basename(picked), label: picked }
  }

  /**
   * On the desktop the id of a base is its absolute path, so reopening one is
   * a matter of asking the Rust side for access to that path again.
   */
  async restoreBase(baseId: string): Promise<Restored<Base>> {
    try {
      await invoke('allow_base', { path: baseId })
      await readDir(baseId)
    } catch {
      return { status: 'gone' }
    }
    this.roots.set(baseId, baseId)
    return { status: 'ok', value: { id: baseId, name: basename(baseId), label: baseId } }
  }

  async restoreFile(baseId: string): Promise<Restored<LooseFile>> {
    try {
      await invoke('allow_base', { path: baseId })
      await stat(baseId)
    } catch {
      return { status: 'gone' }
    }
    this.roots.set(baseId, baseId)
    return { status: 'ok', value: { baseId, name: basename(baseId), label: baseId } }
  }

  async list(baseId: string, path: string): Promise<Entry[]> {
    const entries = await readDir(this.absolute(baseId, path))
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => {
        const childPath = joinPath(path, entry.name)
        return {
          id: entryId(baseId, childPath),
          baseId,
          path: childPath,
          name: entry.name,
          kind: entry.isDirectory ? ('directory' as const) : ('file' as const),
        }
      })
      .toSorted(compareEntries)
  }

  readonly can: Capabilities = { trash: true, reveal: true, absolutePath: true }

  async readBinary(baseId: string, path: string): Promise<Uint8Array> {
    return readFile(this.absolute(baseId, path))
  }

  async saveAs(suggestedName: string, bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
    const target = await save({ defaultPath: suggestedName })
    if (!target) return null
    await invoke('allow_base', { path: target })
    await writeFile(target, bytes)
    return target
  }

  async createFile(baseId: string, path: string): Promise<Entry> {
    await writeTextFile(this.absolute(baseId, path), '')
    return this.entry(baseId, path, 'file')
  }

  async createFolder(baseId: string, path: string): Promise<Entry> {
    await mkdir(this.absolute(baseId, path), { recursive: true })
    return this.entry(baseId, path, 'directory')
  }

  async move(baseId: string, from: string, to: string): Promise<Entry> {
    const source = this.absolute(baseId, from)
    await rename(source, this.absolute(baseId, to))
    const info = await stat(this.absolute(baseId, to))
    return this.entry(baseId, to, info.isDirectory ? 'directory' : 'file')
  }

  async duplicate(baseId: string, path: string): Promise<Entry> {
    const parent = parentPath(path)
    let name = copyName(baseName(path), 'copia')
    for (let attempt = 2; await this.exists(baseId, joinPath(parent, name)); attempt++) {
      name = copyName(baseName(path), 'copia ' + attempt)
    }
    const target = joinPath(parent, name)
    await copyFile(this.absolute(baseId, path), this.absolute(baseId, target))
    return this.entry(baseId, target, 'file')
  }

  async trash(baseId: string, path: string): Promise<void> {
    await invoke('move_to_trash', { path: this.absolute(baseId, path) })
  }

  async reveal(baseId: string, path: string): Promise<void> {
    await invoke('reveal_in_file_manager', { path: this.absolute(baseId, path) })
  }

  absolutePath(baseId: string, path: string): string {
    return this.absolute(baseId, path)
  }

  private async exists(baseId: string, path: string): Promise<boolean> {
    try {
      await stat(this.absolute(baseId, path))
      return true
    } catch {
      return false
    }
  }

  private entry(baseId: string, path: string, kind: 'file' | 'directory'): Entry {
    return { id: entryId(baseId, path), baseId, path, name: baseName(path), kind }
  }

  async read(baseId: string, path: string): Promise<LoadedFile> {
    const absolute = this.absolute(baseId, path)
    const bytes = await readFile(absolute)
    const { text, shape } = decode(bytes)
    return { text, shape, version: await this.version(absolute) }
  }

  async write(baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion> {
    const absolute = this.absolute(baseId, path)
    await writeFile(absolute, bytes)
    return this.version(absolute)
  }

  async stat(baseId: string, path: string): Promise<FileVersion | null> {
    try {
      return await this.version(this.absolute(baseId, path))
    } catch {
      return null // deleted or renamed behind our back
    }
  }

  private async version(absolute: string): Promise<FileVersion> {
    const info = await stat(absolute)
    return { size: info.size, modifiedAt: info.mtime?.getTime() ?? 0 }
  }

  private absolute(baseId: string, path: string): string {
    const root = this.roots.get(baseId)
    if (!root) throw new Error('Base desconhecida: ' + baseId)
    return path === '' ? root : root + '/' + path
  }
}
