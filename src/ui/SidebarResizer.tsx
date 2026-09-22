import { useCallback, useState } from 'react'
import { LIMITS } from '~/app/settings'

interface Props {
  width: number
  onCommit: (width: number) => void
  /** The CSS variable the width is written into while dragging. */
  variable?: string
  limits?: { min: number; max: number }
  /**
   * True for a panel on the right, which widens as the pointer travels left.
   * The pointer moves one way and the panel the other, so the sign flips.
   */
  invert?: boolean
  label?: string
  /** The width a double click goes back to. */
  restore?: number
}

/**
 * The handle between a side panel and the editor.
 *
 * While the pointer is down the width is written straight into the CSS
 * variable, and only the value it lands on goes through React. Dragging a
 * panel is one of the few places where a render per frame is felt.
 */
export function SidebarResizer({
  width,
  onCommit,
  variable = '--sidebar-width',
  limits = LIMITS.sidebarWidth,
  invert = false,
  label = 'Largura da barra lateral',
  restore = 216,
}: Props) {
  const [dragging, setDragging] = useState(false)

  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, limits.min), limits.max),
    [limits],
  )

  const apply = useCallback(
    (next: number) => {
      document.documentElement.style.setProperty(variable, next + 'px')
    },
    [variable],
  )

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      setDragging(true)

      const origin = event.clientX
      let latest = width

      const onMove = (move: PointerEvent) => {
        const travelled = move.clientX - origin
        latest = clamp(width + (invert ? -travelled : travelled))
        apply(latest)
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDragging(false)
        onCommit(latest)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [apply, clamp, invert, onCommit, width],
  )

  return (
    <div
      className={'resizer' + (dragging ? ' is-dragging' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      onPointerDown={startDrag}
      onDoubleClick={() => onCommit(restore)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8
        const back = invert ? step : -step
        const forth = invert ? -step : step
        if (event.key === 'ArrowLeft') onCommit(clamp(width + back))
        if (event.key === 'ArrowRight') onCommit(clamp(width + forth))
      }}
    />
  )
}
