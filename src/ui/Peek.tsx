/**
 * The note that floats beside the dock.
 *
 * It is the same editor as the app's, in a window the size of a card. Resting
 * on a row in the dock opens it to read; clicking the row fixes it, and from
 * then on it is a note you can scroll, tick and type in.
 *
 * Reading and writing the file happens here rather than through the app's
 * window. The file on disk is what both of them agree on, and the app already
 * knows how to notice a file that changed underneath it, so a note saved from
 * this window arrives in the app the same way a note saved by any other
 * program does.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { applySettings, loadSettings } from '~/app/settings'
import { isDraftPin, pinTitle } from '~/app/pinned'
import type { Doc, Tab } from '~/app/store'
import { fileSystem } from '~/platform'
import { encode, type TextShape } from '~/platform/text'
import { hidePanel } from '~/platform/panels'
import { on, send, type PeekNote } from '~/platform/channel'
import { EditorPane } from './EditorPane'
import { CloseIcon, OpenInAppIcon } from './icons'

/** How long the typing has to stop before the note is written. */
const SAVE_DELAY = 1200
/** And how long before a draft is handed back to the app to be stored. */
const DRAFT_DELAY = 400

const DRAFT_SHAPE: TextShape = { eol: '\n', bom: false, encoding: 'utf-8', lossy: false }

/**
 * Folders this window has already been given access to.
 *
 * Asking again costs a listing of the whole folder, and this window asks every
 * time the pointer rests on a row. Access, once granted, lasts as long as the
 * app does, so asking twice buys nothing and a folder of a thousand notes
 * makes the second ask the slowest thing on screen.
 */
const reachable = new Set<string>()

type Loaded =
  | { status: 'loading' }
  | { status: 'gone'; message: string }
  | { status: 'ready'; tab: Tab; doc: Doc }

