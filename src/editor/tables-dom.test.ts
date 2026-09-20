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
/** The thin bar above a column, which opens that column's menu. */
const columnHandle = (column: number) =>
  cell(-1, column)!.parentElement!.querySelector<HTMLElement>('.cm-md-col-handle')!
/** The thin bar left of a row. */
const rowHandle = (row: number) =>
  document
    .querySelectorAll('.cm-md-table tbody tr')
    [row]!.querySelector<HTMLElement>('.cm-md-row-handle')!

const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].map((item) => item.textContent!)

/** Opens a handle's menu and picks the entry that starts with this label. */
const pick = (handle: HTMLElement, label: string) => {
  press(handle)
  const item = [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((node) =>
    node.textContent!.startsWith(label),
  )
  if (!item) throw new Error('sem "' + label + '" no menu: ' + menuItems().join(' / '))
  item.click()
}

/** The menu of the table as a whole, on the right button. */
const rightClick = () =>
  document
    .querySelector('.cm-md-table-wrap')!
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
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

  it('o menu da coluna insere uma coluna à direita', () => {
    const editor = mount()
    pick(columnHandle(0), 'Inserir coluna à direita')
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna |  | Nota |')
  })

  it('o menu da coluna insere uma coluna à esquerda', () => {
    const editor = mount()
    pick(columnHandle(0), 'Inserir coluna à esquerda')
    expect(editor.state.doc.toString().split('\n')[0]).toBe('|  | Coluna | Nota |')
  })

  it('o menu da coluna muda o alinhamento', () => {
    const editor = mount()
    pick(columnHandle(0), 'Centralizar')
    expect(editor.state.doc.toString().split('\n')[1]).toBe('|:-:|:-:|')
  })

  it('o menu marca o alinhamento em vigor', () => {
    mount()
    press(columnHandle(1))
    expect(menuItems()).toContain('Centralizar✓')
  })

  it('o menu da coluna remove aquela coluna', () => {
    const editor = mount()
    pick(columnHandle(1), 'Remover coluna')
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna |')
  })

  it('nunca remove a última coluna', () => {
    const editor = mount(['| só |', '|---|', '| 1 |'].join('\n'))
    pick(columnHandle(0), 'Remover coluna')
    expect(editor.state.doc.toString()).toContain('| só |')
  })

  it('o menu da linha remove aquela linha', () => {
    const editor = mount()
    pick(rowHandle(0), 'Remover linha')
    const lines = editor.state.doc.toString().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('| dois | 2 |')
  })

  it('o menu da linha insere uma linha abaixo', () => {
    const editor = mount()
    pick(rowHandle(0), 'Inserir linha abaixo')
    const lines = editor.state.doc.toString().split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[3]).toBe('|  |  |')
  })

  it('o botão direito acrescenta no fim da tabela', () => {
    const editor = mount()
    rightClick()
    const item = [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((node) =>
      node.textContent!.startsWith('Inserir coluna no fim'),
    )!
    item.click()
    expect(editor.state.doc.toString().split('\n')[0]).toBe('| Coluna | Nota |  |')
  })

  it('"editar como texto" troca a grade pelo Markdown cru', () => {
    mount()
    expect(grid()).not.toBeNull()
    rightClick()
    const item = [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((node) =>
      node.textContent!.startsWith('Editar como texto'),
    )!
    item.click()
    expect(grid()).toBeNull()
  })

  it('não há botão nenhum desenhado na tabela', () => {
    mount()
    expect(document.querySelectorAll('.cm-md-table-wrap button')).toHaveLength(0)
  })

  it('as alças existem desde o começo, para o hover não mexer no layout', () => {
    mount()
    expect(document.querySelectorAll('.cm-md-col-handle')).toHaveLength(2)
    expect(document.querySelectorAll('.cm-md-row-handle')).toHaveLength(2)
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

  it('o menu fecha com Escape', () => {
    mount()
    press(columnHandle(0))
    expect(document.querySelector('.menu')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.menu')).toBeNull()
  })

  it('o menu fecha ao apertar fora dele', () => {
    mount()
    press(columnHandle(0))
    window.dispatchEvent(new Event('pointerdown'))
    expect(document.querySelector('.menu')).toBeNull()
  })
})
