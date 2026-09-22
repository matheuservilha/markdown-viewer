// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { editorExtensions } from './setup'
import { splitTitle, type Rename } from './title'

describe('splitTitle', () => {
  it('sets the extension apart from the name', () => {
    expect(splitTitle('nota.md', false)).toEqual({ stem: 'nota', extension: '.md' })
    expect(splitTitle('puro.txt', false)).toEqual({ stem: 'puro', extension: '.txt' })
  })

  it('cuts at the last dot only', () => {
    expect(splitTitle('ata 2026.09.22.md', false)).toEqual({
      stem: 'ata 2026.09.22',
      extension: '.md',
    })
  })

  it('gives a draft the extension it will be saved with', () => {
    expect(splitTitle('Sem título', true)).toEqual({ stem: 'Sem título', extension: '.md' })
  })

  it('keeps a leading dot as part of the name', () => {
    expect(splitTitle('.gitignore', false)).toEqual({ stem: '.gitignore', extension: '' })
  })
})

const views: EditorView[] = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
})

function open(options: { rename?: Rename | null; readOnly?: boolean; draft?: boolean } = {}) {
  const view = new EditorView({
    state: EditorState.create({
      doc: 'corpo\n',
      extensions: editorExtensions({
        title: options.draft ? 'Sem título' : 'nota.md',
        baseId: 'b',
        path: 'nota.md',
        plainText: false,
        readOnly: options.readOnly ?? false,
        onSave: () => {},
        draft: options.draft ?? false,
        rename: options.rename ?? null,
      }),
    }),
    parent: document.body,
  })
  views.push(view)
  const title = view.dom.querySelector<HTMLElement>('.cm-md-title')
  const name = view.dom.querySelector<HTMLElement>('.cm-md-title-name')
  if (!title || !name) throw new Error('sem título')
  return { view, title, name }
}

function type(name: HTMLElement, text: string, key: 'Enter' | 'Escape') {
  name.textContent = text
  name.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('the title', () => {
  it('shows the extension beside the name, outside what can be typed', () => {
    const { title, name } = open({ rename: async () => null })
    expect(name.textContent).toBe('nota')
    expect(name.getAttribute('contenteditable')).toBe('plaintext-only')
    const extension = title.querySelector('.cm-md-title-ext')
    expect(extension?.textContent).toBe('.md')
    expect(extension?.hasAttribute('contenteditable')).toBe(false)
  })

  it('shows .md on a draft, which has no file yet', () => {
    const { title } = open({ draft: true, rename: async () => null })
    expect(title.querySelector('.cm-md-title-ext')?.textContent).toBe('.md')
  })

  it('renames on Enter, with the name alone and trimmed', async () => {
    const rename = vi.fn<Rename>(async () => null)
    const { name } = open({ rename })
    type(name, '  ata de hoje ', 'Enter')
    await vi.waitFor(() => expect(rename).toHaveBeenCalledWith('ata de hoje'))
  })

  it('puts the old name back on Escape without renaming', () => {
    const rename = vi.fn<Rename>(async () => null)
    const { name } = open({ rename })
    type(name, 'outro', 'Escape')
    expect(name.textContent).toBe('nota')
    expect(rename).not.toHaveBeenCalled()
  })

  it('does nothing when the name did not change', () => {
    const rename = vi.fn<Rename>(async () => null)
    const { name } = open({ rename })
    type(name, 'nota', 'Enter')
    expect(rename).not.toHaveBeenCalled()
  })

  it('goes back to the old name and says why when the rename is refused', async () => {
    const { title, name } = open({ rename: async () => 'Já existe um arquivo chamado x.md.' })
    type(name, 'x', 'Enter')
    await vi.waitFor(() => expect(title.dataset.refused).toBe('true'))
    expect(name.textContent).toBe('nota')
    expect(title.querySelector('.cm-md-title-refused')?.textContent).toContain('Já existe')
  })

  it('refuses an empty name without asking anybody', async () => {
    const rename = vi.fn<Rename>(async () => null)
    const { title, name } = open({ rename })
    type(name, '   ', 'Enter')
    await vi.waitFor(() => expect(title.dataset.refused).toBe('true'))
    expect(rename).not.toHaveBeenCalled()
  })

  it('cannot be typed into where there is nothing to rename with, or the note is read only', () => {
    expect(open().name.hasAttribute('contenteditable')).toBe(false)
    expect(
      open({ rename: async () => null, readOnly: true }).name.hasAttribute('contenteditable'),
    ).toBe(false)
  })

  it('leaves the document alone', () => {
    const { view, name } = open({ rename: async () => null })
    type(name, 'outro', 'Enter')
    expect(view.state.doc.toString()).toBe('corpo\n')
  })
})
