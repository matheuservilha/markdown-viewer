import { describe, expect, it } from 'vitest'
import {
  COLUMN_PAD,
  DOCK_WIDTH,
  PEEK_WIDTH,
  SQUARE,
  SQUARE_GAP,
  columnHeight,
  dockRect,
  peekRect,
  squareRect,
  within,
  type Area,
} from './dock-layout'

/** A 1440x900 screen with a menu bar at the top, which is a laptop. */
const SCREEN: Area = { x: 0, y: 25, width: 1440, height: 875 }

describe('columnHeight', () => {
  it('is one square plus its air when there is one square', () => {
    expect(columnHeight(1)).toBe(COLUMN_PAD * 2 + SQUARE)
  })

  it('adds a gap for each square after the first', () => {
    expect(columnHeight(4) - columnHeight(3)).toBe(SQUARE + SQUARE_GAP)
  })

  it('never collapses to nothing, so an empty column is still reachable', () => {
    expect(columnHeight(0)).toBe(columnHeight(1))
  })
})

describe('dockRect', () => {
  it('sticks to the right edge of the work area', () => {
    const rect = dockRect(SCREEN, 'right', 3)
    expect(rect.x + rect.width).toBe(SCREEN.x + SCREEN.width)
    expect(rect.width).toBe(DOCK_WIDTH)
  })

  it('sticks to the left edge of the work area', () => {
    expect(dockRect(SCREEN, 'left', 3).x).toBe(SCREEN.x)
  })

  it('is exactly as tall as what is in it', () => {
    expect(dockRect(SCREEN, 'right', 5).height).toBe(columnHeight(5))
  })

  it('stays centred on the work area, not on the screen', () => {
    const rect = dockRect(SCREEN, 'right', 4)
    const above = rect.y - SCREEN.y
    const below = SCREEN.y + SCREEN.height - (rect.y + rect.height)
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1)
  })

  it('never runs off a screen too short to hold every square', () => {
    const short: Area = { x: 0, y: 40, width: 800, height: 120 }
    const rect = dockRect(short, 'right', 40)
    expect(rect.y).toBeGreaterThanOrEqual(short.y)
    expect(rect.y + rect.height).toBeLessThanOrEqual(short.y + short.height)
  })
})

describe('squareRect', () => {
  const dock = dockRect(SCREEN, 'right', 3)

  it('leaves room on the inner side for the square to lean into', () => {
    const square = squareRect(dock, 'right', 0)
    expect(square.x).toBeGreaterThan(dock.x)
    expect(square.x + square.width).toBeLessThan(dock.x + dock.width)
  })

  it('stacks the squares down the column', () => {
    expect(squareRect(dock, 'right', 1).y - squareRect(dock, 'right', 0).y).toBe(
      SQUARE + SQUARE_GAP,
    )
  })

  it('keeps every square inside the window it lives in', () => {
    for (let index = 0; index < 3; index++) {
      const square = squareRect(dock, 'right', index)
      expect(square.y).toBeGreaterThanOrEqual(dock.y)
      expect(square.y + square.height).toBeLessThanOrEqual(dock.y + dock.height)
    }
  })

  it('leans the other way on the left edge', () => {
    const left = dockRect(SCREEN, 'left', 3)
    const square = squareRect(left, 'left', 0)
    expect(square.x).toBeGreaterThanOrEqual(left.x)
    expect(square.x + square.width).toBeLessThan(left.x + left.width)
  })
})

describe('within', () => {
  const rect = { x: 100, y: 200, width: 50, height: 40 }

  it('says yes inside and on the edges', () => {
    expect(within(rect, 120, 220)).toBe(true)
    expect(within(rect, 100, 200)).toBe(true)
    expect(within(rect, 150, 240)).toBe(true)
  })

  it('says no outside, on every side', () => {
    expect(within(rect, 99, 220)).toBe(false)
    expect(within(rect, 151, 220)).toBe(false)
    expect(within(rect, 120, 199)).toBe(false)
    expect(within(rect, 120, 241)).toBe(false)
  })

  it('lets the slack cover a square that leaned away from the pointer', () => {
    expect(within(rect, 95, 220, 6)).toBe(true)
    expect(within(rect, 93, 220, 6)).toBe(false)
  })
})

describe('peekRect', () => {
  const dock = dockRect(SCREEN, 'right', 3)

  it('opens on the inner side of a column on the right', () => {
    const rect = peekRect(SCREEN, 'right', dock, 400, 400)
    expect(rect.x + rect.width).toBeLessThanOrEqual(dock.x)
    expect(rect.width).toBe(PEEK_WIDTH)
  })

  it('opens on the inner side of a column on the left', () => {
    const left = dockRect(SCREEN, 'left', 3)
    const rect = peekRect(SCREEN, 'left', left, 400, 400)
    expect(rect.x).toBeGreaterThanOrEqual(left.x + left.width)
  })

  it('is level with the square it came out of', () => {
    const rect = peekRect(SCREEN, 'right', dock, 400, 500)
    expect(rect.y + rect.height / 2).toBeCloseTo(500, 0)
  })

  it('never hangs off the top or the bottom of the work area', () => {
    for (const anchor of [-500, 0, 40, 880, 5000]) {
      const rect = peekRect(SCREEN, 'right', dock, 400, anchor)
      expect(rect.y).toBeGreaterThanOrEqual(SCREEN.y)
      expect(rect.y + rect.height).toBeLessThanOrEqual(SCREEN.y + SCREEN.height)
    }
  })

  it('never hangs off the side of the work area, however narrow the screen', () => {
    const narrow: Area = { x: 0, y: 0, width: 520, height: 700 }
    const tight = dockRect(narrow, 'right', 3)
    const rect = peekRect(narrow, 'right', tight, 400, 350)
    expect(rect.x).toBeGreaterThanOrEqual(narrow.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(narrow.x + narrow.width)
  })

  it('takes the work area into account on a screen that does not start at zero', () => {
    const second: Area = { x: 1440, y: 0, width: 1920, height: 1080 }
    const right = dockRect(second, 'right', 3)
    const rect = peekRect(second, 'right', right, 400, 500)
    expect(rect.x).toBeGreaterThanOrEqual(second.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(second.x + second.width)
  })
})
