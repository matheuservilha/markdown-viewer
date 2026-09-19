import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { bodyStart } from '~/editor/frontmatter'
import { editorExtensions } from '~/editor/setup'
import { isPlainTextTab, type Doc, type Tab } from '~/app/store'

interface Props {
  tab: Tab
  doc: Doc
  onChange: (text: string) => void
  onSave: () => void
}

export function EditorPane({ tab, doc, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  /** Cursor and history per tab, so switching back lands where you left. */
  const parked = useRef(new Map<string, EditorState>())
  const handlers = useRef({ onChange, onSave })
  handlers.current = { onChange, onSave }

  useEffect(() => {
    const parent = host.current
    if (!parent) return

    const extensions = [
      ...editorExtensions({
        title: tab.name,
        plainText: isPlainTextTab(tab),
        readOnly: doc.shape.lossy,
        onSave: () => handlers.current.onSave(),
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) handlers.current.onChange(update.state.doc.toString())
      }),
    ]

    const restored = parked.current.get(tab.id)
    const instance = new EditorView({
      state:
        restored && restored.doc.toString() === doc.text
          ? restored
          : EditorState.create({
              doc: doc.text,
              extensions,
              // Opening a file must not park the cursor inside the front
              // matter, which would greet the person with raw YAML.
              selection: EditorSelection.cursor(bodyStart(doc.text)),
            }),
      parent,
    })
    view.current = instance
    instance.focus()

    return () => {
      parked.current.set(tab.id, instance.state)
      instance.destroy()
      view.current = null
    }
    // The editor is rebuilt only when the tab changes. Text edits flow through
    // CodeMirror itself, and pushing `doc.text` back in would fight the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  /** A reload from disk is the one case where the text is replaced from outside. */
  useEffect(() => {
    const instance = view.current
    if (!instance || doc.dirty) return
    const current = instance.state.doc.toString()
    if (current === doc.text) return
    instance.dispatch({ changes: { from: 0, to: current.length, insert: doc.text } })
  }, [doc.text, doc.dirty])

  return <div className="editor" ref={host} />
}
