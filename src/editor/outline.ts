/**
 * The headings of the open document, in order.
 *
 * Read from the syntax tree rather than from a regular expression, so a `#`
 * inside a fenced code block is not mistaken for a heading.
 */

import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

export interface Heading {
  level: number
  text: string
  /** Where the heading starts, which is where clicking it scrolls to. */
  from: number
}

const ATX = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/

export function outlineOf(state: EditorState): Heading[] {
  const headings: Heading[] = []

  syntaxTree(state).iterate({
    enter: (node) => {
      const level = ATX.exec(node.name) ?? SETEXT.exec(node.name)
      if (!level) return

      const raw = state.doc.sliceString(node.from, node.to)
      const text = raw
        .split('\n')[0]!
        .replace(/^#{1,6}\s*/, '')
        .replace(/\s*#+\s*$/, '')
        .trim()

      if (text !== '') headings.push({ level: Number(level[1]), text, from: node.from })
      return false
    },
  })

  return headings
}

export function sameOutline(a: Heading[], b: Heading[]): boolean {
  return (
    a.length === b.length &&
    a.every((heading, index) => heading.from === b[index]!.from && heading.text === b[index]!.text)
  )
}
