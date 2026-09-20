/**
 * A table as data, and back to Markdown.
 *
 * Everything the table widget does to the document goes through here, so the
 * rules about columns, alignment and escaping live in one place that can be
 * tested without a browser.
 */

export type Align = 'left' | 'center' | 'right'

export interface TableModel {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** Splits a row on its unescaped pipes, dropping the outer ones. */
export function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!
    if (character === '\\' && line[index + 1] === '|') {
      current += '|'
      index++
      continue
    }
    if (character === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += character
  }
  cells.push(current)

  if (cells.length > 0 && cells[0]!.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

function alignOf(spec: string): Align {
  const trimmed = spec.trim()
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
  if (trimmed.endsWith(':')) return 'right'
  return 'left'
}

const DELIMITER = /^ {0,3}\|?[\s:|-]*-[\s:|-]*\|?\s*$/

export function parseTable(text: string): TableModel | null {
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  if (lines.length < 2 || !DELIMITER.test(lines[1]!)) return null

  const header = splitRow(lines[0]!)
  const align = splitRow(lines[1]!).map(alignOf)
  if (header.length === 0 || align.length !== header.length) return null

  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line)
    // A short row is padded and a long one is cut: the header decides the shape.
    return Array.from({ length: header.length }, (_, index) => cells[index] ?? '')
  })

  return { header, align, rows }
}

const DASHES: Record<Align, string> = { left: '---', center: ':-:', right: '--:' }

export function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

export function serializeTable(model: TableModel): string {
  const line = (cells: string[]) => '| ' + cells.map(escapeCell).join(' | ') + ' |'
  return [
    line(model.header),
    '|' + model.align.map((align) => DASHES[align]).join('|') + '|',
    ...model.rows.map(line),
  ].join('\n')
}

export function insertColumn(model: TableModel, at: number): TableModel {
  const put = <T,>(list: T[], value: T) => [...list.slice(0, at), value, ...list.slice(at)]
  return {
    header: put(model.header, ''),
    align: put(model.align, 'left'),
    rows: model.rows.map((row) => put(row, '')),
  }
}

export function removeColumn(model: TableModel, at: number): TableModel {
  // A table with no columns is not a table, so the last one never goes.
  if (model.header.length <= 1) return model
  const drop = <T,>(list: T[]) => list.filter((_, index) => index !== at)
  return {
    header: drop(model.header),
    align: drop(model.align),
    rows: model.rows.map(drop),
  }
}

export function insertRow(model: TableModel, at: number): TableModel {
  const empty = model.header.map(() => '')
  return { ...model, rows: [...model.rows.slice(0, at), empty, ...model.rows.slice(at)] }
}

export function removeRow(model: TableModel, at: number): TableModel {
  return { ...model, rows: model.rows.filter((_, index) => index !== at) }
}

/** Row `-1` is the header. */
export function setCell(model: TableModel, row: number, column: number, value: string): TableModel {
  if (row < 0) {
    return { ...model, header: model.header.map((cell, index) => (index === column ? value : cell)) }
  }
  return {
    ...model,
    rows: model.rows.map((cells, index) =>
      index === row ? cells.map((cell, at) => (at === column ? value : cell)) : cells,
    ),
  }
}

export function setAlign(model: TableModel, column: number, align: Align): TableModel {
  return { ...model, align: model.align.map((value, index) => (index === column ? align : value)) }
}

export interface CellRange {
  /** Offsets inside the table's text, pipes excluded. */
  from: number
  to: number
}

/** The segments a row's pipes cut it into, with their offsets. */
function segments(line: string): CellRange[] {
  const found: CellRange[] = []
  let from = 0
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\' && line[index + 1] === '|') {
      index++
      continue
    }
    if (line[index] === '|') {
      found.push({ from, to: index })
      from = index + 1
    }
  }
  found.push({ from, to: line.length })

  // splitRow drops an empty outer segment, so a leading or trailing pipe does
  // not become a column. The ranges have to drop the same ones.
  if (found.length > 0 && line.slice(found[0]!.from, found[0]!.to).trim() === '') found.shift()
  const last = found[found.length - 1]
  if (found.length > 0 && line.slice(last!.from, last!.to).trim() === '') found.pop()
  return found
}

/**
 * Where one cell sits inside the table's own text. Row -1 is the header.
 *
 * Editing a cell replaces only this range, so that changing one word does not
 * rewrite the whole table and quietly reformat the spacing and the dashes the
 * person wrote.
 */
export function cellRange(text: string, row: number, column: number): CellRange | null {
  const lines = text.split('\n')
  // The line under the header holds the dashes, so the body starts two down.
  const index = row < 0 ? 0 : row + 2
  const line = lines[index]
  if (line === undefined) return null

  let start = 0
  for (const before of lines.slice(0, index)) start += before.length + 1

  const cell = segments(line)[column]
  if (!cell) return null
  return { from: start + cell.from, to: start + cell.to }
}
