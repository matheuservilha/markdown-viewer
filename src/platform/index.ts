import type { FileSystem } from './fs'
import { BrowserFileSystem } from './fs-browser'
import { MemoryFileSystem } from './fs-memory'
import { TauriFileSystem } from './fs-tauri'

/**
 * Which platform we are running on.
 *
 * This is a function and not a constant on purpose. Tauri injects its bridge
 * into the page with a script of its own, and reading the global while the
 * modules are still being evaluated can happen before that script has run. A
 * desktop app that decided it was a browser falls back to the File System
 * Access API, which the macOS web view does not have, and then nothing opens.
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

function isDemo(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')
}

export type Platform = 'desktop' | 'browser' | 'demo'

export function platform(): Platform {
  if (isDemo()) return 'demo'
  return isDesktop() ? 'desktop' : 'browser'
}

let chosen: FileSystem | undefined

/** The adapter for this platform, decided on first use and then kept. */
export function fileSystem(): FileSystem {
  if (!chosen) {
    chosen =
      platform() === 'demo'
        ? new MemoryFileSystem()
        : platform() === 'desktop'
          ? new TauriFileSystem()
          : new BrowserFileSystem()
  }
  return chosen
}
