import { describe, expect, it } from 'vitest'
import {
  CHIP_GAP,
  CHIP_HEIGHT,
  COLUMN_PAD,
  DOCK_WIDTH,
  PEEK_WIDTH,
  chipRect,
  columnHeight,
  dockRect,
  peekRect,
  within,
  type Area,
} from './dock-layout'

/** A 1440x900 screen with a menu bar at the top, which is a laptop. */
const SCREEN: Area = { x: 0, y: 25, width: 1440, height: 875 }

describe('columnHeight', () => {
  it('is one tab plus its air when there is one tab', () => {
    expect(columnHeight(1)).toBe(COLUMN_PAD * 2 + CHIP_HEIGHT)
  })

  it('adds a gap for each tab after the first', () => {
    expect(columnHeight(4) - columnHeight(3)).toBe(CHIP_HEIGHT + CHIP_GAP)
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

  it('is exactly as wide as the widest a tab ever gets', () => {
    expect(dockRect(SCREEN, 'right', 5).width).toBe(DOCK_WIDTH)
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

describe('chipRect', () => {
  const dock = dockRect(SCREEN, 'right', 3)

  it('runs the full width of the column, which is how wide a tab gets', () => {
    const chip = chipRect(dock, 0)
    expect(chip.x).toBe(dock.x)
    expect(chip.width).toBe(dock.width)
  })

  it('reaches the edge of the screen, because the tab is cut off by it', () => {
    expect(chipRect(dock, 0).x + chipRect(dock, 0).width).toBe(SCREEN.x + SCREEN.width)
  })

  it('stacks the tabs down the column', () => {
    expect(chipRect(dock, 1).y - chipRect(dock, 0).y).toBe(CHIP_HEIGHT + CHIP_GAP)
  })

  it('keeps every tab inside the window it lives in', () => {
    for (let index = 0; index < 3; index++) {
      const chip = chipRect(dock, index)
      expect(chip.y).toBeGreaterThanOrEqual(dock.y)
      expect(chip.y + chip.height).toBeLessThanOrEqual(dock.y + dock.height)
    }
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

  it('lets the slack cover a tab still growing to meet the pointer', () => {
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
