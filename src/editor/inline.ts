/**
 * Inline Markdown drawn inside a widget, for the table cells.
 *
 * The cell shows the text rendered while nobody is in it, and the raw Markdown
 * once the caret arrives: the same trade the rest of the editor makes, at the
 * size of one cell.
 */

import { renderInlineHtml } from './export-html'

export function renderInline(text: string): DocumentFragment {
  // A template parses without running or fetching anything, which is what
  // makes it safe to hand it text somebody typed.
  const template = document.createElement('template')
  template.innerHTML = renderInlineHtml(text)

  // An image would need the document's folder to resolve, which a cell does
  // not have. Its description is shown instead of a broken picture.
  for (const image of template.content.querySelectorAll('img')) {
    image.replaceWith(image.getAttribute('alt') ?? '')
  }
  return template.content
}
