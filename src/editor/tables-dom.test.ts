// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tableBlocks } from './tables'

/**
 * A table the person formatted by hand: the dashes are `:---:`, not the `:-:`
 * the serializer writes. Editing a cell must leave that line alone.
 */
const TABLE = ['| Coluna | Nota |', '|---|:---:|', '| um | 1 |', '| dois | 2 |'].join('\n')

let view: EditorView | null = null

function mount(doc = TABLE, cursor = doc.length): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [tableBlocks] }),
    parent: document.body,
  })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

const grid = () => document.querySelector('.cm-md-table')
const cell = (row: number, column: number) =>
  document.querySelector<HTMLElement>(`[data-row="${row}"][data-column="${column}"]`)
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.cm-md-table-button')].find(
    (node) => node.textContent === label,
  )
/** The `+` and `×` of a column live on the header cell, beside its text. */
const columnTools = (column: number) => [
  ...cell(-1, column)!.parentElement!.querySelectorAll<HTMLElement>('.cm-md-table-button'),
]
const press = (node: HTMLElement | undefined) =>
  node?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

describe('a grade editável', () => {
  it('desenha cabeçalho e linhas', () => {
    mount()
    expect(grid()).not.toBeNull()
    expect(document.querySelectorAll('.cm-md-table tbody tr')).toHaveLength(2)
    expect(cell(-1, 0)?.textContent).toBe('Coluna')
    expect(cell(1, 1)?.textContent).toBe('2')
  })

  it('editar uma célula escreve só aquela célula', () => {
    const editor = mount()
    const field = cell(0, 0)!
    field.textContent = 'primeiro'
    field.dispatchEvent(new FocusEvent('blur'))

    const text = editor.state.doc.toString()
    expect(text).toContain('| primeiro | 1 |')
    // O que prova a correção: a linha de traços continua como a pessoa escreveu.
    expect(text).toContain('|---|:---:|')
  })

  it('não escreve nada quando a célula não mudou', () => {
    const editor = mount()
    const before = editor.state.doc.toString()
    const field = cell(0, 0)!
    field.textContent = 'um'
    field.dispatchEvent(new FocusEvent('blur'))
    expect(editor.state.doc.toString()).toBe(before)
  })

  it('escapa a barra digitada dentro da célula', () => {
    const editor = mount()
    const field = cell(0, 0)!
    field.textContent = 'a | b'
    field.dispatchEvent(new FocusEvent('blur'))
    expect(editor.state.doc.toString()).toContain('| a \\| b | 1 |')
  })

  it('o + da coluna insere uma coluna à direita', () => {
    const editor = mount()
    press(columnTools(0)[0])
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna |  | Nota |')
  })

  it('o × da coluna remove aquela coluna', () => {
    const editor = mount()
    press(columnTools(1)[1])
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna |')
  })

  it('nunca remove a última coluna', () => {
    const editor = mount(['| só |', '|---|', '| 1 |'].join('\n'))
    press(columnTools(0)[1])
    expect(editor.state.doc.toString()).toContain('| só |')
  })

  it('o × da linha remove aquela linha', () => {
    const editor = mount()
    const gutter = document.querySelectorAll('.cm-md-table tbody tr')[0]!
    press(gutter.querySelectorAll<HTMLElement>('.cm-md-table-button')[1])
    const lines = editor.state.doc.toString().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('| dois | 2 |')
  })

  it('os botões do rodapé acrescentam linha e coluna', () => {
    const editor = mount()
    press(button('+ linha'))
    expect(editor.state.doc.toString().split('\n')).toHaveLength(5)
    press(button('+ coluna'))
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna | Nota |  |')
  })

  it('"texto" troca a grade pelo Markdown cru', () => {
    mount()
    expect(grid()).not.toBeNull()
    press(button('texto'))
    expect(grid()).toBeNull()
  })

  // O foco em si é coisa do navegador, que o jsdom não move para um
  // contenteditable. O que dá para provar aqui é o efeito no documento.
  it('Tab no meio da tabela não mexe no documento', () => {
    const editor = mount()
    const before = editor.state.doc.toString()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    cell(0, 0)!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(editor.state.doc.toString()).toBe(before)
  })

  it('Tab na última célula acrescenta uma linha', () => {
    const editor = mount()
    cell(1, 1)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(editor.state.doc.toString().split('\n')).toHaveLength(5)
  })

  it('Enter acrescenta uma linha a partir da última', () => {
    const editor = mount()
    cell(1, 0)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(editor.state.doc.toString().split('\n')).toHaveLength(5)
  })

  it('Escape devolve o valor de antes', () => {
    const editor = mount()
    const before = editor.state.doc.toString()
    const field = cell(0, 0)!
    field.textContent = 'lixo'
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(field.textContent).toBe('um')
    expect(editor.state.doc.toString()).toBe(before)
  })
})
