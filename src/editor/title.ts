/**
 * The file name, drawn as the first thing on the page.
 *
 * It is not part of the document: the title of a note on disk is its file name,
 * and writing it into the text would be the editor inventing content.
 *
 * It can be edited, and editing it renames the note: the file on disk, or the
 * draft that has no file yet. Only the name is editable. The extension sits
 * after it in a quieter type and cannot be reached, because a note that stops
 * ending in `.md` stops being a note this app opens.
 */

import { Compartment, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

/**
 * Renames the note to `stem`, the name without its extension. Resolves to what
 * went wrong, or to null when the rename happened.
 */
export type Rename = (stem: string) => Promise<string | null>

/** Swapped when the name changes, so the title follows without rebuilding the editor. */
export const titleCompartment = new Compartment()

/** The shortcuts that belong to the name while it is being typed into. */
const FIELD_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'y', 'arrowleft', 'arrowright', 'backspace'])

/** How long a refused name's reason stays under the title. */
const REFUSAL_TIME = 4000

/**
 * `nota.md` is `nota` and `.md`. A draft has no extension yet and gets the one
 * it will be saved with; a leading dot is part of the name, not an extension.
 */
export function splitTitle(name: string, draft: boolean): { stem: string; extension: string } {
  if (draft) return { stem: name, extension: '.md' }
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

class TitleWidget extends WidgetType {
  /** Set once this title has been taken off the page, so a late blur renames nothing. */
  private gone = false

  constructor(
    private readonly stem: string,
    private readonly extension: string,
    private readonly rename: Rename | null,
  ) {
    super()
  }

  eq(other: TitleWidget): boolean {
    return (
      other.stem === this.stem &&
      other.extension === this.extension &&
      (other.rename === null) === (this.rename === null)
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const title = document.createElement('div')
    title.className = 'cm-md-title'

    const name = document.createElement('span')
    name.className = 'cm-md-title-name'
    name.textContent = this.stem
    title.append(name)

    if (this.extension !== '') {
      const extension = document.createElement('span')
      extension.className = 'cm-md-title-ext'
      extension.textContent = this.extension
      extension.setAttribute('aria-hidden', 'true')
      title.append(extension)
    }

    const rename = this.rename
    if (!rename) return title

    name.setAttribute('contenteditable', 'plaintext-only')
    name.spellcheck = false
    name.setAttribute('role', 'textbox')
    name.setAttribute('aria-label', 'Nome da nota')
    title.classList.add('is-editable')

    const refusal = document.createElement('div')
    refusal.className = 'cm-md-title-refused'
    refusal.setAttribute('role', 'alert')
    title.append(refusal)

    let refusalTimer = 0
    let busy = false

    const typed = () => (name.textContent ?? '').replace(/\s+/g, ' ').trim()

    const toBody = () => {
      // Back to the text, at its start: the name is done, the writing is next.
      view.focus()
    }

    const commit = async () => {
      if (this.gone || busy) return
      const next = typed()
      if (next === this.stem) {
        name.textContent = this.stem
        return
      }
      busy = true
      title.dataset.pending = 'true'
      const problem = next === '' ? 'O nome não pode ficar vazio.' : await rename(next)
      busy = false
      delete title.dataset.pending
      if (this.gone) return
      if (problem === null) return
      // Refused: the old name comes back, and the reason stays a moment.
      name.textContent = this.stem
      refusal.textContent = problem
      title.dataset.refused = 'true'
      window.clearTimeout(refusalTimer)
      refusalTimer = window.setTimeout(() => {
        delete title.dataset.refused
      }, REFUSAL_TIME)
    }

    name.addEventListener('keydown', (event) => {
      if (event.isComposing) return
      // Selecting, undoing, copying and pasting act on the name, the way they
      // would in any field. Left to the editor they would act on the note:
      // undo in the title would undo the text below it. Every other shortcut,
      // saving among them, still belongs to the app.
      if ((event.metaKey || event.ctrlKey) && !FIELD_KEYS.has(event.key.toLowerCase())) return
      event.stopPropagation()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        // All of the name and nothing else, whatever the page around it is.
        event.preventDefault()
        const range = document.createRange()
        range.selectNodeContents(name)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        void commit().then(toBody)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        name.textContent = this.stem
        toBody()
      }
    })

    // A pasted name with a line break in it is still one name.
    name.addEventListener('input', () => {
      if (!(name.textContent ?? '').includes('\n')) return
      name.textContent = (name.textContent ?? '').replace(/\n+/g, ' ')
    })

    name.addEventListener('blur', () => void commit())

    return title
  }

  destroy(): void {
    this.gone = true
  }

  ignoreEvent(): boolean {
    return true
  }
}

export function documentTitle(
  name: string,
  draft = false,
  rename: Rename | null = null,
): Extension {
  const { stem, extension } = splitTitle(name, draft)
  return EditorView.decorations.of(
    Decoration.set([
      Decoration.widget({
        widget: new TitleWidget(stem, extension, rename),
        block: true,
        side: -1,
      }).range(0),
    ]),
  )
}
