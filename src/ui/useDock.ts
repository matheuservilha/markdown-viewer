/**
 * The app's window driving the tabs and the note that floats out of them.
 *
 * Everything the two panels show is decided here, and so is where on the
 * screen they go. They are views; this is the only copy of the list and the
 * colours, and the only thing that writes any of it down. Two windows each
 * holding their own copy of a list and mailing changes to each other is the
 * bug this shape does not have.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CHIP_HEIGHT,
  PEEK_MIN_HEIGHT,
  chipRect,
  dockRect,
  maxPeekHeight,
  peekRect,
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
  recolourPin,
  removePin,
  renamePin,
  savePins,
  type Pin,
  type PinTarget,
} from '~/app/pinned'
import { noteTitle } from '~/app/drafts'
import {
  hidePanel,
  onChipMenuChoice,
  onChipUnderPointer,
  openChipMenu,
  placePanel,
  preparePanel,
  showMainWindow,
  watchChips,
  workArea,
} from '~/platform/panels'
import { on, send, type DockState, type PeekNote } from '~/platform/channel'

/**
 * How long the pointer has to stay on one tab before its note floats out.
 *
 * Long enough that running the pointer down the column does not fire off four
 * notes on the way past, short enough that stopping on one does not feel like
 * waiting.
 */
const PEEK_DELAY = 90
/** The note opens at this height unless the screen is too short for it. */
const PEEK_HEIGHT = 420
/** How far in from the glance's slot a kept note opens, so it reads as coming forward. */
const KEEP_STEP = 34

export interface DockOptions {
  /** Whether the tabs are on the edge of the screen at all. */
  enabled: boolean
  side: Side
  theme: 'light' | 'dark'
  /** How solid a floating note is, from the settings. */
  opacity: number
  readOnly: boolean
  /** The text of a pinned note that is still only a draft. */
  draftText: (id: string) => string | undefined
  /** A draft edited in the note that was kept open. */
  onDraftText: (id: string, text: string) => void
  /** Asked for by the tab that writes a new note. */
  onNewNote: () => PinTarget | null
  /** Asked for from the kept note: bring it into the app. */
  onOpenInApp: (pin: Pin) => void
}

