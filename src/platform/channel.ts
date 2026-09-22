/**
 * What the three windows say to each other.
 *
 * The app's window is the only one that owns anything. It holds the list of
 * pinned notes and the drafts, it decides where the panels go, and it writes
 * to storage. The dock and the floating note are views: they report what the
 * pointer did and they draw what they are told. Two windows editing the same
 * list from two copies of it is the bug this arrangement does not have.
 *
 * Everything travels on one system event with a `kind` inside, rather than one
 * event per message. A window then listens once, and a message that nobody is
 * listening for costs nothing.
 */

import { isDesktop } from '.'
import type { Pin, PinColor } from '~/app/pinned'
import type { Side } from '~/app/dock-layout'

const EVENT = 'app:message'

/** Tells our own messages apart from everybody else's: Tauri sends to all. */
const ME = Math.random().toString(36).slice(2)

/** What the column of squares needs to draw itself, which is all it knows. */
export interface DockState {
  pins: Pin[]
  side: Side
  theme: 'light' | 'dark'
  /** Ids of the notes with something unsaved in them, so the corner can show. */
  dirty: string[]
  /** The colour the next note will be born with, worn by the square that adds one. */
  nextColor: PinColor
}

/** A note handed to one of the floating windows, ready to show. */
export interface PeekNote {
  pin: Pin
  /** The text, for a draft. A file is read from disk by the panel itself. */
  draftText?: string
  theme: 'light' | 'dark'
  /** How solid the card is, so a slider being dragged shows up at once. */
  opacity: number
  readOnly: boolean
}

export interface Messages {
  /** A panel has just loaded and has nothing to show yet. */
  'panel:hello': { role: 'dock' | 'peek' | 'note' }

  'dock:state': DockState

  /**
   * Which tab the pointer is over, or -1 for none.
   *
   * The tabs do not work this out for themselves. A window is only sent
   * mouse-moved events while its application is the active one, and this one
   * is on top of everybody else's work precisely so that it never has to be:
   * the first click on another app would end the hovering for good. So the
   * app's window has the system watch the pointer, and says what it saw.
   */
  'dock:near': { index: number }
  /** A tab was clicked: its note stops being a glance and stays open. */
  'dock:click': { index: number }
  /** The tab that writes a new note was clicked. */
  'dock:new': null

  /** The glance that comes and goes with the pointer. */
  'peek:note': PeekNote | null
  /** The note somebody clicked, which stays until they close it. */
  'note:show': PeekNote | null
  /** Closed from its own corner, so the app's window stops counting it open. */
  'note:closed': null
  /** Taken off the edge of the screen from inside the note itself. */
  'note:unpin': { id: string }
  /** A draft edited in the kept note; the app's window stores it. */
  'note:draft': { id: string; text: string }
  /** Something unwritten in the kept note, so its tab can show a dot. */
  'note:dirty': { id: string; dirty: boolean }

  /**
   * The look of the panels changed while they were open, which is how a slider
   * being dragged in the settings shows up on the note itself.
   */
  'panels:look': { theme: 'light' | 'dark'; opacity: number }

  /** Bring the app's window back and open this note in it. */
  'note:open-in-app': { id: string }
}

interface Envelope {
  from: string
  kind: string
  payload: unknown
}

type Listener = (payload: never) => void

const listeners = new Map<string, Set<Listener>>()
/**
 * The system's own event module, fetched on first use.
 *
 * It is imported rather than required, so that a build for the browser never
 * carries it and the app's first chunk never waits for it. Sending before it
 * has arrived is fine: the message queues behind this promise, which is at
 * worst one tick.
 */
let bridge: Promise<typeof import('@tauri-apps/api/event')> | null = null
let started = false
let web: BroadcastChannel | null = null

function deliver(envelope: Envelope): void {
  if (envelope.from === ME) return
  for (const listener of listeners.get(envelope.kind) ?? []) {
    ;(listener as (payload: unknown) => void)(envelope.payload)
  }
}

function start(): void {
  if (started) return
  started = true
  if (isDesktop()) {
    bridge = import('@tauri-apps/api/event')
    void bridge.then(({ listen }) => listen<Envelope>(EVENT, (event) => deliver(event.payload)))
    return
  }
  // Outside the desktop there are no other windows, but a second browser tab
  // opened with `?window=dock` is close enough to work on the panels in.
  try {
    web = new BroadcastChannel(EVENT)
    web.addEventListener('message', (event: MessageEvent<Envelope>) => deliver(event.data))
  } catch {
    web = null
  }
}

export function send<K extends keyof Messages>(kind: K, payload: Messages[K]): void {
  start()
  const envelope: Envelope = { from: ME, kind, payload }
  if (isDesktop()) {
    // A message that did not get through is not worth interrupting anybody
    // over: the windows ask again, and the app's own window is the one that
    // holds the truth either way.
    void bridge?.then(({ emit }) => emit(EVENT, envelope)).catch(() => {})
    return
  }
  // A broadcast channel has one origin by definition, and no second argument
  // to give it.
  // oxlint-disable-next-line require-post-message-target-origin
  web?.postMessage(envelope)
}

export function on<K extends keyof Messages>(
  kind: K,
  listener: (payload: Messages[K]) => void,
): () => void {
  start()
  const set = listeners.get(kind) ?? new Set<Listener>()
  set.add(listener as Listener)
  listeners.set(kind, set)
  return () => {
    set.delete(listener as Listener)
  }
}
