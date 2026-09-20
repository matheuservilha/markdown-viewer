import { useEffect, useState } from 'react'

interface Edges {
  left: number
  right: number
}

/**
 * Two hairlines on the edges of the reading column, shown while the width is
 * being adjusted.
 *
 * The edges are measured from the live element on every frame instead of being
 * computed from the setting, because the column is also capped by the width of
 * the window: a guide drawn from the number alone would drift off the text the
 * moment the setting runs past the space available.
 */
export function MeasureGuides({ active }: { active: boolean }) {
  const [edges, setEdges] = useState<Edges | null>(null)

  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = () => {
      const content = document.querySelector('.cm-content')
      if (content) {
        const box = content.getBoundingClientRect()
        setEdges((current) =>
          current && current.left === box.left && current.right === box.right
            ? current
            : { left: box.left, right: box.right },
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])

  // The guides are derived from `active` rather than cleared in the effect, so
  // switching them off does not schedule another render.
  if (!active || !edges) return null

  return (
    <div className="measure-guides" aria-hidden="true">
      <span className="measure-guide" style={{ left: edges.left }} />
      <span className="measure-guide" style={{ left: edges.right - 1 }} />
      <span className="measure-badge" style={{ left: (edges.left + edges.right) / 2 }}>
        {Math.round(edges.right - edges.left)} px
      </span>
    </div>
  )
}
