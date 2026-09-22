/**
 * Which of the three windows this code is running in.
 *
 * All three are the same web app: the dock and the floating note are not a
 * second bundle, they are this one under another window label. Building it
 * once is what keeps the editor in the floating note the same editor as the
 * one in the app, down to the theme and the keyboard.
 */

import { isDesktop } from '.'

export type WindowRole = 'main' | 'dock' | 'peek' | 'note'

const ROLES: WindowRole[] = ['main', 'dock', 'peek', 'note']

interface Injected {
  __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } }
}

/**
 * The label Tauri gave this window.
 *
 * Read out of the bridge Tauri injects rather than through
 * `getCurrentWindow()`, which would pull the whole window module into the
 * chunk the app starts from. This runs before the first paint, in every
 * window, to decide what to render, so it cannot wait for an import either.
 */
function fromLabel(): WindowRole | null {
  if (!isDesktop()) return null
  try {
    const label = (window as Injected).__TAURI_INTERNALS__?.metadata?.currentWindow?.label
    return ROLES.find((role) => role === label) ?? null
  } catch {
    // A label we cannot read means the app window, which is the one that
    // exists before any panel does.
    return null
  }
}

/**
 * The query string wins over the window label, so that either panel can be
 * opened in an ordinary browser tab and worked on without a desktop build
 * around it.
 */
export function windowRole(search = globalThis.location?.search ?? ''): WindowRole {
  const asked = new URLSearchParams(search).get('window')
  return ROLES.find((role) => role === asked) ?? fromLabel() ?? 'main'
}
