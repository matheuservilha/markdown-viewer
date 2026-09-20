/**
 * Tables, drawn as a grid and edited inside that grid.
 *
 * The file on disk stays Markdown: every change made in a cell is written back
 * as Markdown straight away, so the table is never a separate thing that has to
 * be saved. What the grid replaces is the reading of pipes, not the format.
 *
 * Like the front matter block, this has to be a state field: a replaced block
 * cannot be declared from a view plugin.
 */

import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { activeLines, overlaps } from './active'
import {
  insertColumn,
  insertRow,
  parseTable,
  removeColumn,
  removeRow,
  cellRange,
  escapeCell,
  serializeTable,
  setCell,
  type TableModel,
} from './table-model'

/**
 * Shows one table as plain Markdown again, for when the grid is in the way: a
 * table the parser reads differently from the person who wrote it, or a cell
 * that needs something the grid has no button for. It lasts while the cursor is
 * inside the table, and the grid comes back when the cursor leaves.
 */
export const showTableAsText = StateEffect.define<number>()

const asText = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, transaction) {
    let next = value
    if (transaction.docChanged && value.size > 0) {
      next = new Set([...value].map((position) => transaction.changes.mapPos(position)))
    }
    for (const effect of transaction.effects) {
      if (!effect.is(showTableAsText)) continue
      next = new Set(next)
      next.add(effect.value)
    }
    return next
  },
})

/**
 * Which cell to put the caret in once the document has been rewritten. The
 * widget is rebuilt on every change, so focus cannot simply be kept: it has to
 * be asked for again on the other side.
 */
let pendingFocus: { from: number; row: number; column: number } | null = null

interface Span {
  from: number
  to: number
}

/** A row of a table: starts with a pipe, once the indentation is off. */
const ROW = /^ {0,3}\|/
/** The line under the header, which is what makes a table a table. */
const DELIMITER = /^ {0,3}\|?[\s:|-]*-[\s:|-]*\|?\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/

function columns(line: string): number {
  return line
    .replace(/^ {0,3}\|/, '')
    .replace(/\|\s*$/, '')
    .split('|').length
}

/**
 * Finds the tables by reading the lines, not by walking the syntax tree.
 *
 * The tree is parsed with a time budget, so in a long file it simply does not
 * reach the end: in a note of 177 kB, thirty of the fifty-three tables were
 * past the parsed region and stayed as raw pipes on the screen. Reading lines
 * costs one pass and always covers the whole document. The fences are tracked
 * so that a table drawn inside a code block is left as the text it is.
 */
function findTables(state: EditorState): Span[] {
  const found: Span[] = []
  const lines: { text: string; from: number; to: number }[] = []

  let at = 0
  for (const text of state.doc.iterLines()) {
    lines.push({ text, from: at, to: at + text.length })
    at += text.length + 1
  }

  let fence: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!

    if (fence !== null) {
      if (line.text.trimStart().startsWith(fence)) fence = null
      continue
    }
    const opening = FENCE.exec(line.text)
    if (opening) {
      fence = opening[1]!
      continue
    }

    const next = lines[index + 1]
    if (!ROW.test(line.text) || !next || !DELIMITER.test(next.text)) continue
    if (!next.text.includes('|') || columns(line.text) !== columns(next.text)) continue

    let last = index + 1
    while (last + 1 < lines.length && ROW.test(lines[last + 1]!.text)) last++

    found.push({ from: line.from, to: lines[last]!.to })
    index = last
  }

  return found
}

type Focus = { row: number; column: number }

class TableWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.from === this.from && other.text === this.text
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-md-table-wrap'

    const model = parseTable(this.text)
    if (!model) {
      // Unreadable as a table: show it as it was written rather than guess.
      wrapper.textContent = this.text
      wrapper.classList.add('is-raw')
      return wrapper
    }

    const write = (next: TableModel, focus: Focus | null) => {
      pendingFocus = focus === null ? null : { from: this.from, ...focus }
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: serializeTable(next) },
      })
    }

    /**
     * Writes one cell without touching the rest of the table.
     *
     * Rewriting the whole table for a single word would normalise the spacing
     * and the dashes the person typed, which is a reformat they did not ask
     * for. Only a structural change (a row or a column) goes through `write`.
     */
    const writeCell = (row: number, column: number, value: string, focus: Focus | null) => {
      const range = cellRange(this.text, row, column)
      if (!range) {
        write(setCell(model, row, column, value), focus)
        return
      }
      pendingFocus = focus === null ? null : { from: this.from, ...focus }
      // The surrounding spaces are kept so the column stays as wide as it was.
      const pad = /^\s/.test(this.text.slice(range.from, range.to)) || value !== '' ? ' ' : ''
      view.dispatch({
        changes: {
          from: this.from + range.from,
          to: this.from + range.to,
          insert: pad + escapeCell(value) + (pad === '' ? '' : ' '),
        },
      })
    }

    const table = document.createElement('table')
    table.className = 'cm-md-table'
    wrapper.append(table)

    const width = model.header.length

    const cellOf = (row: number, column: number): string =>
      row < 0 ? (model.header[column] ?? '') : (model.rows[row]?.[column] ?? '')

    const focusCell = (row: number, column: number) => {
      const target = wrapper.querySelector<HTMLElement>(
        '[data-row="' + row + '"][data-column="' + column + '"]',
      )
      if (!target) return false
      target.focus()
      const range = document.createRange()
      range.selectNodeContents(target)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return true
    }

    /** Moves to the next cell, wrapping across rows and adding one at the end. */
    const step = (row: number, column: number, delta: number) => {
      let nextColumn = column + delta
      let nextRow = row
      if (nextColumn >= width) {
        nextColumn = 0
        nextRow = row + 1
      } else if (nextColumn < 0) {
        nextColumn = width - 1
        nextRow = row - 1
      }
      if (nextRow < -1) return
      if (nextRow >= model.rows.length) {
        write(insertRow(model, model.rows.length), { row: model.rows.length, column: 0 })
        return
      }
      if (!focusCell(nextRow, nextColumn)) return
    }

    const makeCell = (row: number, column: number) => {
      const element = document.createElement(row < 0 ? 'th' : 'td')
      element.className = 'cm-md-cell'

      const field = document.createElement('div')
      field.className = 'cm-md-cell-text'
      field.contentEditable = 'true'
      field.spellcheck = false
      field.textContent = cellOf(row, column)
      field.dataset.row = String(row)
      field.dataset.column = String(column)
      field.style.textAlign = model.align[column] ?? 'left'

      const commit = (focus: Focus | null): boolean => {
        const value = (field.textContent ?? '').replace(/\n/g, ' ').trim()
        if (value === cellOf(row, column)) {
          if (focus) focusCell(focus.row, focus.column)
          return false
        }
        writeCell(row, column, value, focus)
        return true
      }

      field.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
          event.preventDefault()
          if (!commit(null)) step(row, column, event.shiftKey ? -1 : 1)
          else step(row, column, event.shiftKey ? -1 : 1)
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          commit(null)
          step(row, width - 1, 1)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          field.textContent = cellOf(row, column)
          field.blur()
        }
      })

      field.addEventListener('blur', () => commit(null))
      element.append(field)
      return element
    }

    // ---- header, with the controls for each column ------------------------
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    headRow.append(gutterCell(''))

    model.header.forEach((_, column) => {
      const cell = makeCell(-1, column)
      const tools = document.createElement('span')
      tools.className = 'cm-md-col-tools'
      tools.append(
        control('+', 'Inserir coluna à direita', () =>
          write(insertColumn(model, column + 1), { row: -1, column: column + 1 }),
        ),
        control('×', 'Remover esta coluna', () => write(removeColumn(model, column), null)),
      )
      cell.append(tools)
      headRow.append(cell)
    })

    thead.append(headRow)
    table.append(thead)

    // ---- body, with a control for each row --------------------------------
    const tbody = document.createElement('tbody')
    model.rows.forEach((_, row) => {
      const tr = document.createElement('tr')
      const gutter = gutterCell('')
      gutter.append(
        control('+', 'Inserir linha abaixo', () =>
          write(insertRow(model, row + 1), { row: row + 1, column: 0 }),
        ),
        control('×', 'Remover esta linha', () => write(removeRow(model, row), null)),
      )
      tr.append(gutter)
      for (let column = 0; column < width; column++) tr.append(makeCell(row, column))
      tbody.append(tr)
    })
    table.append(tbody)

    // ---- what to do with the whole table ----------------------------------
    const foot = document.createElement('div')
    foot.className = 'cm-md-table-foot'
    foot.append(
      control('+ linha', 'Adicionar linha no fim', () =>
        write(insertRow(model, model.rows.length), { row: model.rows.length, column: 0 }),
      ),
      control('+ coluna', 'Adicionar coluna no fim', () =>
        write(insertColumn(model, width), { row: -1, column: width }),
      ),
      control('texto', 'Editar esta tabela como Markdown', () => {
        view.dispatch({
          selection: { anchor: this.from },
          effects: showTableAsText.of(this.from),
        })
        view.focus()
      }),
    )
    wrapper.append(foot)

    if (pendingFocus && pendingFocus.from === this.from) {
      const { row, column } = pendingFocus
      pendingFocus = null
      requestAnimationFrame(() => focusCell(row, column))
    }

    return wrapper
  }

  /** Everything inside the grid is the grid's business, not the editor's. */
  ignoreEvent(): boolean {
    return true
  }
}

/**
 * A button that acts on mouse down, not on click: the cell about to lose focus
 * would otherwise commit first and rebuild the table under the pointer.
 */
function control(label: string, title: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-md-table-button'
  button.textContent = label
  button.title = title
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    run()
  })
  return button
}

function gutterCell(text: string): HTMLTableCellElement {
  const cell = document.createElement('td')
  cell.className = 'cm-md-table-gutter'
  cell.textContent = text
  return cell
}

function draw(state: EditorState, tables: Span[]): DecorationSet {
  if (tables.length === 0) return Decoration.none
  const spans = activeLines(state)
  const raw = state.field(asText, false) ?? new Set<number>()
  const decorations: Range<Decoration>[] = []

  for (const table of tables) {
    // Asked for as text, and still being visited: leave the Markdown alone.
    if (raw.has(table.from) && overlaps(spans, table.from, table.to)) continue
    decorations.push(
      Decoration.replace({
        block: true,
        widget: new TableWidget(state.doc.sliceString(table.from, table.to), table.from, table.to),
      }).range(table.from, table.to),
    )
  }

  return Decoration.set(decorations, true)
}

interface TableState {
  tables: Span[]
  decorations: DecorationSet
}

function compute(state: EditorState): TableState {
  const tables = findTables(state)
  return { tables, decorations: draw(state, tables) }
}

const blocks = StateField.define<TableState>({
  create: compute,
  update: (value, tr) => {
    // Where the tables are can only change when the text does.
    if (tr.docChanged) return compute(tr.state)
    if (!tr.selection && tr.effects.length === 0) return value
    if (value.tables.length === 0) return value
    return { tables: value.tables, decorations: draw(tr.state, value.tables) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

export const tableBlocks = [asText, blocks]
export { blocks as tableBlocksField }
