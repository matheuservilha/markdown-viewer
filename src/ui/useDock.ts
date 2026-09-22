/**
 * The app's window driving the two panels.
 *
 * Everything the dock and the floating note show is decided here, and so is
 * where on the screen they go. They are views; this is the only copy of the
 * list, the order and the colours, and the only thing that writes any of it
 * down. Two windows each holding their own copy of a list and mailing changes
 * to each other is the bug this shape does not have.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PEEK_MIN_HEIGHT,
  dockRect,
  maxPeekHeight,
  peekRect,
  within,
  type Area,
  type Rect,
  type Side,
} from '~/app/dock-layout'
import {
  addPin,
  findPin,
  loadPins,
  recolourPin,
  removePin,
  renamePin,
  reorderPins,
  savePins,
  isDraftPin,
  isPinned,
  type Pin,
  type PinTarget,
} from '~/app/pinned'
import { noteTitle } from '~/app/drafts'
import {
  cursorAt,
  hidePanel,
  placePanel,
  preparePanel,
  showMainWindow,
  workArea,
} from '~/platform/panels'
import { on, send, type DockState, type PeekNote } from '~/platform/channel'

/** How often the pointer is looked up while a panel is open. */
const WATCH_EVERY = 90
/**
 * How many readings in a row have to land off both panels before they close.
 *
 * One is too few: the seam between the two windows, and the moment a window is
 * being moved, both read as nowhere. Three readings is about a quarter of a
 * second of the pointer being genuinely somewhere else.
 */
const WATCH_MISSES = 3
/** How far past the edge of a panel still counts as being on it. */
const WATCH_SLACK = 6
/** The note opens at this height unless the screen is too short for it. */
const PEEK_HEIGHT = 440

export interface DockOptions {
  /** Whether the dock is on at all. */
  enabled: boolean
  side: Side
  autoCollapse: boolean
  theme: 'light' | 'dark'
  readOnly: boolean
  autosave: boolean
  /** Ids the app itself has unsaved changes in. */
  dirty: readonly string[]
  /** The text of a pinned note that is still only a draft. */
  draftText: (id: string) => string | undefined
  /** A draft edited in the floating note. */
  onDraftText: (id: string, text: string) => void
  /** Asked for by the dock's own button. Returns where the new note lives. */
  onNewNote: () => PinTarget | null
  /** Asked for by either panel: bring this note into the app. */
  onOpenInApp: (pin: Pin) => void
}

