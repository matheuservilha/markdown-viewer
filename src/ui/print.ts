/**
 * Printing, and saving a PDF, which on the systems this app targets is the same
 * dialog with a different button.
 *
 * The document is printed from a frame of its own so that the print carries the
 * exported stylesheet and not the interface around it.
 */

/** Whether `window.print()` reaches a real dialog here. */
export function canPrint(): boolean {
  // The macOS web view the desktop build runs inside accepts the call and does
  // nothing with it: printing there has to go out through the browser.
  return typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)
}

export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')

    // A frame with no size prints a blank page. It is given a page-shaped box
    // and moved off screen instead of being collapsed.
    frame.style.cssText =
      'position:fixed;left:-20000px;top:0;width:820px;height:1160px;border:0;visibility:hidden'

    frame.addEventListener(
      'load',
      () => {
        const view = frame.contentWindow
        if (!view) {
          frame.remove()
          resolve()
          return
        }
        // Visible to the layout engine, off screen for the person.
        frame.style.visibility = 'visible'
        view.focus()
        view.print()
        // The dialog is modal, so by the time it returns the frame is done.
        window.setTimeout(() => frame.remove(), 1000)
        resolve()
      },
      { once: true },
    )

    frame.srcdoc = html
    document.body.append(frame)
  })
}
