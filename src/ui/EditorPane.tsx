import { Annotation, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { ViewState } from '~/app/session'
import { isDraft } from '~/app/drafts'
import { isPlainTextTab, type Doc, type Tab } from '~/app/store'
import { bodyStart } from '~/editor/frontmatter'
import { outlineOf, sameOutline, type Heading } from '~/editor/outline'
import { editorExtensions, readOnlyCompartment, readOnlyExtension } from '~/editor/setup'
import { documentTitle, titleCompartment, type Rename } from '~/editor/title'

/** How long the cursor has to sit still before its position is worth storing. */
const VIEW_REPORT_DELAY = 400

/**
 * Marks text that arrived from another window. It is already that window's
 * edit, so it is not reported back as this one's.
 */
const fromElsewhere = Annotation.define<boolean>()

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
  /** The headings of the open file, for the panel on the side. */
  onOutline: (headings: Heading[]) => void
  /** Hands the live editor out, so the panel can scroll it. */
  onReady: (view: EditorView | null) => void
  /**
   * Renames the note from its title. Without it the title can only be read,
   * which is right where there is nothing that could do the renaming.
   */
  onRename?: Rename
  /**
   * Whether the cursor lands here as soon as the editor is built. True in the
   * app, where opening a file is a request to write in it. False in the note
   * that floats out on hover, which nobody asked to type in yet.
   */
  autoFocus?: boolean
}

export function EditorPane({
  tab,
  doc,
  readOnly,
  getInitialView,
  onViewChange,
  onChange,
  onSave,
  onOutline,
  onReady,
  onRename,
  autoFocus = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  /** Cursor and history per tab, so switching back lands where you left. */
  const parked = useRef(new Map<string, EditorState>())
  const handlers = useRef({ onChange, onSave, onViewChange, onOutline, onReady, onRename })
  handlers.current = { onChange, onSave, onViewChange, onOutline, onReady, onRename }
  /**
   * One function for the life of the pane, which calls whatever renaming the
   * parent hands in at the time. The title widget keeps the function it was
   * built with, so it has to be this one.
   */
  const rename = useRef<Rename>(
    (stem) => handlers.current.onRename?.(stem) ?? Promise.resolve('Não dá para renomear aqui.'),
  )
  const renames = onRename !== undefined

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
        draft: isDraft(tab),
        rename: renames ? rename.current : null,
      }),
      EditorView.updateListener.of((update) => {
        const echo = update.transactions.some((tr) => tr.annotation(fromElsewhere))
        if (update.docChanged && !echo) handlers.current.onChange(update.state.doc.toString())
        if (update.docChanged || update.selectionSet) report()
        // Every update and not only the ones that changed the text: parsing
        // happens in the background, so a document whose end was still being
        // read when the summary was taken is finished a beat later, and the
        // summary has to catch up with it.
        publishOutline()
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
    if (autoFocus) instance.focus()

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

    /*
     * The tree is parsed in the background, so the first reading comes a beat
     * after the editor opens, and again whenever the text changes.
     *
     * `null` and not an empty list, because those are different things: one
     * means nothing has been said yet, the other means this document has no
     * headings. Starting at the empty list made a document with no headings
     * look like a document that had already been reported, and the panel went
     * on showing the headings of the file before it.
     */
    let headings: Heading[] | null = null
    let outlineTimer = 0
    function publishOutline(): void {
      window.clearTimeout(outlineTimer)
      outlineTimer = window.setTimeout(() => {
        const current = view.current
        if (!current) return
        const next = outlineOf(current.state)
        if (headings !== null && sameOutline(next, headings)) return
        headings = next
        handlers.current.onOutline(next)
      }, 250)
    }
    publishOutline()

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
    handlers.current.onReady(instance)

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(outlineTimer)
      handlers.current.onReady(null)
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

  /** The title follows the name, and stops being editable where the text is. */
  useEffect(() => {
    view.current?.dispatch({
      effects: titleCompartment.reconfigure(
        documentTitle(tab.name, isDraft(tab), readOnly || !renames ? null : rename.current),
      ),
    })
    // `tab` is read for its name and its kind, both already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.name, readOnly, renames])

  /**
   * The same note typed into in another window. Taken in whether or not there
   * is unsaved text here, because it is the same unsaved text: the other
   * window started from this one's.
   *
   * Only the part that differs is replaced, so the cursor here stays where it
   * was instead of jumping to the end.
   */
  useEffect(() => {
    const instance = view.current
    if (!instance || doc.rev === undefined) return
    const current = instance.state.doc.toString()
    if (current === doc.text) return
    instance.dispatch({
      changes: difference(current, doc.text),
      annotations: fromElsewhere.of(true),
    })
    // Only a new revision brings text in; the text alone changes on every
    // keystroke typed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.rev])

  /** A reload from disk is the other case where the text is replaced from outside. */
  useEffect(() => {
    const instance = view.current
    if (!instance || doc.dirty) return
    const current = instance.state.doc.toString()
    if (current === doc.text) return
    instance.dispatch({ changes: { from: 0, to: current.length, insert: doc.text } })
  }, [doc.text, doc.dirty])

  return <div className="editor" ref={host} />
}

/** The smallest single replacement that turns `from` into `to`. */
export function difference(from: string, to: string): { from: number; to: number; insert: string } {
  let start = 0
  const shorter = Math.min(from.length, to.length)
  while (start < shorter && from.charCodeAt(start) === to.charCodeAt(start)) start++
  let end = 0
  while (
    end < shorter - start &&
    from.charCodeAt(from.length - 1 - end) === to.charCodeAt(to.length - 1 - end)
  ) {
    end++
  }
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) }
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
