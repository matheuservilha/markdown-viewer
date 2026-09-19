import { useCallback, useState } from 'react'
import { LIMITS } from '~/app/settings'

interface Props {
  width: number
  onCommit: (width: number) => void
}

function clamp(value: number): number {
  return Math.min(Math.max(value, LIMITS.sidebarWidth.min), LIMITS.sidebarWidth.max)
}

/**
 * The handle between the tree and the editor.
 *
 * While the pointer is down the width is written straight into the CSS
 * variable, and only the value it lands on goes through React. Dragging a
 * panel is one of the few places where a render per frame is felt.
 */
export function SidebarResizer({ width, onCommit }: Props) {
  const [dragging, setDragging] = useState(false)

  const apply = useCallback((next: number) => {
    document.documentElement.style.setProperty('--sidebar-width', next + 'px')
  }, [])

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      setDragging(true)

      const origin = event.clientX
      let latest = width

      const onMove = (move: PointerEvent) => {
        latest = clamp(width + move.clientX - origin)
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
    [apply, onCommit, width],
  )

  return (
    <div
      className={'resizer' + (dragging ? ' is-dragging' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura da barra lateral"
      aria-valuenow={width}
      aria-valuemin={LIMITS.sidebarWidth.min}
      aria-valuemax={LIMITS.sidebarWidth.max}
      tabIndex={0}
      onPointerDown={startDrag}
      onDoubleClick={() => onCommit(216)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8
        if (event.key === 'ArrowLeft') onCommit(clamp(width - step))
        if (event.key === 'ArrowRight') onCommit(clamp(width + step))
      }}
    />
  )
}
