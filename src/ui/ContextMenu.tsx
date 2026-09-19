import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Drawn apart from the rest, in the warning colour. */
  destructive?: boolean
  disabled?: boolean
  /** A rule is drawn above this item. */
  separated?: boolean
  hint?: string
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<CSSProperties>({ left: x, top: y, visibility: 'hidden' })

  // Measured and nudged back inside the window before it is shown, so a menu
  // opened near an edge never falls off it.
  useLayoutEffect(() => {
    const element = menu.current
    if (!element) return
    const margin = 8
    setPlacement({
      left: Math.min(x, window.innerWidth - element.offsetWidth - margin),
      top: Math.min(y, window.innerHeight - element.offsetHeight - margin),
    })
  }, [x, y])

  useEffect(() => {
    const dismiss = () => onClose()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [onClose])

  return (
    <div
      ref={menu}
      className="menu"
      style={placement}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          role="menuitem"
          className={
            'menu-item' +
            (item.destructive ? ' is-destructive' : '') +
            (item.separated ? ' is-separated' : '')
          }
          disabled={item.disabled}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          <span>{item.label}</span>
          {item.hint && <kbd className="menu-hint">{item.hint}</kbd>}
        </button>
      ))}
    </div>
  )
}
