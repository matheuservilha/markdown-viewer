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

import { useEffect, useState } from 'react'
import { pinTitle, type Pin } from '~/app/pinned'
import { on, send, type DockState } from '~/platform/channel'
import { PlusIcon } from './icons'

const EMPTY: DockState = {
  pins: [],
  side: 'right',
  theme: 'dark',
  nextColor: 'ambar',
}

export function Dock() {
  const [state, setState] = useState<DockState>(EMPTY)
  /**
   * Which tab the pointer is on, so it can grow to meet it.
   *
   * It arrives as a message rather than from a pointer event of our own. A
   * window is only sent mouse-moved events while its application is the
   * active one, and this one is on top of everybody else's work precisely so
   * that it never has to be: the first click on another app would end the
   * hovering for good. The app's window has the system watch the pointer, and
   * tells us what it saw.
   */
  const [near, setNear] = useState(-1)

  // The app's window may have been running for hours before this one opened,
  // so it asks rather than waiting to be told.
  useEffect(() => {
    const stops = [on('dock:state', setState), on('dock:near', ({ index }) => setNear(index))]
    send('panel:hello', { role: 'dock' })
    return () => {
      for (const stop of stops) stop()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  return (
    <div className="dock" data-side={state.side}>
      <div className="dock-column">
        {state.pins.map((pin: Pin, index) => (
          <button
            key={pin.id}
            type="button"
            className={'chip' + (near === index ? ' is-near' : '')}
            data-color={pin.color}
            // Each square comes in a beat after the one above it, so a column
            // that just gained a note reads as growing rather than blinking.
            style={{ animationDelay: index * 45 + 'ms' }}
            aria-label={pinTitle(pin)}
            onClick={() => send('dock:click', { index })}
            onContextMenu={(event) => {
              event.preventDefault()
              send('dock:menu', { index })
            }}
          >
            <span className="chip-face" />
          </button>
        ))}

        {/* Wearing the colour the next note will be born with, so the tab
            says what it is about to make. */}
        <button
          type="button"
          className={'chip is-new' + (near === state.pins.length ? ' is-near' : '')}
          data-color={state.nextColor}
          style={{ animationDelay: state.pins.length * 45 + 'ms' }}
          aria-label="Nova nota"
          onClick={() => send('dock:new', null)}
        >
          <span className="chip-face">
            <PlusIcon size={14} className="chip-plus" />
          </span>
        </button>
      </div>
    </div>
  )
}
