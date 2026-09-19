/**
 * The file name, drawn as the first thing on the page.
 *
 * It is not part of the document: the title of a note on disk is its file name,
 * and writing it into the text would be the editor inventing content.
 */

import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

class TitleWidget extends WidgetType {
  constructor(private readonly name: string) {
    super()
  }

  eq(other: TitleWidget): boolean {
    return other.name === this.name
  }

  toDOM(): HTMLElement {
    const title = document.createElement('div')
    title.className = 'cm-md-title'
    title.textContent = this.name
    return title
  }

  ignoreEvent(): boolean {
    return true
  }
}

export function documentTitle(name: string): Extension {
  return EditorView.decorations.of(
    Decoration.set([
      Decoration.widget({ widget: new TitleWidget(name), block: true, side: -1 }).range(0),
    ]),
  )
}
