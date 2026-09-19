/**
 * Tables, drawn as a grid when the cursor is elsewhere and handed back as
 * aligned text the moment the cursor enters them.
 *
 * Like the front matter block, this has to be a state field: a replaced block
 * cannot be declared from a view plugin.
 */

import { syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'
import { activeLines, overlaps } from './active'

type Align = 'left' | 'center' | 'right'

interface Cell {
  text: string
  /** Position in the document where this cell's text starts. */
  from: number
}

interface Row {
  cells: Cell[]
}

const DELIMITER_ROW = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/

/** Splits one table line on its unescaped pipes, keeping each cell's position. */
function splitRow(text: string, lineStart: number): Cell[] {
  const cells: Cell[] = []
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    const end = i === text.length
    if (!end && (text[i] !== '|' || text[i - 1] === '\\')) continue
    cells.push({ text: text.slice(start, i), from: lineStart + start })
    start = i + 1
    if (end) break
  }
  // A leading and a trailing pipe produce an empty cell on each side.
  if (cells.length > 0 && cells[0]!.text.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]!.text.trim() === '') cells.pop()
  return cells
}

function alignments(text: string, columns: number): Align[] {
  const cells = splitRow(text, 0)
  return Array.from({ length: columns }, (_, index) => {
    const spec = cells[index]?.text.trim() ?? ''
    if (spec.startsWith(':') && spec.endsWith(':')) return 'center'
    if (spec.endsWith(':')) return 'right'
    return 'left'
  })
}

interface ParsedTable {
  header: Row | null
  align: Align[]
  body: Row[]
}

export function parseTable(state: EditorState, from: number, to: number): ParsedTable {
  const rows: { text: string; start: number }[] = []
  let pos = from
  while (pos <= to) {
    const line = state.doc.lineAt(pos)
    rows.push({ text: line.text, start: line.from })
    if (line.to >= to) break
    pos = line.to + 1
  }

  const header = rows[0] ? { cells: splitRow(rows[0].text, rows[0].start) } : null
  const columns = header?.cells.length ?? 0
  const hasDelimiter = rows[1] !== undefined && DELIMITER_ROW.test(rows[1].text)
  const align = hasDelimiter ? alignments(rows[1]!.text, columns) : Array<Align>(columns).fill('left')

  const body = rows
    .slice(hasDelimiter ? 2 : 1)
    .map((row) => ({ cells: splitRow(row.text, row.start) }))

  return { header, align, body }
}

class TableWidget extends WidgetType {
  constructor(
    private readonly key: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.key === this.key && other.from === this.from
  }

  toDOM(view: EditorView): HTMLElement {
    const { header, align, body } = parseTable(view.state, this.from, this.to)

    const wrapper = document.createElement('div')
    wrapper.className = 'cm-md-table-wrap'
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    wrapper.append(table)

    const cell = (content: Cell, index: number, head: boolean) => {
      const element = document.createElement(head ? 'th' : 'td')
      element.textContent = content.text.trim()
      element.style.textAlign = align[index] ?? 'left'
      // Clicking a cell drops the cursor into that cell's text, so the grid and
      // the Markdown behind it stay the same thing.
      element.addEventListener('mousedown', (event) => {
        event.preventDefault()
        const offset = content.text.length - content.text.trimStart().length
        view.dispatch({ selection: { anchor: content.from + offset } })
        view.focus()
      })
      return element
    }

    if (header) {
      const thead = document.createElement('thead')
      const tr = document.createElement('tr')
      header.cells.forEach((content, index) => tr.append(cell(content, index, true)))
      thead.append(tr)
      table.append(thead)
    }

    const tbody = document.createElement('tbody')
    for (const row of body) {
      const tr = document.createElement('tr')
      row.cells.forEach((content, index) => tr.append(cell(content, index, false)))
      tbody.append(tr)
    }
    table.append(tbody)

    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

function compute(state: EditorState): DecorationSet {
  const spans = activeLines(state)
  const decorations: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return
      if (overlaps(spans, node.from, node.to)) return false
      decorations.push(
        Decoration.replace({
          block: true,
          widget: new TableWidget(
            state.doc.sliceString(node.from, node.to),
            node.from,
            node.to,
          ),
        }).range(node.from, node.to),
      )
      return false
    },
  })

  return Decoration.set(decorations, true)
}

export const tableBlocks = StateField.define<DecorationSet>({
  create: compute,
  update: (value, tr) => (tr.docChanged || tr.selection ? compute(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})
