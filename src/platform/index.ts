import type { FileSystem } from './fs'
import { BrowserFileSystem } from './fs-browser'
import { MemoryFileSystem } from './fs-memory'
import { TauriFileSystem } from './fs-tauri'

/**
 * Picks the adapter for the platform we are running on. The desktop build runs
 * inside Tauri and gets the native adapter; anything else gets the browser one,
 * which can only open a folder on Chromium. `?demo` forces the in-memory one.
 */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const isDemo =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

function pick(): FileSystem {
  if (isDemo) return new MemoryFileSystem()
  if (isDesktop) return new TauriFileSystem()
  return new BrowserFileSystem()
}

export const fileSystem: FileSystem = pick()
