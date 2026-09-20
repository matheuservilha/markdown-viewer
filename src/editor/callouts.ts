/**
 * Callouts, in the GitHub spelling `> [!NOTE]` and the wider Obsidian set that
 * notes in the wild actually use. An unknown type still draws a box, in the
 * neutral colour, instead of falling back to a bare quote.
 */

import { WidgetType } from '@codemirror/view'

/** Every alias resolves to one of these, which is also the CSS class suffix. */
const ALIASES: Record<string, string> = {
  note: 'note',
  info: 'note',
  todo: 'note',
  abstract: 'abstract',
  summary: 'abstract',
  tldr: 'abstract',
  tip: 'tip',
  hint: 'tip',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'question',
  help: 'question',
  faq: 'question',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
  attention: 'warning',
  failure: 'failure',
  fail: 'failure',
  missing: 'failure',
  danger: 'failure',
  error: 'failure',
  bug: 'bug',
  example: 'example',
  quote: 'quote',
  cite: 'quote',
}

const PATHS: Record<string, string> = {
  note: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.75 9.75h-1.5v-4h1.5v4Zm0-5.5h-1.5v-1.5h1.5v1.5Z',
  abstract:
    'M5 1.5h6A1.5 1.5 0 0 1 12.5 3v10A1.5 1.5 0 0 1 11 14.5H5A1.5 1.5 0 0 1 3.5 13V3A1.5 1.5 0 0 1 5 1.5Zm.5 3v1.2h5V4.5h-5Zm0 3v1.2h5V7.5h-5Zm0 3v1.2h3v-1.2h-3Z',
  tip: 'M8 1.5c-2.2 0-4 1.8-4 4 0 1.5.8 2.5 1.5 3.3.4.5.6.8.6 1.2v.5h3.8v-.5c0-.4.2-.7.6-1.2C11.2 8 12 7 12 5.5c0-2.2-1.8-4-4-4ZM6.1 12v.8c0 .4.3.7.7.7h2.4c.4 0 .7-.3.7-.7V12H6.1Z',
  success:
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.3 4.8-4 4.4a.75.75 0 0 1-1.1 0L4.7 9.2l1.1-1 1 1.1 3.4-3.8 1.1 1Z',
  question:
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.7 10.3h-1.4v-1.4h1.4v1.4Zm1.1-4.2-.6.7c-.4.4-.6.8-.6 1.4h-1.3c0-.9.3-1.4.8-1.9l.9-.9c.2-.2.3-.5.3-.8 0-.6-.5-1-1.2-1s-1.2.4-1.2 1.1H5.5c0-1.4 1.1-2.3 2.6-2.3 1.4 0 2.5.8 2.5 2 0 .6-.3 1.1-.8 1.7Z',
  important: 'M8 1.2 9.9 5.5l4.6.4-3.5 3.1 1 4.6L8 11.2l-4 2.4 1-4.6L1.5 5.9l4.6-.4L8 1.2Z',
  warning:
    'M8.9 2.1a1 1 0 0 0-1.8 0l-5.5 10a1 1 0 0 0 .9 1.5h11a1 1 0 0 0 .9-1.5l-5.5-10ZM8.7 11.6H7.3v-1.4h1.4v1.4Zm0-2.6H7.3V5.6h1.4V9Z',
  caution:
    'M8.9 2.1a1 1 0 0 0-1.8 0l-5.5 10a1 1 0 0 0 .9 1.5h11a1 1 0 0 0 .9-1.5l-5.5-10ZM8.7 11.6H7.3v-1.4h1.4v1.4Zm0-2.6H7.3V5.6h1.4V9Z',
  failure:
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm2.6 8.1-1 1L8 9l-1.6 1.6-1-1L7 8 5.4 6.4l1-1L8 7l1.6-1.6 1 1L9 8l1.6 1.6Z',
  bug: 'M8 1.8c-1.2 0-2.2.8-2.5 1.9h5c-.3-1.1-1.3-1.9-2.5-1.9Zm-4.4 3.4v1.3h1.2c0 .3 0 .6.1.9l-1.6.9.6 1.1 1.5-.8c.6.9 1.6 1.5 2.6 1.6v-5H3.6Zm8.8 0H8.6v5c1-.1 2-.7 2.6-1.6l1.5.8.6-1.1-1.6-.9c.1-.3.1-.6.1-.9h1.2V5.2Z',
  example: 'M3 3.5h10v1.4H3V3.5Zm0 3.8h10v1.4H3V7.3Zm0 3.8h6.5v1.4H3v-1.4Z',
  quote:
    'M6 4.2c-1.7 0-3 1.3-3 3 0 1.6 1.2 2.9 2.8 2.9.2 0 .4 0 .6-.1-.4 1-1.3 1.8-2.4 2.1l.4 1.2c2.3-.6 3.9-2.7 3.9-5.3 0-2.2-1.1-3.8-2.3-3.8Zm6 0c-1.7 0-3 1.3-3 3 0 1.6 1.2 2.9 2.8 2.9.2 0 .4 0 .6-.1-.4 1-1.3 1.8-2.4 2.1l.4 1.2c2.3-.6 3.9-2.7 3.9-5.3 0-2.2-1.1-3.8-2.3-3.8Z',
}

/** `> [!tip] Título` on the first line of a blockquote. */
export const CALLOUT_HEAD = /^(\s*>\s*)(\[!(\w+)\]([+-]?)\s?)/

export interface Callout {
  /** Canonical type, used as the CSS class suffix. */
  type: string
  /** Offset inside the line where `[!type]` starts. */
  markFrom: number
  /** Offset inside the line where the marker, and its trailing space, end. */
  markTo: number
}

export function parseCallout(lineText: string): Callout | null {
  const match = CALLOUT_HEAD.exec(lineText)
  if (!match) return null
  const [, lead, marker, raw] = match
  return {
    type: ALIASES[raw!.toLowerCase()] ?? 'note',
    markFrom: lead!.length,
    markTo: lead!.length + marker!.length,
  }
}

export class CalloutIconWidget extends WidgetType {
  constructor(private readonly type: string) {
    super()
  }

  eq(other: CalloutIconWidget): boolean {
    return other.type === this.type
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-md-callout-icon'
    span.setAttribute('aria-hidden', 'true')
    span.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="' +
      (PATHS[this.type] ?? PATHS.note) +
      '"/></svg>'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}