export function useDock(options: DockOptions) {
  const [pins, setPins] = useState<Pin[]>(loadPins)
  /** The note somebody clicked, which is open until they close it. */
  const [kept, setKept] = useState<string | null>(null)
  /** Which tab the system's menu was opened over. */
  const menuTarget = useRef<string | null>(null)

  // Read from the message handlers, which are bound once and must see the
  // state of the moment the message arrived.
  const latest = useRef({ pins, options, kept })
  const latestState = useRef<DockState>({
    pins,
    side: options.side,
    theme: options.theme,
    nextColor: freeColor(pins),
  })

  useEffect(() => savePins(pins), [pins])

  /** Where the panels are right now, so the next one can be placed beside it. */
  const area = useRef<Area | null>(null)
  const dock = useRef<Rect | null>(null)
  /** The tab whose note is showing, in screen pixels. */
  const chip = useRef<Rect | null>(null)

  /**
   * Puts the column where it goes, and hands the system the rectangle of every
   * tab in it so that the pointer can be watched against them.
   *
   * The two happen together on purpose: the rectangles are only true for the
   * placement they were computed from, and a column that gained a note has
   * moved every tab in it.
   */
  const place = useCallback(async (count: number, side: Side, fresh = false) => {
    if (!latest.current.options.enabled) return
    const screen = await workArea(fresh)
    if (!screen) return
    const rect = dockRect(screen, side, count)
    area.current = screen
    dock.current = rect
    await placePanel('dock', rect)
    await watchChips(Array.from({ length: count }, (_, index) => chipRect(rect, index)))
  }, [])

  const closePeek = useCallback(async () => {
    chip.current = null
    send('peek:note', null)
    await hidePanel('peek')
  }, [])

  /** What a floating window needs to draw a note, glance or kept alike. */
  const describe = useCallback((pin: Pin): PeekNote => {
    const now = latest.current.options
    const note: PeekNote = {
      pin,
      theme: now.theme,
      opacity: now.opacity,
      readOnly: now.readOnly,
    }
    const text = isDraftPin(pin) ? now.draftText(pin.id) : undefined
    if (text !== undefined) note.draftText = text
    return note
  }, [])

  /** Where a note belonging to this tab goes, and how big it is. */
  const slotFor = useCallback((index: number) => {
    const screen = area.current
    const column = dock.current
    if (!screen || !column) return null
    const target = chipRect(column, index)
    const height = Math.max(PEEK_MIN_HEIGHT, Math.min(PEEK_HEIGHT, maxPeekHeight(screen)))
    const rect = peekRect(
      screen,
      latest.current.options.side,
      column,
      height,
      target.y + CHIP_HEIGHT / 2,
    )
    return { chip: target, rect }
  }, [])

  /** Opens the glance beside the tab the pointer came to rest on. */
  const showPeek = useCallback(
    async (index: number) => {
      const pin = latest.current.pins[index]
      const slot = slotFor(index)
      if (!pin || !slot) return
      chip.current = slot.chip

      // Told first, moved second. The panel starts reading the file while the
      // window is still being put in place, so what appears has text in it
      // instead of appearing empty and filling in a beat later.
      send('peek:note', describe(pin))
      await placePanel('peek', slot.rect)
    },
    [describe, slotFor],
  )

  /**
   * Keeps the note the pointer was on: it stops being a glance and becomes a
   * window of their own, which nothing takes away.
   *
   * It opens a step in from where the glance was rather than exactly on it, so
   * that it reads as having come forward, and so that the next glance over
   * another tab has its own slot back.
   */
  const keepNote = useCallback(
    async (index: number) => {
      const pin = latest.current.pins[index]
      const slot = slotFor(index)
      if (!pin || !slot) return

      const step = latest.current.options.side === 'right' ? -KEEP_STEP : KEEP_STEP
      setKept(pin.id)
      send('note:show', describe(pin))
      await hidePanel('peek')
      chip.current = null
      await placePanel(
        'note',
        { ...slot.rect, x: slot.rect.x + step, y: slot.rect.y - 14 },
        { focus: true },
      )
    },
    [describe, slotFor],
  )

  // Everything the tabs draw, sent again whenever any of it changes.
  const state: DockState = useMemo(
    () => ({
      pins,
      side: options.side,
      theme: options.theme,
      nextColor: freeColor(pins),
    }),
    [pins, options.side, options.theme],
  )

  useEffect(() => {
    // oxlint-disable-next-line immutability
    latest.current = { pins, options, kept }
    // oxlint-disable-next-line immutability
    latestState.current = state
  })

  useEffect(() => {
    if (options.enabled) send('dock:state', state)
  }, [state, options.enabled])

  // The look, on its own, so that dragging a slider in the settings changes a
  // note that is already open while it is being dragged.
  useEffect(() => {
    send('panels:look', { theme: options.theme, opacity: options.opacity })
  }, [options.theme, options.opacity])

  /**
   * The column exists while the setting says so, and is exactly as tall as the
   * tabs in it: one per note, plus the one that writes a new one.
   */
  const count = pins.length + 1
  useEffect(() => {
    if (!options.enabled) {
      void watchChips([])
      void hidePanel('dock')
      void hidePanel('peek')
      return
    }
    void place(count, options.side, true)
    // The note has about a tenth of a second to appear, which is not long
    // enough to load a window from nothing.
    void preparePanel('peek')
  }, [options.enabled, options.side, count, place])

  const openInApp = useCallback(
    (id: string) => {
      const pin = findPin(latest.current.pins, id)
      if (!pin) return
      latest.current.options.onOpenInApp(pin)
      void showMainWindow()
      void closePeek()
      setKept(null)
      void hidePanel('note')
    },
    [closePeek],
  )

  /**
   * Which tab the pointer is over, as the system reports it.
   *
   * This is the whole of the hovering. The tabs themselves are never asked,
   * and they no longer guess: they are told which one to light up, and the
   * note opens beside whichever one the pointer settles on.
   *
   * The wait is here and not in the other window so that the tab lights up the
   * instant the pointer arrives while the note, which costs a window, waits
   * for the pointer to mean it.
   */
  const settling = useRef(0)
  useEffect(() => {
    if (!options.enabled) return
    return onChipUnderPointer((index) => {
      window.clearTimeout(settling.current)
      send('dock:near', { index })
      if (index < 0) {
        void closePeek()
        return
      }
      // The last tab is the one that writes a new note. It has none of its own
      // to show, so whatever was showing is put away.
      if (index >= latest.current.pins.length) {
        void closePeek()
        return
      }
      settling.current = window.setTimeout(() => void showPeek(index), PEEK_DELAY)
    })
  }, [options.enabled, closePeek, showPeek])

  useEffect(() => () => window.clearTimeout(settling.current), [])

  /** What was chosen in the system's menu, which named a line and nothing else. */
  useEffect(() => {
    if (!options.enabled) return
    return onChipMenuChoice((id) => {
      const target = menuTarget.current
      if (!target) return
      if (id === 'chip:unpin') {
        forgetRef.current(target)
        return
      }
      // The note is the one that knows whether it has anything unwritten, and
      // the only one that can ask about it, so it is asked.
      if (latest.current.kept !== target) return
      if (id === 'chip:save') send('note:save', null)
      if (id === 'chip:close') send('note:ask-close', null)
    })
  }, [options.enabled])

  // One listener per message, bound once. They read through `latest` rather
  // than closing over the state, so none of them is rebound as things change.
  useEffect(() => {
    const stops = [
      on('panel:hello', ({ role }) => {
        if (role === 'dock') send('dock:state', latestState.current)
        if (role === 'note' && latest.current.kept) {
          const pin = findPin(latest.current.pins, latest.current.kept)
          if (pin) send('note:show', describe(pin))
        }
      }),

      on('dock:click', ({ index }) => void keepNote(index)),

      on('dock:menu', ({ index }) => {
        const pin = latest.current.pins[index]
        if (!pin) return
        // Remembered here rather than sent to the system and back: the menu
        // only has to say which line was chosen, and this is the one window
        // that knows what it was chosen about.
        menuTarget.current = pin.id
        void openChipMenu(latest.current.kept === pin.id)
      }),

      on('dock:new', () => {
        const target = latest.current.options.onNewNote()
        if (!target) return
        setPins((current) => addPin(current, target))
        void closePeek()
      }),

      on('note:closed', () => setKept(null)),

      on('note:unpin', ({ id }) => forgetRef.current(id)),

      on('note:recolour', ({ id, color }) => {
        setPins((current) => recolourPin(current, id, color))
        // The note is told its new colour without being reloaded: it is the
        // same note, and the text in it is the same text.
        const pin = findPin(latest.current.pins, id)
        if (pin) send('note:show', describe({ ...pin, color }))
      }),

      on('note:draft', ({ id, text }) => {
        latest.current.options.onDraftText(id, text)
        // A note written on the edge of the screen names itself after its own
        // first line, wherever it is being typed into.
        setPins((current) => {
          const pin = findPin(current, id)
          if (!pin || !isDraftPin(pin)) return current
          const named = noteTitle(text, pin.name)
          return named === pin.name ? current : renamePin(current, id, named)
        })
      }),

      on('note:open-in-app', ({ id }) => openInApp(id)),
    ]

    return () => {
      for (const stop of stops) stop()
    }
  }, [closePeek, describe, keepNote, openInApp])

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

  /**
   * Unpinning reaches the message handlers through a reference because it is
   * defined below them, and moving either one would drag half the file with
   * it.
   */
  const forgetRef = useRef<(id: string) => void>(() => {})

  const forget = useCallback((id: string) => {
    setPins((current) => removePin(current, id))
    // A note that is no longer on the edge of the screen has nothing keeping
    // its window open either.
    setKept((current) => {
      if (current !== id) return current
      void hidePanel('note')
      return null
    })
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line immutability
    forgetRef.current = forget
  }, [forget])

  return { pins, togglePin: toggle, renamePin: rename, unpin: forget }
}
