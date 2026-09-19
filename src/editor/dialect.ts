/**
 * The Markdown dialect: GitHub Flavored, plus the two inline marks Bear has and
 * GFM does not, and the wiki link the file tree needs.
 */

import { GFM, type MarkdownConfig } from '@lezer/markdown'
import { tags as t, Tag } from '@lezer/highlight'

export const highlightTag = Tag.define()
export const wikilinkTag = Tag.define()

const EQUALS = 61 // '='
const BRACKET = 91 // '['

// One object, defined once: the parser matches the closing delimiter against the
// opening one by identity, so a fresh literal per call would never close.
const highlightDelimiter = { resolve: 'Highlight', mark: 'HighlightMark' }

/** `==marca-texto==`, the same spelling Bear writes when it exports Markdown. */
const Highlight: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: highlightTag },
    { name: 'HighlightMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      after: 'Emphasis',
      parse(cx, next, pos) {
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS) return -1
        return cx.addDelimiter(highlightDelimiter, pos, pos + 2, true, true)
      },
    },
  ],
}

/** `[[arquivo]]`, resolved against the base by the app layer. */
const Wikilink: MarkdownConfig = {
  defineNodes: [
    { name: 'Wikilink', style: wikilinkTag },
    { name: 'WikilinkMark', style: t.processingInstruction },
    /** The `alvo|` of `[[alvo|apelido]]`, which the reader does not need. */
    { name: 'WikilinkPath', style: t.processingInstruction },
    /**
     * What is actually shown: the alias when there is one, the target if not.
     * The tag sits here and not on `Wikilink`, because a plain style rule in
     * `@lezer/highlight` colours the node's own text and does not reach into a
     * child node.
     */
    { name: 'WikilinkText', style: wikilinkTag },
  ],
  parseInline: [
    {
      name: 'Wikilink',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== BRACKET || cx.char(pos + 1) !== BRACKET) return -1
        const closing = cx.text.indexOf(']]', pos - cx.offset + 2)
        if (closing < 0) return -1
        const end = cx.offset + closing + 2
        const inner = cx.text.slice(pos - cx.offset + 2, closing)
        const pipe = inner.indexOf('|')

        // With an alias, everything up to and including the bar is plumbing.
        const parts =
          pipe < 0
            ? [cx.elt('WikilinkText', pos + 2, end - 2)]
            : [
                cx.elt('WikilinkPath', pos + 2, pos + 3 + pipe),
                cx.elt('WikilinkText', pos + 3 + pipe, end - 2),
              ]

        return cx.addElement(
          cx.elt('Wikilink', pos, end, [
            cx.elt('WikilinkMark', pos, pos + 2),
            ...parts,
            cx.elt('WikilinkMark', end - 2, end),
          ]),
        )
      },
    },
  ],
}

export const dialect = [GFM, Highlight, Wikilink]
