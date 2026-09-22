/**
 * The circle that opens from the theme button when the theme changes.
 *
 * The browser does the hard part. `startViewTransition` photographs the page,
 * runs the change, photographs it again, and holds both pictures stacked. All
 * that is left here is to say how one gives way to the other: the new picture
 * is revealed through a circle that grows from the button until it covers the
 * window. The old theme is never animated, it is simply uncovered from under
 * the new one, which is why nothing in the interface has to know this happens.
 *
 * Two ways out, both silent. A browser without the API changes the theme at
 * once, and so does a machine whose owner asked for less movement.
 */

import { flushSync } from 'react-dom'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** How long the circle takes to cross the window. */
const DURATION_MS = 560

/**
 * How far the circle has to grow, from a point, to cover the whole window.
 *
 * The far corner is what decides. Measuring to the nearest one leaves the
 * opposite corner still showing the old theme when the animation ends, and a
 * button sitting in a corner is the case that makes it obvious.
 */
export function radiusToCover(origin: Point, size: Size): number {
  const furthestX = Math.max(origin.x, size.width - origin.x)
  const furthestY = Math.max(origin.y, size.height - origin.y)
  return Math.hypot(furthestX, furthestY)
}

/** Whether this machine's owner asked for less movement. */
export function prefersLessMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Changes the theme, opening the circle from `origin` when that is possible.
 *
 * `change` is run inside `flushSync` because the browser photographs the page
 * the moment the callback returns. A React state update that is still waiting
 * its turn would be photographed as the old theme, and the circle would open
 * on a picture identical to the one underneath it.
 */
export function changeTheme(origin: Point | null, change: () => void): void {
  // Optional even though the types promise it: the call has to survive a web
  // view older than the API, which is exactly where this has to degrade well.
  const start = document.startViewTransition?.bind(document)

  if (!start || !origin || prefersLessMotion()) {
    change()
    return
  }

  const size = { width: window.innerWidth, height: window.innerHeight }
  const radius = radiusToCover(origin, size)
  const at = `at ${origin.x}px ${origin.y}px`

  start(() => flushSync(change))
    .ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px ${at})`, `circle(${radius}px ${at})`] },
        {
          duration: DURATION_MS,
          easing: 'cubic-bezier(.4, 0, .2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    // A transition the browser abandons, because another one started or the
    // tab went to the background, rejects. The theme already changed.
    .catch(() => {})
}

/** The middle of an element, which is where its circle opens from. */
export function centreOf(element: Element): Point {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}
