/**
 * Browser adapter for the filesystem port, on the File System Access API.
 *
 * Only Chromium grants access to a whole folder today, which is the main limit
 * of the web build. The adapter keeps a handle per path so that reading a file
 * deep in the tree does not walk the folder again.
 */

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
import { getHandle, putHandle } from './handle-store'
import { decode } from './text'

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

interface OpenBase {
  base: Base
  /** Absent for a loose file, which has no tree to walk. */
  root: FileSystemDirectoryHandle | undefined
  /** path -> handle, filled as the tree is walked. '' is the root. */
  handles: Map<string, FileSystemHandle>
}

export class BrowserFileSystem implements FileSystem {
  private bases = new Map<string, OpenBase>()

  async openBase(): Promise<Base | null> {
    if (!supportsDirectoryPicker()) {
      throw new Error('Este navegador não abre uma pasta. Use um navegador Chromium ou o app de desktop.')
    }
    let root: FileSystemDirectoryHandle
    try {
      root = await window.showDirectoryPicker({ mode: 'readwrite' })
    } catch {
      return null // the person dismissed the picker
    }
    // The id is stable and stored with the handle, so next session can ask for
    // this exact folder back.
    const id = 'b-' + crypto.randomUUID()
    await putHandle(id, root)
    return this.register(id, root)
  }

  async restoreBase(baseId: string, interactive: boolean): Promise<Restored<Base>> {
    const handle = await getHandle(baseId)
    if (!handle || handle.kind !== 'directory') return { status: 'gone' }

    const allowed = await this.allow(handle, interactive)
    if (!allowed) return { status: 'needs-permission' }

    return { status: 'ok', value: this.register(baseId, handle as FileSystemDirectoryHandle) }
  }

  async restoreFile(baseId: string, interactive: boolean): Promise<Restored<LooseFile>> {
    const handle = await getHandle(baseId)
    if (!handle || handle.kind !== 'file') return { status: 'gone' }

    const allowed = await this.allow(handle, interactive)
    if (!allowed) return { status: 'needs-permission' }

    this.registerLoose(baseId, handle as FileSystemFileHandle)
    return { status: 'ok', value: { baseId, name: handle.name, label: handle.name } }
  }

  /**
   * A stored handle keeps working across reloads, but its permission does not.
   * Asking again is only allowed from inside a click, which is what
   * `interactive` marks.
   */
  private async allow(handle: FileSystemHandle, interactive: boolean): Promise<boolean> {
    const mode = { mode: 'readwrite' } as const
    if ((await handle.queryPermission(mode)) === 'granted') return true
    if (!interactive) return false
    return (await handle.requestPermission(mode)) === 'granted'
  }

  private register(id: string, root: FileSystemDirectoryHandle): Base {
    const base: Base = { id, name: root.name, label: root.name }
    this.bases.set(id, { base, root, handles: new Map([['', root]]) })
    return base
  }

  private registerLoose(id: string, handle: FileSystemFileHandle): void {
    this.bases.set(id, {
      base: { id, name: handle.name, label: handle.name },
      root: undefined,
      handles: new Map([['', handle]]),
    })
  }

  async openFile(): Promise<LooseFile | null> {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('Este navegador não abre arquivo. Use um navegador Chromium ou o app de desktop.')
    }

