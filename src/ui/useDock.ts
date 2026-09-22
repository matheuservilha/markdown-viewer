/**
 * The app's window driving the squares and the note that floats out of them.
 *
 * Everything the two panels show is decided here, and so is where on the
 * screen they go. They are views; this is the only copy of the list and the
 * colours, and the only thing that writes any of it down. Two windows each
 * holding their own copy of a list and mailing changes to each other is the
 * bug this shape does not have.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PEEK_MIN_HEIGHT,
  SQUARE,
  dockRect,
  maxPeekHeight,
  peekRect,
  squareRect,
  within,
  type Area,
  type Rect,
  type Side,
} from '~/app/dock-layout'
import {
  addPin,
  findPin,
  freeColor,
  isDraftPin,
  isPinned,
  loadPins,
  removePin,
  renamePin,
  savePins,
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

/** How often the pointer is looked up while a note is showing. */
const WATCH_EVERY = 60
/**
 * How many readings in a row have to land off the square before the note goes.
 *
 * One is too few: a square leans away from the edge when the pointer arrives,
 * and for a frame the pointer can be reading as just outside the square it is
 * sitting perfectly still on.
 */
const WATCH_MISSES = 2
/** How far past the edge of a square still counts as being on it. */
const WATCH_SLACK = 7
/** The note opens at this height unless the screen is too short for it. */
const PEEK_HEIGHT = 420

export interface DockOptions {
  /** Whether the squares are on the edge of the screen at all. */
  enabled: boolean
  side: Side
  theme: 'light' | 'dark'
  /** Ids the app itself has unsaved changes in. */
  dirty: readonly string[]
  /** The text of a pinned note that is still only a draft. */
  draftText: (id: string) => string | undefined
  /** Asked for by the square that writes a new note. */
  onNewNote: () => PinTarget | null
  /** Asked for by a click on a square: bring this note into the app. */
  onOpenInApp: (pin: Pin) => void
}

