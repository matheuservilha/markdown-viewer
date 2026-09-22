/**
 * The note somebody clicked, which stays.
 *
 * It starts where the glance was and then it is theirs: it does not go when
 * the pointer leaves, it moves when they drag its header, it resizes from its
 * corner, and it closes when they say so. The glance next door is still free
 * to come and go over the other tabs while this one sits there.
 *
 * It is the app's own editor, so a task is a task and a table is a table. It
 * writes to the file after a pause in the typing: there is no tab strip here
 * and no question on the way out, and a window that can be closed with one
 * click is the last place text should live alone.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { applySettings, loadSettings } from '~/app/settings'
import { isDraftPin, pinTitle } from '~/app/pinned'
import type { Doc, Tab } from '~/app/store'
import { fileSystem } from '~/platform'
import { encode, type TextShape } from '~/platform/text'
import { hidePanel } from '~/platform/panels'
import { on, send, type PeekNote } from '~/platform/channel'
import { EditorPane } from './EditorPane'
import { installWindowDrag } from './window-drag'
import { CloseIcon, OpenInAppIcon, UnpinIcon } from './icons'

/** How long the typing has to stop before the note is written. */
const SAVE_DELAY = 1100
/** And how long before a draft is handed back to the app to be stored. */
const DRAFT_DELAY = 350

const DRAFT_SHAPE: TextShape = { eol: '\n', bom: false, encoding: 'utf-8', lossy: false }

/** Folders this window has already been given access to. */
const reachable = new Set<string>()

type Loaded =
  | { status: 'loading' }
  | { status: 'gone'; message: string }
  | { status: 'ready'; tab: Tab; doc: Doc }

export function Note() {
  const [note, setNote] = useState<PeekNote | null>(null)
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    const stops = [
      on('note:show', (next) => {
        applySettings(loadSettings())
        setNote(next)
      }),
      // A slider being dragged in the settings shows up here while it is being
      // dragged, which is the only way anybody can judge it.
      on('panels:look', ({ theme, opacity }) => {
        document.documentElement.dataset.theme = theme
        document.documentElement.style.setProperty('--note-opacity', String(opacity))
      }),
    ]
    send('panel:hello', { role: 'note' })
    return () => {
      for (const stop of stops) stop()
    }
  }, [])

  // Dragged by its own header, because it has no title bar of its own.
  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void installWindowDrag({ maximize: false }).then((off) => {
      if (cancelled) off()
      else stop = off
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  useEffect(() => {
    if (!note) return
    document.documentElement.dataset.theme = note.theme
    document.documentElement.style.setProperty('--note-opacity', String(note.opacity))
  }, [note])

  const pin = note?.pin ?? null
  const id = pin?.id ?? null

  const text = useRef('')
  const version = useRef({ size: 0, modifiedAt: 0 })
  const shape = useRef<TextShape>(DRAFT_SHAPE)

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
      text.current = note.draftText ?? ''
      shape.current = DRAFT_SHAPE
      version.current = { size: 0, modifiedAt: 0 }
      setDirty(false)
      setConflict(false)
      setLoaded({
        status: 'ready',
        tab,
        doc: {
          text: text.current,
          shape: DRAFT_SHAPE,
          version: version.current,
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
    // Reloaded when a different note is shown, and when the conflict strip
    // asks outright. Not when the theme or the opacity changes, which would
    // throw away what is in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloads])

  const save = useCallback(
    async (force = false) => {
      if (!pin || isDraftPin(pin) || shape.current.lossy) return
      const files = fileSystem()
      try {
        if (!force) {
          const onDisk = await files.stat(pin.baseId, pin.path)
          // A file with a newer stamp than the one we read is a file somebody
          // else wrote. Overwriting it is a decision, not a default.
          if (onDisk && onDisk.modifiedAt > version.current.modifiedAt) {
            setConflict(true)
            return
          }
        }
        version.current = await files.write(
          pin.baseId,
          pin.path,
          encode(text.current, shape.current),
        )
        setConflict(false)
        setDirty(false)
      } catch {
        // A write that failed leaves the dot up, which is the honest report:
        // there is still something here that is not on disk.
      }
    },
    [pin],
  )

  const timer = useRef(0)
  const onChange = useCallback(
    (next: string) => {
      text.current = next
      setDirty(true)
      window.clearTimeout(timer.current)
      if (!pin) return
      if (isDraftPin(pin)) {
        timer.current = window.setTimeout(
          () => send('note:draft', { id: pin.id, text: next }),
          DRAFT_DELAY,
        )
        return
      }
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY)
    },
    [pin, save],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (id) send('note:dirty', { id, dirty })
  }, [id, dirty])

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    if (pin && !isDraftPin(pin) && dirty) void save()
    send('note:closed', null)
    void hidePanel('note')
  }, [dirty, pin, save])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  if (!note || !pin) return <div className="peek is-blank" />

  const draft = isDraftPin(pin)

  return (
    <div className="peek is-kept" data-color={pin.color}>
      <div className="peek-card">
        {/* The header is the title bar: there is no other, and this is what
            the window is dragged by. */}
        <header className="peek-head" data-drag-window>
          <span className="peek-grip" aria-hidden="true" />
          <span className="peek-colour" />
          <span className="peek-title" title={pin.label ?? pin.path}>
            {pinTitle(pin)}
          </span>
          {draft ? (
            <span className="peek-badge" title="Ainda não é um arquivo">
              rascunho
            </span>
          ) : (
            <span className="peek-state" data-dirty={dirty} aria-hidden="true" />
          )}
          <button
            type="button"
            className="icon-button is-small"
            aria-label="Abrir no app"
            title="Abrir no app"
            onClick={() => send('note:open-in-app', { id: pin.id })}
          >
            <OpenInAppIcon size={14} />
          </button>
          {/* Taking the note off the edge of the screen closes this window
              too: it is the window of an abinha that is about to stop
              existing. Anything unwritten is written first, the same as on
              the way out through the corner. */}
          <button
            type="button"
            className="icon-button is-small"
            aria-label="Tirar da borda da tela"
            title="Tirar da borda da tela"
            onClick={() => {
              window.clearTimeout(timer.current)
              if (!draft && dirty) void save()
              send('note:unpin', { id: pin.id })
            }}
          >
            <UnpinIcon size={14} />
          </button>
          <button
            type="button"
            className="icon-button is-small"
            aria-label="Fechar a nota"
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
              doc={{ ...loaded.doc, dirty }}
              readOnly={note.readOnly || loaded.doc.shape.lossy}
              getInitialView={() => undefined}
              onViewChange={() => {}}
              onChange={onChange}
              onSave={() => void save()}
              onOutline={() => {}}
              onReady={() => {}}
            />
          </div>
        )}
      </div>
    </div>
  )
}
