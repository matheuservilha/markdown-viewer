/**
 * Which lines the selection touches. Every rule that hides or draws something
 * asks this same question, and they have to agree: if a block decoration and an
 * inline one disagreed about whether a range is revealed, one would end up
 * nested inside the other, which CodeMirror refuses.
 */

import type { EditorState } from '@codemirror/state'

export interface LineSpan {
  from: number
  to: number
}

export function activeLines(state: EditorState): LineSpan[] {
  const spans: LineSpan[] = []
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from)
    const last = range.to <= first.to ? first : state.doc.lineAt(range.to)
    spans.push({ from: first.from, to: last.to })
  }
  return spans
}

export function overlaps(spans: LineSpan[], from: number, to: number): boolean {
  return spans.some((span) => from <= span.to && to >= span.from)
}

export function sameLines(a: LineSpan[], b: LineSpan[]): boolean {
  return a.length === b.length && a.every((span, i) => span.from === b[i]!.from && span.to === b[i]!.to)
}

/** True when the cursor or selection is inside the given range. */
export function touches(state: EditorState, from: number, to: number): boolean {
  return overlaps(activeLines(state), from, to)
}