export function useDock(options: DockOptions) {
  const [pins, setPins] = useState<Pin[]>(loadPins)

  // Read from the message handlers, which are bound once and must see the
  // state of the moment the message arrived.
  const latest = useRef({ pins, options })
  const latestState = useRef<DockState>({
    pins,
    side: options.side,
    theme: options.theme,
    dirty: [],
    nextColor: freeColor(pins),
  })

  useEffect(() => savePins(pins), [pins])

  /** Where the panels are right now, so the next one can be placed beside it. */
  const area = useRef<Area | null>(null)
  const dock = useRef<Rect | null>(null)
  /** The square whose note is showing, in screen pixels. */
  const square = useRef<Rect | null>(null)

  const place = useCallback(async (count: number, side: Side, fresh = false) => {
    if (!latest.current.options.enabled) return
    const screen = await workArea(fresh)
    if (!screen) return
    const rect = dockRect(screen, side, count)
    area.current = screen
    dock.current = rect
    await placePanel('dock', rect)
  }, [])

  const closePeek = useCallback(async () => {
    square.current = null
    send('peek:note', null)
    await hidePanel('peek')
  }, [])

  /**
   * Noticing that the pointer has left the square.
   *
   * The square cannot be asked once the pointer is outside its window. A
   * window that is always on top and was never clicked is not the active
   * window, and its webview is not reliably told that the pointer went away.
   * So the pointer is looked up from the system a few times a second and put
   * against the square the note belongs to.
   *
   * Only the square counts. Landing on the note itself closes it, the same as
   * landing anywhere else: the note is something you glance at, not something
   * you travel to.
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
        const target = square.current
        if (!target) {
          stopWatching()
          return
        }
        const at = await cursorAt()
        if (!at) return
        if (within(target, at.x, at.y, WATCH_SLACK)) {
          misses.current = 0
          return
        }
        misses.current += 1
        if (misses.current < WATCH_MISSES) return
        stopWatching()
        void closePeek()
      })()
    }, WATCH_EVERY)
  }, [closePeek, stopWatching])

  /** Opens the note beside the square the pointer came to rest on. */
  const showPeek = useCallback(async (index: number) => {
    const { pins: known, options: now } = latest.current
    const pin = known[index]
    const screen = area.current
    const column = dock.current
    if (!pin || !screen || !column) return

    const target = squareRect(column, now.side, index)
    square.current = target

    const height = Math.max(PEEK_MIN_HEIGHT, Math.min(PEEK_HEIGHT, maxPeekHeight(screen)))
    const rect = peekRect(screen, now.side, column, height, target.y + SQUARE / 2)

    const note: PeekNote = { pin, theme: now.theme }
    const text = isDraftPin(pin) ? now.draftText(pin.id) : undefined
    if (text !== undefined) note.draftText = text

    // Told first, moved second. The panel starts reading the file while the
    // window is still being put in place, so what appears has text in it
    // instead of appearing empty and filling in a beat later.
    send('peek:note', note)
    await placePanel('peek', rect)
  }, [])

  // Everything the squares draw, sent again whenever any of it changes.
  const state: DockState = useMemo(
    () => ({
      pins,
      side: options.side,
      theme: options.theme,
      dirty: [...options.dirty],
      nextColor: freeColor(pins),
    }),
    [pins, options.side, options.theme, options.dirty],
  )

  useEffect(() => {
    // oxlint-disable-next-line immutability
    latest.current = { pins, options }
    // oxlint-disable-next-line immutability
    latestState.current = state
  })

  useEffect(() => {
    if (options.enabled) send('dock:state', state)
  }, [state, options.enabled])

  /**
   * The column exists while the setting says so, and is exactly as tall as the
   * squares in it: one per note, plus the one that writes a new one.
   */
  const count = pins.length + 1
  useEffect(() => {
    if (!options.enabled) {
      stopWatching()
      void hidePanel('dock')
      void hidePanel('peek')
      return
    }
    void place(count, options.side, true)
    // The note has about a tenth of a second to appear, which is not long
    // enough to load a window from nothing.
    void preparePanel('peek')
  }, [options.enabled, options.side, count, place, stopWatching])

  const openInApp = useCallback(
    (id: string) => {
      const pin = findPin(latest.current.pins, id)
      if (!pin) return
      latest.current.options.onOpenInApp(pin)
      void showMainWindow()
      stopWatching()
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

      on('dock:hover', ({ index }) => {
        void showPeek(index)
        startWatching()
      }),

      on('dock:leave', () => {
        stopWatching()
        void closePeek()
      }),

      on('dock:new', () => {
        const target = latest.current.options.onNewNote()
        if (!target) return
        setPins((current) => addPin(current, target))
        stopWatching()
        void closePeek()
      }),

      on('note:open-in-app', ({ id }) => openInApp(id)),
    ]

    return () => {
      for (const stop of stops) stop()
      stopWatching()
    }
  }, [closePeek, openInApp, showPeek, startWatching, stopWatching])

  const toggle = useCallback((target: PinTarget) => {
    setPins((current) =>
      isPinned(current, target.id) ? removePin(current, target.id) : addPin(current, target),
    )
  }, [])

  /**
   * Renames a square. A name that has not actually changed is dropped here
   * rather than further down, because this runs on every keystroke in a draft
   * and each pass that goes through would write the list to storage and send
   * it to the other window again.
   */
  const rename = useCallback(
    (id: string, name: string) =>
      setPins((current) => {
        const pin = findPin(current, id)
        if (!pin) return current
        const next = isDraftPin(pin) ? noteTitle(name, pin.name) : name
        return next === pin.name ? current : renamePin(current, id, next)
      }),
    [],
  )

  const forget = useCallback((id: string) => setPins((current) => removePin(current, id)), [])

  return { pins, togglePin: toggle, renamePin: rename, unpin: forget }
}