    let handles: FileSystemFileHandle[]
    try {
      handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Texto e Markdown',
            accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
          },
        ],
      })
    } catch {
      return null // the person dismissed the picker
    }

    const handle = handles[0]
    if (!handle) return null

    // The loose file is its own base, holding one handle under the empty path.
    const id = 'f-' + crypto.randomUUID()
    await putHandle(id, handle)
    this.registerLoose(id, handle)
    // The browser never tells us where the file lives, only its name.
    return { baseId: id, name: handle.name, label: handle.name }
  }

  async list(baseId: string, path: string): Promise<Entry[]> {
    const open = this.require(baseId)
    const dir = await this.directoryAt(open, path)
    const entries: Entry[] = []
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith('.')) continue
      const childPath = joinPath(path, name)
      open.handles.set(childPath, handle)
      entries.push({
        id: entryId(baseId, childPath),
        baseId,
        path: childPath,
        name,
        kind: handle.kind === 'directory' ? 'directory' : 'file',
      })
    }
    return entries.sort(compareEntries)
  }

  async read(baseId: string, path: string): Promise<LoadedFile> {
    const file = await (await this.fileAt(this.require(baseId), path)).getFile()
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { text, shape } = decode(bytes)
    return { text, shape, version: { size: file.size, modifiedAt: file.lastModified } }
  }

  async write(baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion> {
    const handle = await this.fileAt(this.require(baseId), path)
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    const saved = await handle.getFile()
    return { size: saved.size, modifiedAt: saved.lastModified }
  }

  readonly can: Capabilities = { trash: false, reveal: false, absolutePath: false }

  async createFile(baseId: string, path: string): Promise<Entry> {
    const open = this.require(baseId)
    const parent = await this.directoryAt(open, parentPath(path))
    const handle = await parent.getFileHandle(baseName(path), { create: true })
    open.handles.set(path, handle)
    return this.entry(baseId, path, 'file')
  }

  async createFolder(baseId: string, path: string): Promise<Entry> {
    const open = this.require(baseId)
    const parent = await this.directoryAt(open, parentPath(path))
    const handle = await parent.getDirectoryHandle(baseName(path), { create: true })
    open.handles.set(path, handle)
    return this.entry(baseId, path, 'directory')
  }

  async move(baseId: string, from: string, to: string): Promise<Entry> {
    const open = this.require(baseId)
    const handle = await this.handleAt(open, from)
    const target = await this.directoryAt(open, parentPath(to))

    // Chromium can move a handle outright. Where it cannot, a file is copied
    // and the original removed; a folder is refused rather than half-moved.
    const movable = handle as FileSystemHandle & {
      move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void>
    }
    if (typeof movable.move === 'function') {
      await movable.move(target, baseName(to))
    } else if (handle.kind === 'file') {
      const bytes = new Uint8Array(await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer())
      await this.writeInto(target, baseName(to), bytes)
      await (await this.directoryAt(open, parentPath(from))).removeEntry(baseName(from))
    } else {
      throw new Error('Este navegador não move pasta. Use o app de desktop.')
    }

    this.forget(open, from)
    open.handles.set(to, handle)
    return this.entry(baseId, to, handle.kind === 'directory' ? 'directory' : 'file')
  }

  async duplicate(baseId: string, path: string): Promise<Entry> {
    const open = this.require(baseId)
    const source = await this.fileAt(open, path)
    const bytes = new Uint8Array(await (await source.getFile()).arrayBuffer())
    const parent = await this.directoryAt(open, parentPath(path))
    const name = await this.freeName(parent, baseName(path))
    await this.writeInto(parent, name, bytes)
    return this.entry(baseId, joinPath(parentPath(path), name), 'file')
  }

  async trash(): Promise<void> {
    throw new Error(
      'O navegador não tem acesso à lixeira do sistema, e apagar de vez não é opção. Use o app de desktop.',
    )
  }

  async reveal(): Promise<void> {
    throw new Error('Só o app de desktop revela o arquivo no Finder.')
  }

  absolutePath(): string | null {
    // The File System Access API never tells a page where a file lives.
    return null
  }

  private entry(baseId: string, path: string, kind: 'file' | 'directory'): Entry {
    return { id: entryId(baseId, path), baseId, path, name: baseName(path), kind }
  }

  private async writeInto(
    parent: FileSystemDirectoryHandle,
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const handle = await parent.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
  }

  /** `nota.md`, then `nota copia.md`, then `nota copia 2.md`. */
  private async freeName(parent: FileSystemDirectoryHandle, name: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const candidate = copyName(name, attempt === 1 ? 'copia' : 'copia ' + attempt)
      try {
        await parent.getFileHandle(candidate)
      } catch {
        return candidate
      }
    }
  }

  /** Drops a path and everything under it from the handle cache. */
  private forget(open: OpenBase, path: string): void {
    for (const key of [...open.handles.keys()]) {
      if (key === path || key.startsWith(path + '/')) open.handles.delete(key)
    }
  }

  async stat(baseId: string, path: string): Promise<FileVersion | null> {
    try {
      const file = await (await this.fileAt(this.require(baseId), path)).getFile()
      return { size: file.size, modifiedAt: file.lastModified }
    } catch {
      return null // deleted or renamed behind our back
    }
  }

  private require(baseId: string): OpenBase {
    const open = this.bases.get(baseId)
    if (!open) throw new Error('Base desconhecida: ' + baseId)
    return open
  }

  /** Resolves a path to its handle, walking down from the nearest ancestor we hold. */
  private async handleAt(open: OpenBase, path: string): Promise<FileSystemHandle> {
    const known = open.handles.get(path)
    if (known) return known

    if (!open.root) throw new Error('Arquivo solto não tem árvore: ' + path)

    const segments = path.split('/')
    const leaf = segments.pop()
    if (leaf === undefined) throw new Error('Caminho vazio')
    const parent = await this.directoryAt(open, segments.join('/'))

    let handle: FileSystemHandle
    try {
      handle = await parent.getDirectoryHandle(leaf)
    } catch {
      handle = await parent.getFileHandle(leaf)
    }
    open.handles.set(path, handle)
    return handle
  }

  private async directoryAt(open: OpenBase, path: string): Promise<FileSystemDirectoryHandle> {
    const handle = await this.handleAt(open, path)
    if (handle.kind !== 'directory') throw new Error('Não é uma pasta: ' + path)
    return handle as FileSystemDirectoryHandle
  }

  private async fileAt(open: OpenBase, path: string): Promise<FileSystemFileHandle> {
    const handle = await this.handleAt(open, path)
    if (handle.kind !== 'file') throw new Error('Não é um arquivo: ' + path)
    return handle as FileSystemFileHandle
  }
}
