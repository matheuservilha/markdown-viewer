// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { insertLink, toggleBold, toggleItalic, toggleTask } from './commands'

let view: EditorView | null = null

function mount(doc: string, from: number, to = from): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    parent: document.body,
  })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

describe('negrito e itálico', () => {
  it('envolve o que está selecionado', () => {
    const editor = mount('um dois três', 3, 7)
    toggleBold(editor)
    expect(editor.state.doc.toString()).toBe('um **dois** três')
  })

  it('a seleção continua sendo a palavra, não as marcas', () => {
    const editor = mount('um dois três', 3, 7)
    toggleBold(editor)
    const { from, to } = editor.state.selection.main
    expect(editor.state.sliceDoc(from, to)).toBe('dois')
  })

  it('tira as marcas quando já estão lá', () => {
    const editor = mount('um **dois** três', 5, 9)
    toggleBold(editor)
    expect(editor.state.doc.toString()).toBe('um dois três')
  })

  it('tira as marcas quando elas estão dentro da seleção', () => {
    const editor = mount('um **dois** três', 3, 11)
    toggleBold(editor)
    expect(editor.state.doc.toString()).toBe('um dois três')
  })

  it('sem seleção, escreve o par e põe o cursor no meio', () => {
    const editor = mount('um  três', 3)
    toggleItalic(editor)
    expect(editor.state.doc.toString()).toBe('um ** três')
    expect(editor.state.selection.main.head).toBe(4)
  })
})

describe('link', () => {
  it('deixa o cursor onde vai o endereço', () => {
    const editor = mount('leia o manual', 7, 13)
    insertLink(editor)
    expect(editor.state.doc.toString()).toBe('leia o [manual]()')
    expect(editor.state.selection.main.head).toBe(16)
  })
})

describe('tarefa', () => {
  it('transforma a linha em tarefa e marca depois', () => {
    const editor = mount('comprar pão', 0)
    toggleTask(editor)
    expect(editor.state.doc.toString()).toBe('- [ ] comprar pão')
    toggleTask(editor)
    expect(editor.state.doc.toString()).toBe('- [x] comprar pão')
  })
})
