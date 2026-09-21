/**
 * The little menu a table handle opens.
 *
 * The editor widgets live outside React, so this builds the same `.menu` the
 * rest of the interface uses, by hand, and hangs it on the body: a menu opened
 * from inside a widget has to outlive the widget being rebuilt under it.
 */

export interface MenuEntry {
  label: string
  run: () => void
  /** Drawn apart from the rest, in the warning colour. */
  destructive?: boolean
  /** A rule is drawn above this entry. */
  separated?: boolean
  /** Marked as the one in force, for a choice like the alignment. */
  current?: boolean
}

let open: (() => void) | null = null

/** Closes whatever menu is on screen, if any. */
export function closeMenu(): void {
  open?.()
}

export function openMenu(x: number, y: number, entries: MenuEntry[]): HTMLElement {
  closeMenu()

  const menu = document.createElement('div')
  menu.className = 'menu'
  menu.setAttribute('role', 'menu')
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'

  for (const entry of entries) {
    const item = document.createElement('button')
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.className =
      'menu-item' +
      (entry.destructive ? ' is-destructive' : '') +
      (entry.separated ? ' is-separated' : '')
    item.textContent = entry.label
    if (entry.current) {
      const check = document.createElement('span')
      check.className = 'menu-hint'
      check.textContent = '✓'
      item.append(check)
    }
    item.addEventListener('click', () => {
      dismiss()
      entry.run()
    })
    menu.append(item)
  }

  // Swallowed so that the click that opens the menu does not also close it.
  menu.addEventListener('pointerdown', (event) => event.stopPropagation())
  document.body.append(menu)

  // Measured and nudged back inside the window, so a menu opened near an edge
  // does not fall off it.
  const margin = 8
  menu.style.left =
    Math.max(margin, Math.min(x, window.innerWidth - menu.offsetWidth - margin)) + 'px'
  menu.style.top =
    Math.max(margin, Math.min(y, window.innerHeight - menu.offsetHeight - margin)) + 'px'

  function dismiss() {
    menu.remove()
    window.removeEventListener('pointerdown', dismiss)
    window.removeEventListener('resize', dismiss)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('scroll', dismiss, true)
    open = null
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') dismiss()
  }

  window.addEventListener('pointerdown', dismiss)
  window.addEventListener('resize', dismiss)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('scroll', dismiss, true)
  open = dismiss

  return menu
}
