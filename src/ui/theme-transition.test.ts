import { describe, expect, it } from 'vitest'
import { centreOf, radiusToCover } from './theme-transition'

const WINDOW = { width: 1000, height: 600 }

/** The corner furthest from the origin, which is the one the circle must reach. */
const corners = (size: { width: number; height: number }) => [
  { x: 0, y: 0 },
  { x: size.width, y: 0 },
  { x: 0, y: size.height },
  { x: size.width, y: size.height },
]

const reaches = (origin: { x: number; y: number }, size: typeof WINDOW) => {
  const radius = radiusToCover(origin, size)
  return corners(size).every(
    (corner) => Math.hypot(corner.x - origin.x, corner.y - origin.y) <= radius + 1e-9,
  )
}

describe('radiusToCover', () => {
  it('reaches the far corner from the middle', () => {
    expect(radiusToCover({ x: 500, y: 300 }, WINDOW)).toBeCloseTo(Math.hypot(500, 300))
  })

  it('reaches the opposite corner from a corner', () => {
    expect(radiusToCover({ x: 0, y: 0 }, WINDOW)).toBeCloseTo(Math.hypot(1000, 600))
  })

  it('measures to the far side, not the near one', () => {
    // Near the left edge, where measuring the short way would leave the right
    // of the window showing the old theme when the circle stops growing.
    expect(radiusToCover({ x: 40, y: 300 }, WINDOW)).toBeCloseTo(Math.hypot(960, 300))
  })

  it('covers every corner, wherever the button sits', () => {
    const spots = [
      { x: 0, y: 0 },
      { x: 1000, y: 600 },
      { x: 40, y: 34 },
      { x: 500, y: 300 },
      { x: 999, y: 1 },
    ]
    for (const spot of spots) expect(reaches(spot, WINDOW)).toBe(true)
  })

  it('an origin dragged outside the window still covers it', () => {
    expect(reaches({ x: -50, y: -50 }, WINDOW)).toBe(true)
  })

  it('a window of no size asks for no circle', () => {
    expect(radiusToCover({ x: 0, y: 0 }, { width: 0, height: 0 })).toBe(0)
  })
})

describe('centreOf', () => {
  it('is the middle of the box, not its corner', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 20, top: 100, width: 30, height: 30 }),
    } as unknown as Element
    expect(centreOf(element)).toEqual({ x: 35, y: 115 })
  })
})
