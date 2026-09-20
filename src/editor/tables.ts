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
import { renderInline } from './inline'
import { closeMenu, openMenu, type MenuEntry } from './menu'
import {
  insertColumn,
  insertRow,
  parseTable,
  removeColumn,
  removeRow,
  cellRange,
  escapeCell,
  serializeTable,
  setAlign,
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

/** The table that starts at this position, read from the live document. */
function tableAt(state: EditorState, from: number): Span | null {
  return findTables(state).find((table) => table.from === from) ?? null
}

type Focus = { row: number; column: number }

class TableWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly from: number,
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

    /**
     * Applies a change to the table.
     *
     * The table is read again from the live document instead of from the model
     * this widget was built with: a cell being edited commits on the way here,
     * which moves the end of the table.
     */
    const act = (change: (table: TableModel) => TableModel, focus: Focus | null) => {
      const editing = wrapper.querySelector<HTMLElement>('.cm-md-cell-text:focus')
      editing?.blur()

      const span = tableAt(view.state, this.from)
      if (!span) return
      const current = parseTable(view.state.doc.sliceString(span.from, span.to))
      if (!current) return

      pendingFocus = focus === null ? null : { from: span.from, ...focus }
      view.dispatch({
        changes: { from: span.from, to: span.to, insert: serializeTable(change(current)) },
      })
    }

    /**
     * Writes one cell without touching the rest of the table.
     *
     * Rewriting the whole table for a single word would normalise the spacing
     * and the dashes the person typed, which is a reformat they did not ask
     * for. Only a structural change goes through `act`.
     */
    const writeCell = (row: number, column: number, value: string, focus: Focus | null) => {
      const range = cellRange(this.text, row, column)
      if (!range) {
        act((table) => setCell(table, row, column, value), focus)
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

    const asPlainText = () => {
      view.dispatch({ selection: { anchor: this.from }, effects: showTableAsText.of(this.from) })
      view.focus()
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
        act((current) => insertRow(current, current.rows.length), {
          row: model.rows.length,
          column: 0,
        })
        return
      }
      focusCell(nextRow, nextColumn)
    }

    const makeCell = (row: number, column: number) => {
      const element = document.createElement(row < 0 ? 'th' : 'td')
      element.className = 'cm-md-cell'

      const field = document.createElement('div')
      field.className = 'cm-md-cell-text'
      field.contentEditable = 'true'
      field.spellcheck = false
      field.dataset.row = String(row)
      field.dataset.column = String(column)
      field.style.textAlign = model.align[column] ?? 'left'

      /** Out of the cell: the Markdown is drawn, not shown. */
      const show = () => field.replaceChildren(renderInline(cellOf(row, column)))
      /** In the cell: the Markdown itself, which is what gets edited. */
      const edit = () => {
        field.textContent = cellOf(row, column)
      }
      show()

      // The caret lands wherever the click fell inside the drawn text, which
      // is not a position in the Markdown. It goes to the end instead, which
      // at least is a place the person can predict.
      field.addEventListener('focus', () => {
        edit()
        const range = document.createRange()
        range.selectNodeContents(field)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      })

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
          edit()
          field.blur()
        }
      })

      field.addEventListener('blur', () => {
        // A commit rebuilds the whole widget, drawn from the start. When
        // nothing changed there is no rebuild, so the drawing comes back here.
        if (!commit(null)) show()
      })
      element.append(field)
      return element
    }

    // ---- the handles: thin bars on the edge, like a spreadsheet ------------
    const colHandles: HTMLElement[] = []
    const rowHandles: HTMLElement[] = []

    /** Obsidian shows the bars of the cell under the pointer, and only those. */
    const trackPointer = (cell: HTMLElement, row: number, column: number) => {
      const bars = () => [colHandles[column], rowHandles[row]].filter((bar) => bar !== undefined)
      cell.addEventListener('mouseenter', () => {
        for (const bar of bars()) bar.classList.add('is-shown')
      })
      cell.addEventListener('mouseleave', () => {
        for (const bar of bars()) bar.classList.remove('is-shown')
      })
    }

    const handle = (kind: 'col' | 'row', entries: () => MenuEntry[]) => {
      const bar = document.createElement('div')
      bar.className = 'cm-md-' + kind + '-handle'
      bar.title = kind === 'col' ? 'Opções da coluna' : 'Opções da linha'
      bar.addEventListener('mousedown', (event) => {
        // Not letting the press through keeps the focus, and the unsaved text,
        // in the cell that is being edited.
        event.preventDefault()
        event.stopPropagation()
        const box = bar.getBoundingClientRect()
        openMenu(box.left, box.bottom + 4, entries())
      })
      return bar
    }

    const columnMenu = (column: number): MenuEntry[] => [
      { label: 'Inserir coluna à esquerda', run: () => act((t) => insertColumn(t, column), { row: -1, column }) },
      {
        label: 'Inserir coluna à direita',
        run: () => act((t) => insertColumn(t, column + 1), { row: -1, column: column + 1 }),
      },
      {
        label: 'Alinhar à esquerda',
        current: (model.align[column] ?? 'left') === 'left',
        separated: true,
        run: () => act((t) => setAlign(t, column, 'left'), null),
      },
      {
        label: 'Centralizar',
        current: model.align[column] === 'center',
        run: () => act((t) => setAlign(t, column, 'center'), null),
      },
      {
        label: 'Alinhar à direita',
        current: model.align[column] === 'right',
        run: () => act((t) => setAlign(t, column, 'right'), null),
      },
      {
        label: 'Remover coluna',
        destructive: true,
        separated: true,
        run: () => act((t) => removeColumn(t, column), null),
      },
    ]

    const rowMenu = (row: number): MenuEntry[] => [
      { label: 'Inserir linha acima', run: () => act((t) => insertRow(t, row), { row, column: 0 }) },
      {
        label: 'Inserir linha abaixo',
        run: () => act((t) => insertRow(t, row + 1), { row: row + 1, column: 0 }),
      },
      {
        label: 'Remover linha',
        destructive: true,
        separated: true,
        run: () => act((t) => removeRow(t, row), null),
      },
    ]

    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    model.header.forEach((_, column) => {
      const cell = makeCell(-1, column)
      const bar = handle('col', () => columnMenu(column))
      colHandles[column] = bar
      cell.append(bar)
      trackPointer(cell, -1, column)
      headRow.append(cell)
    })
    thead.append(headRow)
    table.append(thead)

    const tbody = document.createElement('tbody')
    model.rows.forEach((_, row) => {
      const tr = document.createElement('tr')
      for (let column = 0; column < width; column++) {
        const cell = makeCell(row, column)
        if (column === 0) {
          const bar = handle('row', () => rowMenu(row))
          rowHandles[row] = bar
          cell.append(bar)
        }
        trackPointer(cell, row, column)
        tr.append(cell)
      }
      tbody.append(tr)
    })
    table.append(tbody)

    // ---- the whole table, on the right button -----------------------------
    wrapper.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openMenu(event.clientX, event.clientY, [
        {
          label: 'Inserir linha no fim',
          run: () => act((t) => insertRow(t, t.rows.length), { row: model.rows.length, column: 0 }),
        },
        {
          label: 'Inserir coluna no fim',
          run: () => act((t) => insertColumn(t, t.header.length), { row: -1, column: width }),
        },
        { label: 'Editar como texto', separated: true, run: asPlainText },
      ])
    })

    if (pendingFocus && pendingFocus.from === this.from) {
      const { row, column } = pendingFocus
      pendingFocus = null
      requestAnimationFrame(() => focusCell(row, column))
    }

    return wrapper
  }

  /** A menu opened from this table has nothing to point at once it is gone. */
  destroy(): void {
    closeMenu()
  }

  /** Everything inside the grid is the grid's business, not the editor's. */
  ignoreEvent(): boolean {
    return true
  }
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
        widget: new TableWidget(state.doc.sliceString(table.from, table.to), table.from),
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