export function Peek() {
  const [note, setNote] = useState<PeekNote | null>(null)
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)

  // The app's window is the one that knows what to show here, and it may have
  // been told before this window finished loading.
  useEffect(() => {
    const stop = on('peek:note', (next) => {
      // The settings live in shared storage, so they are read again with every
      // note rather than kept: the app may have changed the reading width or
      // the font while this panel sat closed.
      applySettings(loadSettings())
      setNote(next)
    })
    send('panel:hello', { role: 'peek' })
    return stop
  }, [])

  useEffect(() => {
    if (note) document.documentElement.dataset.theme = note.theme
  }, [note])

  const pin = note?.pin ?? null
  const id = pin?.id ?? null
  /** Bumped to read the note again, which is what the conflict strip offers. */
  const [reloads, setReloads] = useState(0)

  /** The text as it is this instant, which is not what React last rendered. */
  const text = useRef('')
  const version = useRef({ size: 0, modifiedAt: 0 })
  const shape = useRef<TextShape>(DRAFT_SHAPE)
  const view = useRef<EditorView | null>(null)

  /** Reads the note. A draft arrives with its text; a file comes off disk. */
  useEffect(() => {
    let cancelled = false
    if (!note || !pin) {
      setLoaded({ status: 'loading' })
      return
    }

    const tab: Tab = {
      id: pin.id,
      baseId: pin.baseId,
      path: pin.path,
      name: pin.name,
      preview: false,
      ...(pin.label === undefined ? {} : { label: pin.label }),
    }

    if (isDraftPin(pin)) {
      setDirty(false)
      setConflict(false)
      text.current = note.draftText ?? ''
      shape.current = DRAFT_SHAPE
      version.current = { size: 0, modifiedAt: 0 }
      setLoaded({
        status: 'ready',
        tab,
        doc: {
          text: note.draftText ?? '',
          shape: DRAFT_SHAPE,
          version: { size: 0, modifiedAt: 0 },
          dirty: false,
          conflict: false,
          gone: false,
        },
      })
      return
    }

    setLoaded({ status: 'loading' })
    void (async () => {
      try {
        const files = fileSystem()
        // The folder has to be reachable from this window too, and each window
        // asks for that access for itself. Once.
        if (!reachable.has(pin.baseId)) {
          const back =
            pin.path === ''
              ? await files.restoreFile(pin.baseId, false)
              : await files.restoreBase(pin.baseId, false)
          if (back.status !== 'ok') throw new Error('A pasta dessa nota não está acessível.')
          reachable.add(pin.baseId)
        }
        const file = await files.read(pin.baseId, pin.path)
        if (cancelled) return
        text.current = file.text
        shape.current = file.shape
        version.current = file.version
        setDirty(false)
        setConflict(false)
        setLoaded({
          status: 'ready',
          tab,
          doc: { ...file, dirty: false, conflict: false, gone: false },
        })
      } catch (error) {
        if (cancelled) return
        setLoaded({
          status: 'gone',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()

    return () => {
      cancelled = true
    }
    // Only the identity of the note reloads it, and the conflict strip asking
    // outright. Being fixed by a click, or the theme changing, must not throw
    // away what is in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloads])

  const save = useCallback(
    async (force = false) => {
      if (!pin || isDraftPin(pin) || shape.current.lossy) return
      const files = fileSystem()
      try {
        if (!force) {
          const onDisk = await files.stat(pin.baseId, pin.path)
          // A file that grew a newer stamp than the one we read is a file
          // somebody else wrote. Overwriting it is a decision, not a default.
          if (onDisk && onDisk.modifiedAt > version.current.modifiedAt) {
            setConflict(true)
            return
          }
        }
        const written = await files.write(pin.baseId, pin.path, encode(text.current, shape.current))
        version.current = written
        setConflict(false)
        setDirty(false)
      } catch {
        // A write that failed leaves the dot up, which is the honest report:
        // there is still something here that is not on disk.
      }
    },
    [pin],
  )

  /**
   * The note writes itself after a pause, whatever the app's own setting says.
   *
   * There is no tab strip here and no question on the way out: this window can
   * be closed by a click anywhere else, and the text in it would be the only
   * copy. A panel that forgets is worse than a panel that saves.
   */
  const timer = useRef(0)
  const onChange = useCallback(
    (next: string) => {
      text.current = next
      setDirty(true)
      window.clearTimeout(timer.current)
      if (!pin) return
      if (isDraftPin(pin)) {
        timer.current = window.setTimeout(
          () => send('peek:draft', { id: pin.id, text: next }),
          DRAFT_DELAY,
        )
        return
      }
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY)
    },
    [pin, save],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // A click is what asks to write, and the editor was built without the
  // keyboard, so the cursor is put there now rather than at build time.
  const stuckNow = note?.stuck === true
  useEffect(() => {
    if (stuckNow) view.current?.focus()
  }, [stuckNow, loaded.status])

  // The dock draws a dot on the row while there is something unwritten here.
  useEffect(() => {
    if (id) send('peek:dirty', { id, dirty })
  }, [id, dirty])

  const close = () => {
    window.clearTimeout(timer.current)
    if (pin && !isDraftPin(pin) && dirty) void save()
    send('peek:close', null)
    void hidePanel('peek')
  }

  // Escape closes, the way it closes anything else that floated in.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!note || !pin) {
    return <div className="peek is-blank" />
  }

  const stuck = note.stuck
  const draft = isDraftPin(pin)

  return (
    <div className="peek" data-color={pin.color} data-stuck={stuck}>
      <header className="peek-head">
        <span className="peek-colour" />
        <span className="peek-title" title={pin.label ?? pin.path}>
          {pinTitle(pin)}
        </span>
        {draft && (
          <span className="peek-badge" title="Ainda não é um arquivo. Abra no app para salvar.">
            rascunho
          </span>
        )}
        {!draft && <span className="peek-state" data-dirty={dirty} aria-hidden="true" />}
        <button
          type="button"
          className="icon-button is-small"
          aria-label="Abrir no app"
          title="Abrir no app"
          onClick={() => send('note:open-in-app', { id: pin.id })}
        >
          <OpenInAppIcon size={15} />
        </button>
        <button
          type="button"
          className="icon-button is-small"
          aria-label="Fechar"
          title="Fechar"
          onClick={close}
        >
          <CloseIcon size={13} />
        </button>
      </header>

      {conflict && (
        <div className="peek-warn" role="alert">
          <span>O arquivo mudou por fora.</span>
          <button type="button" onClick={() => setReloads((n) => n + 1)}>
            Recarregar
          </button>
          <button type="button" onClick={() => void save(true)}>
            Salvar mesmo assim
          </button>
        </div>
      )}

      {loaded.status === 'gone' && <p className="peek-gone">{loaded.message}</p>}

      {loaded.status === 'ready' && (
        <div className="peek-body">
          <EditorPane
            key={loaded.tab.id}
            tab={loaded.tab}
            doc={loaded.doc}
            // Resting on a row is a request to read. Only a click asks to
            // write, and only then does the editor take the keyboard.
            readOnly={!stuck || note.readOnly || loaded.doc.shape.lossy}
            autoFocus={stuck}
            getInitialView={() => undefined}
            onViewChange={() => {}}
            onChange={onChange}
            onSave={() => void save()}
            onOutline={() => {}}
            onReady={(ready) => {
              view.current = ready
            }}
          />
        </div>
      )}

      {!stuck && <p className="peek-hint">Clique na nota para escrever</p>}
    </div>
  )
}
