/**
 * The note that floats out of a square.
 *
 * It is there to be read and nothing else: it appears while the pointer rests
 * on its square and goes the moment the pointer leaves, including when the
 * pointer lands on the note itself. Nothing here takes the keyboard and
 * nothing here writes to disk.
 *
 * It is still the app's own editor, read only, rather than a second renderer.
 * That is what makes a task look like a task and a table look like a table:
 * the glance shows the note the way the app shows it, down to the theme.
 */

import { useEffect, useState } from 'react'
import { applySettings, loadSettings } from '~/app/settings'
import { isDraftPin, pinTitle } from '~/app/pinned'
import type { Doc, Tab } from '~/app/store'
import { fileSystem } from '~/platform'
import type { TextShape } from '~/platform/text'
import { on, send, type PeekNote } from '~/platform/channel'
import { EditorPane } from './EditorPane'
import { OpenInAppIcon } from './icons'

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

  // The app's window is the one that knows what to show here, and it may have
  // been told before this window finished loading.
  useEffect(() => {
    const stops = [
      on('peek:note', (next) => {
        // The settings live in shared storage, so they are read again with
        // every note rather than kept: the app may have changed the reading
        // width or the font while this panel sat closed.
        applySettings(loadSettings())
        setNote(next)
      }),
      on('panels:look', ({ theme, opacity }) => {
        document.documentElement.dataset.theme = theme
        document.documentElement.style.setProperty('--note-opacity', String(opacity))
      }),
    ]
    send('panel:hello', { role: 'peek' })
    return () => {
      for (const stop of stops) stop()
    }
  }, [])

  useEffect(() => {
    if (!note) return
    document.documentElement.dataset.theme = note.theme
    document.documentElement.style.setProperty('--note-opacity', String(note.opacity))
  }, [note])

  const pin = note?.pin ?? null
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
    // The note is read again whenever a different one is shown, and whenever
    // the same one is shown again: the file may have changed on disk since the
    // last glance at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note])

  if (!note || !pin) return <div className="peek is-blank" />

  return (
    <div className="peek" data-color={pin.color}>
      <div className="peek-card">
        <header className="peek-head">
          <span className="peek-colour" />
          <span className="peek-title" title={pin.label ?? pin.path}>
            {pinTitle(pin)}
          </span>
          {isDraftPin(pin) && (
            <span className="peek-badge" title="Ainda não é um arquivo">
              rascunho
            </span>
          )}
          <span className="peek-open" aria-hidden="true">
            <OpenInAppIcon size={13} />
            clique para abrir
          </span>
        </header>

        {loaded.status === 'gone' && <p className="peek-gone">{loaded.message}</p>}

        {loaded.status === 'ready' && (
          <div className="peek-body">
            <EditorPane
              key={loaded.tab.id}
              tab={loaded.tab}
              doc={loaded.doc}
              // A glance, never a keyboard. This window appears without being
              // asked for and goes without being dismissed, so it must never
              // be the thing typing goes into.
              readOnly
              autoFocus={false}
              getInitialView={() => undefined}
              onViewChange={() => {}}
              onChange={() => {}}
              onSave={() => {}}
              onOutline={() => {}}
              onReady={() => {}}
            />
          </div>
        )}
      </div>
    </div>
  )
}
