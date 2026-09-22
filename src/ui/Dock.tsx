/**
 * The tabs on the edge of the screen.
 *
 * One per pinned note, in its colour, plus one at the bottom that writes a new
 * one. Each is a rounded rectangle cut in half by the edge of the monitor, and
 * the pointer arriving pulls more of it into view. That is the whole of it:
 * there is no list, nothing opens, nothing is fixed. The pointer rests on a
 * tab and the note floats out to be read; the pointer leaves and it is gone.
 *
 * It owns nothing. The notes and the colours arrive from the app's window, and
 * everything the pointer does here leaves as a message.
 */

import { useEffect, useRef, useState } from 'react'
import { pinTitle, type Pin } from '~/app/pinned'
import { on, send, type DockState } from '~/platform/channel'
import { PlusIcon } from './icons'

/**
 * How long the pointer has to rest on a square before its note floats out.
 *
 * Long enough that running the pointer down the column does not fire off four
 * notes on the way past, short enough that stopping on one does not feel like
 * waiting.
 */
const PEEK_DELAY = 95

const EMPTY: DockState = {
  pins: [],
  side: 'right',
  theme: 'dark',
  dirty: [],
  nextColor: 'ambar',
}

export function Dock() {
  const [state, setState] = useState<DockState>(EMPTY)
  /** Which tab the pointer is on, so it can grow to meet it. */
  const [near, setNear] = useState<number | null>(null)
  const timer = useRef(0)

  // The app's window may have been running for hours before this one opened,
  // so it asks rather than waiting to be told.
  useEffect(() => {
    const stop = on('dock:state', setState)
    send('panel:hello', { role: 'dock' })
    return stop
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const enter = (index: number) => {
    setNear(index)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => send('dock:hover', { index }), PEEK_DELAY)
  }

  /**
   * The pointer slid off a tab but is still in this window, in the air between
   * two tabs or on its way to another.
   *
   * The tab shrinks back at once, and the note is left to the app's window to
   * close. Saying "gone" here would close a note that the next square is
   * about to replace a few milliseconds later, and the pair would read as a
   * blink rather than as a move.
   */
  const leaveChip = () => {
    setNear(null)
    window.clearTimeout(timer.current)
  }

  /**
   * The pointer left the column altogether.
   *
   * This is the quick half of noticing; it only fires while the system still
   * thinks the pointer belongs to this window, which it does not once the
   * pointer is well away. The other half is the app's window, which watches
   * where the pointer actually is.
   */
  const leaveColumn = () => {
    leaveChip()
    send('dock:leave', null)
  }

  const addNote = () => {
    leaveColumn()
    send('dock:new', null)
  }

  return (
    <div className="dock" data-side={state.side} onPointerLeave={leaveColumn}>
      <div className="dock-column">
        {state.pins.map((pin: Pin, index) => (
          <button
            key={pin.id}
            type="button"
            className={
              'chip' +
              (near === index ? ' is-near' : '') +
              (state.dirty.includes(pin.id) ? ' is-dirty' : '')
            }
            data-color={pin.color}
            // Each square comes in a beat after the one above it, so a column
            // that just gained a note reads as growing rather than blinking.
            style={{ animationDelay: index * 45 + 'ms' }}
            aria-label={pinTitle(pin)}
            title={pinTitle(pin)}
            onPointerEnter={() => enter(index)}
            onPointerLeave={leaveChip}
            onClick={() => send('note:open-in-app', { id: pin.id })}
          >
            <span className="chip-face" />
            <span className="chip-mark" aria-hidden="true" />
          </button>
        ))}

        {/* Wearing the colour the next note will be born with, so the tab
            says what it is about to make. */}
        <button
          type="button"
          className={'chip is-new' + (near === -1 ? ' is-near' : '')}
          data-color={state.nextColor}
          style={{ animationDelay: state.pins.length * 45 + 'ms' }}
          aria-label="Nova nota"
          title="Nova nota"
          // Moving onto this one puts away whatever note was showing: it has
          // none of its own, and a note left open beside it would look like
          // the note this tab is about to write.
          onPointerEnter={() => {
            setNear(-1)
            window.clearTimeout(timer.current)
            send('dock:leave', null)
          }}
          onPointerLeave={leaveChip}
          onClick={addNote}
        >
          <span className="chip-face" />
          <PlusIcon size={15} className="chip-plus" />
        </button>
      </div>
    </div>
  )
}
