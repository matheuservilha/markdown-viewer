import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { ViewState } from '~/app/session'
import { isPlainTextTab, type Doc, type Tab } from '~/app/store'
import { bodyStart } from '~/editor/frontmatter'
import { editorExtensions, readOnlyCompartment, readOnlyExtension } from '~/editor/setup'

/** How long the cursor has to sit still before its position is worth storing. */
const VIEW_REPORT_DELAY = 400

interface Props {
  tab: Tab
  doc: Doc
  readOnly: boolean
  /**
   * Where the cursor and the scroll were when this file was last open. It is a
   * function so that the value is read when the editor is built and not while
   * the component renders.
   */
  getInitialView: () => ViewState | undefined
  onViewChange: (view: ViewState) => void
  onChange: (text: string) => void
  onSave: () => void
}

export function EditorPane({
  tab,
  doc,
  readOnly,
  getInitialView,
  onViewChange,
  onChange,
  onSave,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  /** Cursor and history per tab, so switching back lands where you left. */
  const parked = useRef(new Map<string, EditorState>())
  const handlers = useRef({ onChange, onSave, onViewChange })
  handlers.current = { onChange, onSave, onViewChange }

  useEffect(() => {
    const parent = host.current
    if (!parent) return

    const extensions = [
      ...editorExtensions({
        title: tab.name,
        baseId: tab.baseId,
        path: tab.path,
        plainText: isPlainTextTab(tab),
        readOnly,
        onSave: () => handlers.current.onSave(),
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) handlers.current.onChange(update.state.doc.toString())
        if (update.docChanged || update.selectionSet) report()
      }),
    ]

    // Copied out of the ref so the cleanup below does not read `.current`
    // after the component has moved on.
    const states = parked.current
    const initialView = getInitialView()
    const restored = states.get(tab.id)
    const instance = new EditorView({
      state:
        restored && restored.doc.toString() === doc.text
          ? restored
          : EditorState.create({
              doc: doc.text,
              extensions,
              selection: startingSelection(doc.text, initialView),
            }),
      parent,
    })
    view.current = instance
    instance.focus()

    // A handle for measuring in the browser console during development.
    if (import.meta.env.DEV) (window as unknown as { cm?: EditorView }).cm = instance

    const scroller = instance.scrollDOM
    if (initialView?.scrollTop) {
      scroller.scrollTop = initialView.scrollTop
    } else if (initialView) {
      // Restoring the cursor without bringing it on screen leaves the person
      // at the top of a file they were reading the middle of.
      instance.dispatch({
        effects: EditorView.scrollIntoView(instance.state.selection.main.anchor, { y: 'center' }),
      })
    }

    let timer = 0
    function report(): void {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const current = view.current
        if (!current) return
        const range = current.state.selection.main
        handlers.current.onViewChange({
          selection: { anchor: range.anchor, head: range.head },
          scrollTop: current.scrollDOM.scrollTop,
        })
      }, VIEW_REPORT_DELAY)
    }

    scroller.addEventListener('scroll', report, { passive: true })

    return () => {
      window.clearTimeout(timer)
      scroller.removeEventListener('scroll', report)
      const range = instance.state.selection.main
      handlers.current.onViewChange({
        selection: { anchor: range.anchor, head: range.head },
        scrollTop: scroller.scrollTop,
      })
      states.set(tab.id, instance.state)
      instance.destroy()
      view.current = null
    }
    // The editor is rebuilt only when the tab changes. Text edits flow through
    // CodeMirror itself, and pushing `doc.text` back in would fight the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  /** Read-only is swapped in place, so toggling it does not rebuild the editor. */
  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(readOnlyExtension(readOnly)),
    })
  }, [readOnly])

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

/**
 * Where the cursor starts. A remembered position wins, as long as the file has
 * not shrunk past it; otherwise the cursor lands after the front matter, so
 * that opening a file never greets the person with raw YAML.
 */
function startingSelection(text: string, view: ViewState | undefined): EditorSelection {
  if (!view) return EditorSelection.single(bodyStart(text))
  const anchor = Math.min(view.selection.anchor, text.length)
  const head = Math.min(view.selection.head, text.length)
  return EditorSelection.single(anchor, head)
}
