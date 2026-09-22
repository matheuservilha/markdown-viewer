/**
 * The headings of the open document, in order.
 *
 * Read from the syntax tree rather than from a regular expression, so a `#`
 * inside a fenced code block is not mistaken for a heading.
 */

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { findFrontmatter } from './frontmatter'

export interface Heading {
  level: number
  text: string
  /** Where the heading starts, which is where clicking it scrolls to. */
  from: number
}

const ATX = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/

/**
 * How long the parse may be pushed for, in milliseconds.
 *
 * Long enough to reach the end of any note somebody writes by hand, short
 * enough that a file which somehow cannot be parsed in that time does not
 * hold the interface still. Whatever it did reach is used, and the next pass
 * carries on from there.
 */
const PARSE_BUDGET = 150

export function outlineOf(state: EditorState): Heading[] {
  const headings: Heading[] = []

  /*
   * The editor parses what it has had reason to show, which on a long note is
   * the first screen and a little more. A summary of the first screen is not a
   * summary, so the parse is pushed to the end of the document here.
   *
   * This is the whole of the bug it fixes: the panel listed the two or three
   * headings above the fold and then quietly stopped, and on a document whose
   * first screen has no headings at all it listed nothing and left whatever
   * the previous document had put there.
   */
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET) ?? syntaxTree(state)

  /*
   * Front matter is not part of the document, but it does look like one to the
   * parser: the last line before the closing fence sits over three dashes, and
   * three dashes under a line of text is how Markdown writes a heading. So the
   * `updated:` of every note was arriving in the summary as a section.
   */
  const body = findFrontmatter(state)?.to ?? 0

  tree.iterate({
    enter: (node) => {
      if (node.from < body) return
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
