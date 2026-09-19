/**
 * Browser adapter for the filesystem port, on the File System Access API.
 *
 * Only Chromium grants access to a whole folder today, which is the main limit
 * of the web build. The adapter keeps a handle per path so that reading a file
 * deep in the tree does not walk the folder again.
 */

import {
  compareEntries,
  entryId,
  joinPath,
  type Base,
  type Entry,
  type FileSystem,
  type FileVersion,
  type LoadedFile,
} from './fs'
import { decode } from './text'

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

interface OpenBase {
  base: Base
  root: FileSystemDirectoryHandle
  /** path -> handle, filled as the tree is walked. '' is the root. */
  handles: Map<string, FileSystemHandle>
}

export class BrowserFileSystem implements FileSystem {
  private bases = new Map<string, OpenBase>()
  private nextId = 1

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
    const id = 'base' + this.nextId++
    const base: Base = { id, name: root.name, label: root.name }
    this.bases.set(id, { base, root, handles: new Map([['', root]]) })
    return base
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
