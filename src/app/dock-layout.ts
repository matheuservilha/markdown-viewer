/**
 * Where the panels go on the screen.
 *
 * All of it is arithmetic over a rectangle, on purpose. The screen, the
 * monitor and the window system stay on the other side of this file, so the
 * one thing that is easy to get wrong, a panel half off the edge or under the
 * taskbar, can be checked without a screen around it.
 *
 * Every number here is in the CSS pixels of the screen the panel is on. The
 * Rust side hands the work area over in those pixels and takes them back in
 * the same ones, so a Mac at 2x and a monitor at 1x are the same arithmetic.
 */

export type Side = 'left' | 'right'

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The strip left on the edge when the pointer is elsewhere. */
export const RAIL_WIDTH = 13
/** The dock with its list of notes open. */
export const DOCK_WIDTH = 232
export const DOCK_MIN_HEIGHT = 96
/**
 * How much of the screen's height the dock may take. A dock as tall as the
 * screen stops reading as a panel and starts reading as a second window.
 */
const DOCK_MAX_FILL = 0.82

export const PEEK_WIDTH = 392
export const PEEK_MIN_HEIGHT = 220
export const PEEK_MAX_HEIGHT = 620
/**
 * Breathing room between the note and the edges of the screen.
 *
 * It is never applied between the note and the list. The pointer travels from
 * one to the other, and a strip of desktop in between is a strip where the
 * pointer is on neither of them.
 */
const MARGIN = 10

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * The dock: flush against its edge, centred on the height of the screen.
 *
 * It sits on the edge rather than near it because the edge is the one place a
 * pointer can reach without aiming. Throwing the mouse at the side of the
 * screen lands on the dock every time.
 */
export function dockRect(area: Area, side: Side, expanded: boolean, contentHeight: number): Rect {
  const width = expanded ? DOCK_WIDTH : RAIL_WIDTH
  const ceiling = Math.max(DOCK_MIN_HEIGHT, Math.round(area.height * DOCK_MAX_FILL))
  const height = clamp(Math.round(contentHeight), DOCK_MIN_HEIGHT, ceiling)

  return {
    x: side === 'right' ? area.x + area.width - width : area.x,
    // Centred, but never above the top of the work area: a screen shorter
    // than the dock's own minimum would otherwise push its head under the
    // menu bar.
    y: Math.max(area.y, area.y + Math.round((area.height - height) / 2)),
    width,
    height,
  }
}

/**
 * The note that floats beside the dock.
 *
 * It opens against the inner face of the dock, level with the row the pointer
 * is on, so the note appears to come out of the row it belongs to. Where there
 * is no room on that side, which happens on a narrow screen, it goes to the
 * other side of the dock rather than off the screen.
 */
export function peekRect(
  area: Area,
  side: Side,
  dock: Rect,
  contentHeight: number,
  anchorY: number,
): Rect {
  const height = clamp(Math.round(contentHeight), PEEK_MIN_HEIGHT, maxPeekHeight(area))
  const width = Math.min(PEEK_WIDTH, Math.max(240, area.width - dock.width - MARGIN * 2))

  const inner = side === 'right' ? dock.x - width : dock.x + dock.width
  const outer = side === 'right' ? dock.x + dock.width : dock.x - width

  const fits = (x: number) => x >= area.x && x + width <= area.x + area.width
  const x = fits(inner) ? inner : fits(outer) ? outer : clampX(area, width)

  return {
    x: Math.round(x),
    y: Math.round(
      clamp(anchorY - height / 2, area.y + MARGIN, area.y + area.height - height - MARGIN),
    ),
    width,
    height,
  }
}

/**
 * Whether a point is on a panel.
 *
 * The slack is what makes the trip from the list to the note survive: the
 * pointer is read a few times a second, so between two readings it can be on
 * the seam between the two windows, or a pixel past an edge it is heading
 * back into.
 */
export function within(rect: Rect, x: number, y: number, slack = 0): boolean {
  return (
    x >= rect.x - slack &&
    x <= rect.x + rect.width + slack &&
    y >= rect.y - slack &&
    y <= rect.y + rect.height + slack
  )
}

export function maxPeekHeight(area: Area): number {
  return clamp(area.height - MARGIN * 2, PEEK_MIN_HEIGHT, PEEK_MAX_HEIGHT)
}

function clampX(area: Area, width: number): number {
  return clamp(area.x + Math.round((area.width - width) / 2), area.x, area.x + area.width - width)
}
