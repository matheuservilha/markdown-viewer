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

/** What the dock needs to draw itself, which is everything it knows. */
export interface DockState {
  pins: Pin[]
  side: Side
  autoCollapse: boolean
  theme: 'light' | 'dark'
  /** Ids of the notes with something unsaved in them, so the dot can show. */
  dirty: string[]
  /**
   * The note whose floating window was fixed by a click, if any. The dock
   * stays open while one is: rolling up the list under an open note would
   * leave the note pointing at nothing.
   */
  stuck: string | null
}

/** A note handed to the floating window, ready to show. */
export interface PeekNote {
  pin: Pin
  /** The text, for a draft. A file is read from disk by the panel itself. */
  draftText?: string
  /** Fixed by a click, so it no longer goes away when the pointer leaves. */
  stuck: boolean
  theme: 'light' | 'dark'
  readOnly: boolean
  autosave: boolean
}

export interface Messages {
  /** A panel has just loaded and has nothing to show yet. */
  'panel:hello': { role: 'dock' | 'peek' }

  'dock:state': DockState
  /** The pointer reached the edge, so the app's window starts watching it. */
  'dock:enter': null
  /** The pointer is on neither panel any more: roll the list back up. */
  'dock:away': null
  'dock:hover': { id: string; y: number }
  'dock:click': { id: string; y: number }
  /** The list got taller or shorter, or rolled up. */
  'dock:size': { expanded: boolean; height: number }
  'dock:new': null
  'dock:unpin': { id: string }
  'dock:recolour': { id: string; color: PinColor }
  'dock:reorder': { ids: string[] }

  'peek:note': PeekNote | null
  'peek:close': null
  'peek:dirty': { id: string; dirty: boolean }
  /** A draft edited in the floating window; the app's window stores it. */
  'peek:draft': { id: string; text: string }

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
