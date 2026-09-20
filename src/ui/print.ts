/**
 * Printing, and saving a PDF, which on every system this app targets is the
 * same dialog with a different button.
 *
 * The document is printed from a frame of its own so that the print carries the
 * exported stylesheet and not the interface around it.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0'

  frame.addEventListener(
    'load',
    () => {
      const view = frame.contentWindow
      if (!view) return
      view.focus()
      view.print()
      // The dialog is modal, so by the time it closes the frame has done its job.
      window.setTimeout(() => frame.remove(), 60_000)
    },
    { once: true },
  )

  frame.srcdoc = html
  document.body.append(frame)
}
