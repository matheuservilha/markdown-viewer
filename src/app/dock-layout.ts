/**
 * Where the squares and the note go on the screen.
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

/** The side of one square. */
export const SQUARE = 26
/** Air between two squares. */
export const SQUARE_GAP = 9
/** Air above the first square and below the last. */
export const COLUMN_PAD = 8
/**
 * How far a square is inset from the edge of the screen, and therefore how
 * much room is left on the other side of the window for it to lean out into
 * when the pointer arrives.
 */
export const SQUARE_INSET = 5
export const LEAN = 9
/** The window that holds the column: one square wide, plus room to lean. */
export const DOCK_WIDTH = SQUARE + SQUARE_INSET + LEAN

export const PEEK_WIDTH = 392
export const PEEK_MIN_HEIGHT = 220
export const PEEK_MAX_HEIGHT = 620
/** Air between the note and the squares, and between the note and the screen. */
const GAP = 8
const MARGIN = 10

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** How tall a column of `count` squares is, with its air. */
export function columnHeight(count: number): number {
  const squares = Math.max(count, 1)
  return COLUMN_PAD * 2 + squares * SQUARE + (squares - 1) * SQUARE_GAP
}

/**
 * The window that holds the squares: flush against its edge, centred on the
 * height of the screen.
 *
 * It sits on the edge rather than near it because the edge is the one place a
 * pointer can reach without aiming. Throwing the mouse at the side of the
 * screen lands on the column every time.
 *
 * `count` is the number of squares, the notes plus the one that writes a new
 * one, so the window is exactly as tall as what is in it and no taller. A
 * transparent window that is bigger than its contents is a piece of screen
 * that silently swallows clicks.
 */
export function dockRect(area: Area, side: Side, count: number): Rect {
  const height = Math.min(columnHeight(count), area.height)
  return {
    x: side === 'right' ? area.x + area.width - DOCK_WIDTH : area.x,
    y: Math.max(area.y, area.y + Math.round((area.height - height) / 2)),
    width: DOCK_WIDTH,
    height,
  }
}

/**
 * One square, on the screen.
 *
 * The app's window needs this to tell whether the pointer is still on the
 * square whose note is showing. The square itself knows where it is, but it
 * cannot be asked: a window that is always on top and was never clicked is not
 * the active window, and is not reliably told that the pointer left it.
 */
export function squareRect(dock: Rect, side: Side, index: number): Rect {
  return {
    x: side === 'right' ? dock.x + LEAN : dock.x + SQUARE_INSET,
    y: dock.y + COLUMN_PAD + index * (SQUARE + SQUARE_GAP),
    width: SQUARE,
    height: SQUARE,
  }
}

/**
 * Whether a point is on a rectangle.
 *
 * The slack matters because the pointer is read a few times a second rather
 * than followed: between two readings it can be a pixel outside a square it is
 * sitting still on, while the square leans out to meet it.
 */
export function within(rect: Rect, x: number, y: number, slack = 0): boolean {
  return (
    x >= rect.x - slack &&
    x <= rect.x + rect.width + slack &&
    y >= rect.y - slack &&
    y <= rect.y + rect.height + slack
  )
}

/**
 * The note that floats out beside a square.
 *
 * It opens on the inner side of the column, level with the square it belongs
 * to, so it reads as coming out of that square. Where there is no room on that
 * side, which happens on a narrow screen, it goes to the other side rather
 * than off the edge.
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

  const inner = side === 'right' ? dock.x - width - GAP : dock.x + dock.width + GAP
  const outer = side === 'right' ? dock.x + dock.width + GAP : dock.x - width - GAP

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

export function maxPeekHeight(area: Area): number {
  return clamp(area.height - MARGIN * 2, PEEK_MIN_HEIGHT, PEEK_MAX_HEIGHT)
}

function clampX(area: Area, width: number): number {
  return clamp(area.x + Math.round((area.width - width) / 2), area.x, area.x + area.width - width)
}
