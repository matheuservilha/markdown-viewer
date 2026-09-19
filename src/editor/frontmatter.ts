/**
 * YAML front matter, shown as a block of properties instead of loose text.
 *
 * It is found by reading the head of the document rather than by extending the
 * Markdown parser: front matter is only front matter on line one, which makes a
 * short scan both cheaper and harder to get wrong than a block parser that has
 * to decide what to do when the closing fence never arrives.
 */

import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { touches } from './active'

const FENCE = /^-{3,}\s*$/
/** A front matter block longer than this is almost certainly not one. */
const MAX_LINES = 200

export interface FrontmatterRange {
  from: number
  to: number
  /** First position inside the block, where a click parks the cursor. */
  contentFrom: number
}

/**
 * Where the text of the note begins, so that opening a file does not park the
 * cursor inside the front matter and leave the block showing its raw YAML.
 */
export function bodyStart(text: string): number {
  const lines = text.split('\n')
  if (lines[0] === undefined || !FENCE.test(lines[0])) return 0
  let offset = lines[0].length + 1
  for (let index = 1; index < Math.min(lines.length, MAX_LINES); index++) {
    const line = lines[index]!
    offset += line.length + 1
    if (FENCE.test(line)) return Math.min(offset, text.length)
  }
  return 0
}

export function findFrontmatter(state: EditorState): FrontmatterRange | null {
  const first = state.doc.line(1)
  if (!FENCE.test(first.text)) return null

  const last = Math.min(state.doc.lines, MAX_LINES)
  for (let number = 2; number <= last; number++) {
    const line = state.doc.line(number)
    if (FENCE.test(line.text)) return { from: first.from, to: line.to, contentFrom: first.to + 1 }
  }
  return null
}

interface Property {
  key: string
  /** A scalar comes as one value; a YAML list comes as many. */
  values: string[]
  list: boolean
}

/**
 * Reads the subset of YAML that front matter actually uses: `key: value` and a
 * key followed by `- item` lines. Anything else is kept as a scalar, so nothing
 * is silently dropped from view.
 */
export function parseProperties(text: string): Property[] {
  const properties: Property[] = []
  let current: Property | null = null

  for (const line of text.split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && current) {
      current.list = true
      current.values.push(item[1]!.trim())
      continue
    }

    const pair = /^([^\s:][^:]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    current = { key: pair[1]!.trim(), values: [], list: false }
    if (pair[2]!.trim() !== '') current.values.push(pair[2]!.trim())
    properties.push(current)
  }

  return properties
}

export class FrontmatterWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly contentFrom: number,
  ) {
    super()
  }

  eq(other: FrontmatterWidget): boolean {
    return other.text === this.text
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('div')
    box.className = 'cm-md-frontmatter'

    const properties = parseProperties(this.text)
    if (properties.length === 0) {
      box.append(label('Propriedades vazias'))
    }

    for (const property of properties) {
      const row = document.createElement('div')
      row.className = 'cm-md-prop'

      const key = document.createElement('span')
      key.className = 'cm-md-prop-key'
      key.textContent = property.key

      const values = document.createElement('span')
      values.className = 'cm-md-prop-values'
      for (const value of property.values) {
        const item = document.createElement('span')
        item.className = property.list ? 'cm-md-chip' : 'cm-md-scalar'
        item.textContent = value
        values.append(item)
      }

      row.append(key, values)
      box.append(row)
    }

    // Clicking opens the block: the cursor lands inside, and the rule that
    // reveals the syntax on the cursor's line does the rest.
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.contentFrom } })
      view.focus()
    })

    return box
  }

  ignoreEvent(): boolean {
    return false
  }
}

function label(text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'cm-md-prop-key'
  span.textContent = text
  return span
}

interface MatterState {
  matter: FrontmatterRange | null
  decorations: DecorationSet
}

function draw(state: EditorState, matter: FrontmatterRange | null): DecorationSet {
  if (!matter || touches(state, matter.from, matter.to)) return Decoration.none
  return Decoration.set([
    Decoration.replace({
      block: true,
      widget: new FrontmatterWidget(
        state.doc.sliceString(matter.contentFrom, matter.to),
        matter.contentFrom,
      ),
    }).range(matter.from, matter.to),
  ])
}

function compute(state: EditorState): MatterState {
  const matter = findFrontmatter(state)
  return { matter, decorations: draw(state, matter) }
}

/**
 * Block decorations have to come from a state field: a view plugin is built
 * after the view has already measured its lines, so CodeMirror ignores block
 * decorations handed to it from there.
 *
 * Only a change to the text can move the block, so a cursor move never pays for
 * the scan.
 */
export const frontmatterBlock = StateField.define<MatterState>({
  create: compute,
  update: (value, tr) => {
    if (tr.docChanged) return compute(tr.state)
    if (!tr.selection || !value.matter) return value
    return { matter: value.matter, decorations: draw(tr.state, value.matter) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})