export function useDock(options: DockOptions) {
  const [pins, setPins] = useState<Pin[]>(loadPins)
  /**
   * The note whose window was fixed by a click. Turning the dock off puts it
   * out of reach rather than clearing it, so that nothing has to be written
   * from inside an effect.
   */
  const [fixed, setStuck] = useState<string | null>(null)
  const stuck = options.enabled ? fixed : null
  /** What the floating note says it still has unwritten. */
  const [panelDirty, setPanelDirty] = useState<readonly string[]>([])

  // Read from the message handlers, which are bound once and must see the
  // state of the moment the message arrived.
  const latest = useRef({ pins, stuck, options })
  const latestState = useRef<DockState>({
    pins,
    side: options.side,
    autoCollapse: options.autoCollapse,
    theme: options.theme,
    dirty: [],
    stuck,
  })

  useEffect(() => savePins(pins), [pins])

  /** Where the panels are right now, so the next one can be placed beside it. */
  const area = useRef<Area | null>(null)
  const dock = useRef<Rect | null>(null)
  const peek = useRef<Rect | null>(null)
  const size = useRef({ expanded: false, height: 120 })

  const place = useCallback(
    async (expanded: boolean, height: number, side: Side, fresh = false) => {
      if (!latest.current.options.enabled) return
      const screen = await workArea(fresh)
      if (!screen) return
      const rect = dockRect(screen, side, expanded, height)
      area.current = screen
      dock.current = rect
      size.current = { expanded, height }
      await placePanel('dock', rect)
    },
    [],
  )

  /** Opens the floating note beside the row the pointer is on. */
  const showPeek = useCallback(async (id: string, y: number, hold: boolean) => {
    const { pins: known, options: now } = latest.current
    const pin = findPin(known, id)
    const screen = area.current
    const anchor = dock.current
    if (!pin || !screen || !anchor) return

    const height = Math.max(PEEK_MIN_HEIGHT, Math.min(PEEK_HEIGHT, maxPeekHeight(screen)))
    const rect = peekRect(screen, now.side, anchor, height, anchor.y + y)
    peek.current = rect

    const note: PeekNote = {
      pin,
      stuck: hold,
      theme: now.theme,
      readOnly: now.readOnly,
      autosave: now.autosave,
    }
    const text = isDraftPin(pin) ? now.draftText(pin.id) : undefined
    if (text !== undefined) note.draftText = text

    // Told first, moved second. The panel starts reading the file while the
    // window is still being put in place, so what appears has text in it
    // instead of appearing empty and filling in a beat later.
    send('peek:note', note)
    await placePanel('peek', rect, { focus: hold })
  }, [])

  /** Half the height of the dock, for a note with no row to come out of yet. */
  const halfWay = useCallback(() => (dock.current?.height ?? 200) / 2, [])

  const closePeek = useCallback(async () => {
    setStuck(null)
    peek.current = null
    send('peek:note', null)
    await hidePanel('peek')
  }, [])

  /**
   * Noticing that the pointer has gone.
   *
   * Neither panel can be asked. A window that is always on top and was never
   * clicked is not the active window, and its webview is not reliably told
   * that the pointer left it, so the list would sit open on an empty screen
   * and the note would never close. The pointer is therefore looked up from
   * the system a few times a second, for as long as anything is open, and put
   * against the rectangles the panels were placed at.
   */
  const watching = useRef(0)
  const misses = useRef(0)

  const stopWatching = useCallback(() => {
    window.clearInterval(watching.current)
    watching.current = 0
  }, [])

  const startWatching = useCallback(() => {
    misses.current = 0
    if (watching.current !== 0) return
    watching.current = window.setInterval(() => {
      void (async () => {
        const at = await cursorAt()
        if (!at) return
        const onDock = dock.current !== null && within(dock.current, at.x, at.y, WATCH_SLACK)
        const onPeek = peek.current !== null && within(peek.current, at.x, at.y, WATCH_SLACK)
        if (onDock || onPeek) {
          misses.current = 0
          return
        }
        misses.current += 1
        if (misses.current < WATCH_MISSES) return

        // A note fixed by a click stays, and so does the list under it. There
        // is nothing left to watch for until it is closed.
        if (latest.current.stuck !== null) {
          stopWatching()
          return
        }
        stopWatching()
        send('dock:away', null)
        void closePeek()
      })()
    }, WATCH_EVERY)
  }, [closePeek, stopWatching])

  // Everything the dock draws, sent again whenever any of it changes.
  const state: DockState = useMemo(
    () => ({
      pins,
      side: options.side,
      autoCollapse: options.autoCollapse,
      theme: options.theme,
      dirty: [...new Set([...options.dirty, ...panelDirty])],
      stuck,
    }),
    [pins, options.side, options.autoCollapse, options.theme, options.dirty, panelDirty, stuck],
  )

  useEffect(() => {
    // oxlint-disable-next-line immutability
    latest.current = { pins, stuck, options }
    // oxlint-disable-next-line immutability
    latestState.current = state
  })

  useEffect(() => {
    if (options.enabled) send('dock:state', state)
  }, [state, options.enabled])

  /** The dock exists while the setting says so, and not a moment longer. */
  useEffect(() => {
    if (!options.enabled) {
      stopWatching()
      void hidePanel('dock')
      void hidePanel('peek')
      return
    }
    // Turning the dock on, or moving it to the other edge, is the moment to
    // ask the system where the screen is rather than reuse the last answer.
    void place(size.current.expanded, size.current.height, options.side, true)
    // The note that floats out has a fifth of a second to appear, which is not
    // long enough to load a window from nothing.
    void preparePanel('peek')
  }, [options.enabled, options.side, place, stopWatching])

  const openInApp = useCallback(
    (id: string) => {
      const pin = findPin(latest.current.pins, id)
      if (!pin) return
      latest.current.options.onOpenInApp(pin)
      void showMainWindow()
      stopWatching()
      send('dock:away', null)
      void closePeek()
    },
    [closePeek, stopWatching],
  )

  // One listener per message, bound once. They read through `latest` rather
  // than closing over the state, so none of them is rebound as things change.
  useEffect(() => {
    const stops = [
      on('panel:hello', ({ role }) => {
        if (role === 'dock') send('dock:state', latestState.current)
      }),

      on(
        'dock:size',
        ({ expanded, height }) => void place(expanded, height, latest.current.options.side),
      ),

      on('dock:enter', () => startWatching()),

      on('dock:hover', ({ id, y }) => {
        startWatching()
        if (latest.current.stuck !== null) return
        void showPeek(id, y, false)
      }),

      on('dock:click', ({ id, y }) => {
        // A second click on the row that is already open closes it, the way a
        // second click on anything that opened on a click does.
        if (latest.current.stuck === id) {
          void closePeek()
          startWatching()
          return
        }
        stopWatching()
        setStuck(id)
        void showPeek(id, y, true)
      }),

      on('peek:close', () => {
        void closePeek()
        startWatching()
      }),

      on('peek:dirty', ({ id, dirty }) => {
        setPanelDirty((current) =>
          dirty ? [...new Set([...current, id])] : current.filter((held) => held !== id),
        )
      }),

      on('peek:draft', ({ id, text }) => {
        latest.current.options.onDraftText(id, text)
        // A note written on the edge of the screen names itself after its own
        // first line, because nobody names a sticky note before writing it.
        setPins((current) => {
          const pin = findPin(current, id)
          if (!pin || !isDraftPin(pin)) return current
          return renamePin(current, id, noteTitle(text, pin.name))
        })
      }),

      on('dock:new', () => {
        const target = latest.current.options.onNewNote()
        if (!target) return
        setPins((current) => addPin(current, target))
        setStuck(target.id)
        // The list has one more row than the dock was placed for, so it is
        // measured again before the note is put beside it.
        window.setTimeout(() => void showPeek(target.id, halfWay(), true), 120)
      }),

      on('dock:unpin', ({ id }) => {
        setPins((current) => removePin(current, id))
        if (latest.current.stuck === id) {
          void closePeek()
          startWatching()
        }
      }),

      on('dock:recolour', ({ id, color }) => setPins((current) => recolourPin(current, id, color))),

      on('dock:reorder', ({ ids }) => setPins((current) => reorderPins(current, ids))),

      on('note:open-in-app', ({ id }) => openInApp(id)),
    ]

    return () => {
      for (const stop of stops) stop()
      stopWatching()
    }
  }, [closePeek, halfWay, openInApp, place, showPeek, startWatching, stopWatching])

  const toggle = useCallback((target: PinTarget) => {
    setPins((current) =>
      isPinned(current, target.id) ? removePin(current, target.id) : addPin(current, target),
    )
  }, [])

  const rename = useCallback(
    (id: string, name: string) => setPins((current) => renamePin(current, id, name)),
    [],
  )

  const forget = useCallback((id: string) => setPins((current) => removePin(current, id)), [])

  return { pins, togglePin: toggle, renamePin: rename, unpin: forget }
}
