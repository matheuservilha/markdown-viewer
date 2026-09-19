/**
 * Seamless Markdown: the syntax is hidden until the cursor enters its line.
 *
 * The document on disk is never touched. Everything here is decoration over the
 * plain Markdown text, which is what keeps select-all-and-copy giving Markdown
 * back instead of rendered text.
 *
 * Two things guard against the failure modes listed in funcionalidades.md §6:
 * decorations are built only for the visible ranges, so typing in a large file
 * does not rebuild the whole document, and the set is rebuilt on a cursor move
 * only when the move changed which lines are active, so dragging a selection
 * inside one line does not flicker.
 */

import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'
import { activeLines, overlaps, sameLines, type LineSpan } from './active'
import { CalloutIconWidget, parseCallout } from './callouts'
import { findFrontmatter } from './frontmatter'
import { BulletWidget, RuleWidget, TaskWidget } from './widgets'

const hidden = Decoration.replace({})

const headingLine = [1, 2, 3, 4, 5, 6].map((level) =>
  Decoration.line({ class: 'cm-md-heading cm-md-h' + level }),
)
const quoteLine = Decoration.line({ class: 'cm-md-quote' })
const codeLine = Decoration.line({ class: 'cm-md-code' })

/** Inline marks that vanish when the cursor is elsewhere. */
const INLINE_MARKS = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'HighlightMark',
  'LinkMark',
  'WikilinkMark',
  'WikilinkPath',
  'URL',
  'LinkTitle',
])

function headingLevel(name: string): number {
  return name.startsWith('ATXHeading') ? Number(name.slice('ATXHeading'.length)) : 0
}

function hasAncestor(node: { node: { parent: unknown } }, name: string): boolean {
  let parent = node.node.parent as { name: string; parent: unknown } | null
  while (parent) {
    if (parent.name === name) return true
    parent = parent.parent as { name: string; parent: unknown } | null
  }
  return false
}

/** A line decoration for every line the block covers. */
function decorateLines(
  state: EditorState,
  from: number,
  to: number,
  decoration: Decoration,
  out: Range<Decoration>[],
): void {
  let pos = from
  while (pos <= to) {
    const line = state.doc.lineAt(pos)
    out.push(decoration.range(line.from))
    if (line.to >= to) break
    pos = line.to + 1
  }
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const spans = activeLines(state)
  const out: Range<Decoration>[] = []

  // The front matter block itself is drawn by `frontmatterBlock`. Here it only
  // has to be left alone: a replaced range may not contain another one, and the
  // raw YAML is what the person should see once the block is open.
  const matter = findFrontmatter(state)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (matter && node.from < matter.to) return
        const name = node.name
        const revealed = overlaps(spans, node.from, node.to)

        const level = headingLevel(name)
        if (level) {
          out.push(headingLine[level - 1]!.range(state.doc.lineAt(node.from).from))
          return
        }

        switch (name) {
          case 'Blockquote': {
            const first = state.doc.lineAt(node.from)
            const callout = parseCallout(first.text)
            if (!callout) {
              decorateLines(state, node.from, node.to, quoteLine, out)
              return
            }

            // The box is drawn line by line, with the ends marked so that only
            // the outer corners round off.
            const base = 'cm-md-callout cm-md-callout-' + callout.type
            let pos = node.from
            let head = true
            while (pos <= node.to) {
              const line = state.doc.lineAt(pos)
              const tail = line.to >= node.to
              const classes = base + (head ? ' is-first' : '') + (tail ? ' is-last' : '')
              out.push(Decoration.line({ class: classes }).range(line.from))
              if (tail) break
              head = false
              pos = line.to + 1
            }

            // The icon stays put in both states, so revealing `[!tip]` does not
            // shift the title sideways.
            out.push(
              Decoration.widget({ widget: new CalloutIconWidget(callout.type), side: -1 }).range(
                first.from + callout.markFrom,
              ),
            )
            if (!overlaps(spans, first.from, first.to)) {
              out.push(hidden.range(first.from + callout.markFrom, first.from + callout.markTo))
            }
            return
          }
          case 'FencedCode':
          case 'CodeBlock':
            decorateLines(state, node.from, node.to, codeLine, out)
            return
          case 'Table':
            // A collapsed table is drawn whole by `tableBlocks`, and nothing
            // inside a replaced range may carry a decoration of its own.
            return revealed ? undefined : false

          case 'HeaderMark': {
            // Only the leading '#' of an ATX heading. The '===' of a setext
            // heading is a line of its own, and hiding it would move the text.
            if (revealed || !hasAncestor(node, 'ATXHeading' + headingLevel(node.node.parent!.name)))
              return
            const space = state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0
            out.push(hidden.range(node.from, node.to + space))
            return
          }
          case 'QuoteMark': {
            if (revealed) return
            const space = state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0
            out.push(hidden.range(node.from, node.to + space))
            return
          }
          case 'CodeMark': {
            // The fence of a code block stays, the backticks of inline code go.
            if (revealed || !hasAncestor(node, 'InlineCode')) return
            out.push(hidden.range(node.from, node.to))
            return
          }
          case 'ListMark': {
            if (node.node.parent?.parent?.name !== 'BulletList') return
            out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
            return
          }
          case 'TaskMarker': {
            const checked = /\[[xX]\]/.test(state.doc.sliceString(node.from, node.to))
            out.push(
              Decoration.replace({
                widget: new TaskWidget(checked, node.from, node.to),
              }).range(node.from, node.to),
            )
            return
          }
          case 'HorizontalRule': {
            if (revealed) return
            out.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to))
            return
          }
          default:
            // An image still shows its markup: rendering it in place is the next
            // slice, and hiding the markup now would leave only the alt text.
            if (revealed || !INLINE_MARKS.has(name) || hasAncestor(node, 'Image')) return
            out.push(hidden.range(node.from, node.to))
        }
      },
    })
  }

  return Decoration.set(out, true)
}

export const seamlessMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    private spans: LineSpan[]

    constructor(view: EditorView) {
      this.decorations = build(view)
      this.spans = activeLines(view.state)
    }

    update(update: ViewUpdate): void {
      const spans = activeLines(update.state)
      const movedLine = !sameLines(spans, this.spans)
      if (!update.docChanged && !update.viewportChanged && !movedLine) return
      this.spans = spans
      this.decorations = build(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
