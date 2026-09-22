import { describe, expect, it } from 'vitest'
import {
  DOCK_MIN_HEIGHT,
  DOCK_WIDTH,
  PEEK_WIDTH,
  RAIL_WIDTH,
  dockRect,
  peekRect,
  within,
  type Area,
} from './dock-layout'

/** A 1440x900 screen with a menu bar at the top, which is a laptop. */
const SCREEN: Area = { x: 0, y: 25, width: 1440, height: 875 }

describe('dockRect', () => {
  it('sticks to the right edge of the work area', () => {
    const rect = dockRect(SCREEN, 'right', true, 300)
    expect(rect.x + rect.width).toBe(SCREEN.x + SCREEN.width)
    expect(rect.width).toBe(DOCK_WIDTH)
  })

  it('sticks to the left edge of the work area', () => {
    expect(dockRect(SCREEN, 'left', true, 300).x).toBe(SCREEN.x)
  })

  it('is a narrow rail when it is rolled up', () => {
    const rect = dockRect(SCREEN, 'right', false, 300)
    expect(rect.width).toBe(RAIL_WIDTH)
    expect(rect.x + rect.width).toBe(SCREEN.x + SCREEN.width)
  })

  it('stays centred on the work area, not on the screen', () => {
    const rect = dockRect(SCREEN, 'right', true, 300)
    const above = rect.y - SCREEN.y
    const below = SCREEN.y + SCREEN.height - (rect.y + rect.height)
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1)
  })

  it('never opens shorter than the minimum, however few notes there are', () => {
    expect(dockRect(SCREEN, 'right', true, 4).height).toBe(DOCK_MIN_HEIGHT)
  })

  it('stops growing before it fills the screen', () => {
    const rect = dockRect(SCREEN, 'right', true, 5000)
    expect(rect.height).toBeLessThan(SCREEN.height)
    expect(rect.y).toBeGreaterThanOrEqual(SCREEN.y)
    expect(rect.y + rect.height).toBeLessThanOrEqual(SCREEN.y + SCREEN.height)
  })

  it('keeps a huge dock inside a short work area', () => {
    const short: Area = { x: 0, y: 0, width: 800, height: 120 }
    const rect = dockRect(short, 'right', true, 5000)
    expect(rect.y).toBeGreaterThanOrEqual(short.y)
    expect(rect.height).toBeLessThanOrEqual(short.height)
  })

  it('never starts above the work area, even on a screen shorter than itself', () => {
    const sliver: Area = { x: 0, y: 40, width: 800, height: 60 }
    expect(dockRect(sliver, 'right', true, 5000).y).toBe(sliver.y)
    expect(dockRect(sliver, 'right', true, 10).height).toBe(DOCK_MIN_HEIGHT)
  })
})

describe('peekRect', () => {
  const dock = dockRect(SCREEN, 'right', true, 300)

  it('opens against the inner face of a dock on the right', () => {
    const rect = peekRect(SCREEN, 'right', dock, 400, 400)
    expect(rect.x + rect.width).toBeLessThanOrEqual(dock.x)
    expect(rect.width).toBe(PEEK_WIDTH)
  })

  it('opens against the inner face of a dock on the left', () => {
    const left = dockRect(SCREEN, 'left', true, 300)
    const rect = peekRect(SCREEN, 'left', left, 400, 400)
    expect(rect.x).toBeGreaterThanOrEqual(left.x + left.width)
  })

  it('is level with the row the pointer is on', () => {
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
    const tight = dockRect(narrow, 'right', true, 300)
    const rect = peekRect(narrow, 'right', tight, 400, 350)
    expect(rect.x).toBeGreaterThanOrEqual(narrow.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(narrow.x + narrow.width)
  })

  it('takes the work area into account on a screen that does not start at zero', () => {
    const second: Area = { x: 1440, y: 0, width: 1920, height: 1080 }
    const right = dockRect(second, 'right', true, 300)
    const rect = peekRect(second, 'right', right, 400, 500)
    expect(rect.x).toBeGreaterThanOrEqual(second.x)
    expect(rect.x + rect.width).toBeLessThanOrEqual(second.x + second.width)
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

  it('lets the slack cover the seam between two panels', () => {
    expect(within(rect, 95, 220, 6)).toBe(true)
    expect(within(rect, 93, 220, 6)).toBe(false)
  })
})

describe('peekRect against the dock', () => {
  it('leaves no strip of desktop between the note and the list', () => {
    const dock = dockRect(SCREEN, 'right', true, 300)
    const rect = peekRect(SCREEN, 'right', dock, 400, 400)
    expect(rect.x + rect.width).toBe(dock.x)
  })

  it('does the same on the left', () => {
    const dock = dockRect(SCREEN, 'left', true, 300)
    const rect = peekRect(SCREEN, 'left', dock, 400, 400)
    expect(rect.x).toBe(dock.x + dock.width)
  })
})
