import { WidgetType, type EditorView } from '@codemirror/view'

/** The drawn bullet that stands in for the `-` or `*` of a list item. */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** The clickable task box that stands in for `[ ]` or `[x]`. */
export class TaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.from === this.from
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-md-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      })
    })
    return box
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** The drawn rule that stands in for `---`. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-md-rule'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}
