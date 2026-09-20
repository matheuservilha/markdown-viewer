import { EditorSelection } from '@codemirror/state'
import type { Command } from '@codemirror/view'

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s*)?/

/** Turns the current lines into tasks, or flips the box when they already are. */
export const toggleTask: Command = (view) => {
  const { state } = view
  const changes = []
  const seen = new Set<number>()

  for (const range of state.selection.ranges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = state.doc.lineAt(pos)
      if (!seen.has(line.from)) {
        seen.add(line.from)
        const match = TASK.exec(line.text)
        if (match) {
          const [, prefix, box] = match
          const at = line.from + prefix!.length
          if (!box) changes.push({ from: at, to: at, insert: '[ ] ' })
          else changes.push({ from: at, to: at + 3, insert: box.startsWith('[ ]') ? '[x]' : '[ ]' })
        } else {
          changes.push({ from: line.from, to: line.from, insert: '- [ ] ' })
        }
      }
      if (line.to >= range.to) break
      pos = line.to + 1
    }
  }

  if (changes.length === 0) return false
  view.dispatch({ changes, userEvent: 'input.toggleTask' })
  return true
}

/**
 * Wraps the selection in a pair of marks, or takes the pair off when it is
 * already there. With nothing selected the marks are written and the caret
 * goes between them, ready to type.
 */
function wrapWith(marks: string): Command {
  return (view) => {
    const { state } = view
    const changes = []
    const ranges = []

    for (const range of state.selection.ranges) {
      const around =
        state.sliceDoc(range.from - marks.length, range.from) === marks &&
        state.sliceDoc(range.to, range.to + marks.length) === marks
      const inside = state.sliceDoc(range.from, range.to)

      if (around) {
        changes.push(
          { from: range.from - marks.length, to: range.from, insert: '' },
          { from: range.to, to: range.to + marks.length, insert: '' },
        )
        ranges.push({ anchor: range.from - marks.length, head: range.to - marks.length })
        continue
      }
      if (inside.startsWith(marks) && inside.endsWith(marks) && inside.length > marks.length * 2) {
        changes.push(
          { from: range.from, to: range.from + marks.length, insert: '' },
          { from: range.to - marks.length, to: range.to, insert: '' },
        )
        ranges.push({ anchor: range.from, head: range.to - marks.length * 2 })
        continue
      }
      changes.push(
        { from: range.from, to: range.from, insert: marks },
        { from: range.to, to: range.to, insert: marks },
      )
      ranges.push({ anchor: range.from + marks.length, head: range.to + marks.length })
    }

    view.dispatch({
      changes,
      selection: EditorSelection.create(
        ranges.map((range) => EditorSelection.range(range.anchor, range.head)),
      ),
      userEvent: 'input.wrap',
    })
    return true
  }
}

export const toggleBold = wrapWith('**')
export const toggleItalic = wrapWith('*')
export const toggleCode = wrapWith('`')
export const toggleStrike = wrapWith('~~')
export const toggleHighlight = wrapWith('==')

/**
 * Turns the selection into a link and leaves the caret where the address goes,
 * which is the part the person still has to fill in.
 */
export const insertLink: Command = (view) => {
  const { state } = view
  const range = state.selection.main
  const label = state.sliceDoc(range.from, range.to)
  const insert = '[' + label + ']()'
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length - 1 },
    userEvent: 'input.link',
  })
  return true
}
