/**
 * The notes that live on the edge of the screen.
 *
 * A note gets there two ways and no others: somebody pinned it from the app,
 * or it was born from the dock's own button. Neither happens by accident, so
 * the list stays short and stays the person's.
 *
 * Only the address of the note is kept here, never its text. A pinned file is
 * still just a file on disk; a pinned draft is still in the drafts store. This
 * list says which of them show up on the edge, and in what order.
 */

import { DRAFT_BASE } from './drafts'

/**
 * The colours a note can carry.
 *
 * The colour is the whole of the closed dock: with the list rolled up there is
 * one dash per note and nothing else, so the dash has to be enough to tell
 * them apart.
 */
export const PIN_COLORS = ['ambar', 'coral', 'malva', 'musgo', 'oceano', 'ardosia'] as const

export type PinColor = (typeof PIN_COLORS)[number]

export interface Pin {
  /** The entry id, so a note is never pinned twice. */
  id: string
  baseId: string
  path: string
  name: string
  /** Full path, for a file pinned from outside every folder. */
  label?: string
  color: PinColor
  at: number
}

const STORAGE_KEY = 'markdown-viewer.pinned'

export function loadPins(): Pin[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPin)
  } catch {
    return []
  }
}

export function savePins(pins: readonly Pin[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
  } catch {
    // Storage full or blocked. The dock on screen is still right; only the
    // memory of it across restarts is lost.
  }
}

function isPin(value: unknown): value is Pin {
  if (typeof value !== 'object' || value === null) return false
  const pin = value as Pin
  return (
    typeof pin.id === 'string' &&
    typeof pin.baseId === 'string' &&
    typeof pin.path === 'string' &&
    typeof pin.name === 'string'
  )
}

export function isPinned(pins: readonly Pin[], id: string): boolean {
  return pins.some((pin) => pin.id === id)
}

export function findPin(pins: readonly Pin[], id: string): Pin | undefined {
  return pins.find((pin) => pin.id === id)
}

export function isDraftPin(pin: { baseId: string }): boolean {
  return pin.baseId === DRAFT_BASE
}

export interface PinTarget {
  id: string
  baseId: string
  path: string
  name: string
  label?: string
}

/**
 * Adds a note to the end of the list. Pinning something already pinned does
 * nothing at all, rather than moving it, because a second click on a pin is
 * far more likely to be a slip than a request to reorder.
 */
export function addPin(pins: readonly Pin[], target: PinTarget, now = Date.now()): Pin[] {
  if (isPinned(pins, target.id)) return [...pins]
  const pin: Pin = {
    id: target.id,
    baseId: target.baseId,
    path: target.path,
    name: target.name,
    color: freeColor(pins),
    at: now,
  }
  if (target.label !== undefined) pin.label = target.label
  return [...pins, pin]
}

export function removePin(pins: readonly Pin[], id: string): Pin[] {
  return pins.filter((pin) => pin.id !== id)
}

export function togglePin(pins: readonly Pin[], target: PinTarget, now = Date.now()): Pin[] {
  return isPinned(pins, target.id) ? removePin(pins, target.id) : addPin(pins, target, now)
}

export function renamePin(pins: readonly Pin[], id: string, name: string): Pin[] {
  return pins.map((pin) => (pin.id === id ? { ...pin, name } : pin))
}

/**
 * Points a note at the same text under a new address, keeping its colour and
 * its place in the column: a file renamed from its title is still that note.
 */
export function repointPin(pins: readonly Pin[], from: string, target: PinTarget): Pin[] {
  return pins.map((pin) => {
    if (pin.id !== from) return pin
    const { label: _label, ...rest } = pin
    const next: Pin = {
      ...rest,
      id: target.id,
      baseId: target.baseId,
      path: target.path,
      name: target.name,
    }
    if (target.label !== undefined) next.label = target.label
    return next
  })
}

export function recolourPin(pins: readonly Pin[], id: string, color: PinColor): Pin[] {
  return pins.map((pin) => (pin.id === id ? { ...pin, color } : pin))
}

/**
 * Puts the list back in the order the ids give.
 *
 * Ids the list does not know are ignored, and pins the order forgot keep their
 * place at the end: a reorder that arrives from another window a moment after
 * something was pinned must not make that new note disappear.
 */
export function reorderPins(pins: readonly Pin[], ids: readonly string[]): Pin[] {
  const wanted = ids.flatMap((id) => findPin(pins, id) ?? [])
  const rest = pins.filter((pin) => !ids.includes(pin.id))
  return [...wanted, ...rest]
}

/** The colour the fewest notes are already wearing, so they stay tellable apart. */
export function freeColor(pins: readonly Pin[]): PinColor {
  const used = new Map<PinColor, number>(PIN_COLORS.map((color) => [color, 0]))
  for (const pin of pins) used.set(pin.color, (used.get(pin.color) ?? 0) + 1)
  let best: PinColor = PIN_COLORS[0]
  for (const color of PIN_COLORS) {
    if ((used.get(color) ?? 0) < (used.get(best) ?? 0)) best = color
  }
  return best
}

/** What shows on the dash: the name, without the extension nobody needs there. */
export function pinTitle(pin: Pin): string {
  const dot = pin.name.lastIndexOf('.')
  return dot <= 0 ? pin.name : pin.name.slice(0, dot)
}
