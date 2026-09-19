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
