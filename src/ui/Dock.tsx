/**
 * The dock: the pinned notes, on the edge of the screen, over everything.
 *
 * It owns nothing. The list, the colours and the order all arrive from the
 * app's window, and everything the pointer does here leaves as a message. What
 * this file decides is only what a panel on the edge of a screen has to decide
 * for itself: how tall it wants to be, and whether it is rolled up.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { DOCK_WIDTH, RAIL_WIDTH } from '~/app/dock-layout'
import { PIN_COLORS, pinTitle, type Pin, type PinColor } from '~/app/pinned'
import { on, send, type DockState } from '~/platform/channel'
import { showMainWindow } from '~/platform/panels'
import { BrandMark, OpenInAppIcon, MoreIcon, PlusIcon, UnpinIcon } from './icons'

/**
 * How long the pointer has to rest on the edge before the list opens.
 *
 * Long enough that crossing the edge of the screen on the way to something
 * else does not throw the list open, and short enough that reaching for the
 * list does not feel like waiting for it. Under about 30ms the first is lost;
 * over about 120ms the second is.
 */
const EXPAND_DELAY = 45
/** How long the pointer has to rest on a row before its note floats out. */
const PEEK_DELAY = 110

const EMPTY: DockState = {
  pins: [],
  side: 'right',
  autoCollapse: true,
  theme: 'dark',
  dirty: [],
  stuck: null,
}

export function Dock() {
  const [state, setState] = useState<DockState>(EMPTY)
  /** Whether the pointer has asked for the list. Not the same as showing it. */
  const [reaching, setReaching] = useState(false)
  const [rowMenu, setRowMenu] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  /** The wait before the list opens, and the wait before a note floats out. */
  const timer = useRef(0)
  const hover = useRef(0)

  /**
   * Whether the list is open, which is three things at once: the pointer is
   * here, a note is fixed open beside a row, or rolling up was turned off.
   * Working it out while rendering rather than storing it is what keeps those
   * three from arguing.
   */
  const expanded = reaching || state.stuck !== null || !state.autoCollapse
  /** A note that goes away takes its open row with it. */
  const openRow = state.pins.some((pin) => pin.id === rowMenu) ? rowMenu : null

  // The app's window may have been running for hours before this panel opened,
  // so the panel asks rather than waiting to be told.
  useEffect(() => {
    const stops = [
      on('dock:state', setState),
      // The app's window is what notices the pointer leaving, because this one
      // cannot: a panel that is always on top and was never clicked is not the
      // active window, and is not reliably told that the pointer went away.
      on('dock:away', () => {
        window.clearTimeout(timer.current)
        window.clearTimeout(hover.current)
        setReaching(false)
        setRowMenu(null)
      }),
    ]
    send('panel:hello', { role: 'dock' })
    return () => {
      for (const stop of stops) stop()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  /**
   * How tall the dock wants to be. It is measured rather than counted, so a
   * name that wraps to two lines is a row that is two lines tall and a dock
   * that is that much taller.
   *
   * What is measured is a box that is never stretched to the window, which is
   * what keeps this from chasing its own tail: the app's window is free to
   * give us less height than we asked for, and a box that had been stretched
   * would then report the smaller height and shrink again on every pass.
   *
   * It is also never stretched sideways. The list is laid out at its open
   * width even while the window is still the width of the rail, so the height
   * measured on the way open is the height the list will actually have.
   */
  const report = useCallback((open: boolean) => {
    const height = card.current?.scrollHeight ?? 0
    if (height > 0) send('dock:size', { expanded: open, height })
  }, [])

  useLayoutEffect(() => {
    report(expanded)
    const element = card.current
    if (!element || typeof ResizeObserver === 'undefined') return
    // A row that wraps to two lines, a note added, a menu opened inside a row:
    // all of them are the content changing size, and the observer is what
    // notices every one of them without a list of causes to keep up to date.
    const observer = new ResizeObserver(() => report(expanded))
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded, report])

  /**
   * Opening and closing on the pointer, with a wait at each end.
   *
   * Without the wait on the way in, crossing the edge of the screen on the way
   * to something else throws the list open. Without the longer wait on the way
   * out, the gap between the dock and the note beside it closes the list while
   * the pointer is still travelling across it.
   */
  const schedule = useCallback((open: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setReaching(open), delay)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onEnter = () => {
    schedule(true, EXPAND_DELAY)
    send('dock:enter', null)
  }

  /** The note that floats out beside the row the pointer is resting on. */
  const peekOn = (pin: Pin, element: HTMLElement) => {
    window.clearTimeout(hover.current)
    const box = element.getBoundingClientRect()
    const y = box.top + box.height / 2
    hover.current = window.setTimeout(() => send('dock:hover', { id: pin.id, y }), PEEK_DELAY)
  }

  const click = (pin: Pin, element: HTMLElement) => {
    window.clearTimeout(hover.current)
    const box = element.getBoundingClientRect()
    send('dock:click', { id: pin.id, y: box.top + box.height / 2 })
  }

  const move = (id: string, by: number) => {
    const order = state.pins.map((pin) => pin.id)
    const at = order.indexOf(id)
    const to = at + by
    if (at < 0 || to < 0 || to >= order.length) return
    order.splice(to, 0, ...order.splice(at, 1))
    send('dock:reorder', { ids: order })
  }

  const rolled = !expanded && state.autoCollapse

  return (
    <div
      className="dock"
      data-side={state.side}
      data-expanded={expanded}
      style={
        {
          '--dock-width': DOCK_WIDTH + 'px',
          '--rail-width': RAIL_WIDTH + 'px',
        } as CSSProperties
      }
      onPointerEnter={onEnter}
    >
      <div className="dock-fit" ref={card}>
        {rolled ? (
          <div className="dock-rail" aria-hidden="true">
            {state.pins.length === 0 ? (
              <span className="dock-rail-empty" />
            ) : (
              state.pins.map((pin) => (
                <span
                  key={pin.id}
                  className={'dock-dash' + (state.dirty.includes(pin.id) ? ' is-dirty' : '')}
                  data-color={pin.color}
                />
              ))
            )}
          </div>
        ) : (
          <div className="dock-card">
            <div className="dock-head">
              <button
                type="button"
                className="dock-brand"
                title="Abrir o markdown-viewer"
                aria-label="Abrir o markdown-viewer"
                onClick={() => void showMainWindow()}
              >
                <BrandMark size={16} />
              </button>
              <span className="dock-title">Notas</span>
              <button
                type="button"
                className="icon-button is-small"
                title="Nova nota"
                aria-label="Nova nota"
                onClick={() => send('dock:new', null)}
              >
                <PlusIcon size={16} />
              </button>
            </div>

            {state.pins.length === 0 ? (
              <p className="dock-empty">
                Nada fixado ainda. O <strong>+</strong> escreve uma nota aqui mesmo, e o alfinete do
                app traz para cá um arquivo que já existe.
              </p>
            ) : (
              <ul className="dock-list">
                {state.pins.map((pin, index) => (
                  <li key={pin.id} className="dock-item">
                    <div
                      className={
                        'dock-row' +
                        (state.stuck === pin.id ? ' is-stuck' : '') +
                        (state.dirty.includes(pin.id) ? ' is-dirty' : '')
                      }
                      data-color={pin.color}
                      role="button"
                      tabIndex={0}
                      title={pin.label ?? pin.path}
                      onPointerEnter={(event) => peekOn(pin, event.currentTarget)}
                      onClick={(event) => click(pin, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') click(pin, event.currentTarget)
                      }}
                    >
                      <span className="dock-colour" />
                      <span className="dock-name">{pinTitle(pin)}</span>
                      <span className="dock-dot" aria-label="Não salvo" />
                      <button
                        type="button"
                        className="icon-button is-small dock-more"
                        aria-label={'Ações de ' + pinTitle(pin)}
                        aria-expanded={openRow === pin.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          setRowMenu((current) => (current === pin.id ? null : pin.id))
                        }}
                      >
                        <MoreIcon size={15} />
                      </button>
                    </div>

                    {/* The actions open inside the row and not over it: a window
                      this narrow has nowhere to float a menu, and anything
                      drawn past its edge is simply cut off by the system. */}
                    {openRow === pin.id && (
                      <div className="dock-actions">
                        <div className="dock-swatches" role="group" aria-label="Cor">
                          {PIN_COLORS.map((color: PinColor) => (
                            <button
                              key={color}
                              type="button"
                              className="dock-swatch"
                              data-color={color}
                              aria-label={color}
                              aria-pressed={pin.color === color}
                              onClick={() => send('dock:recolour', { id: pin.id, color })}
                            />
                          ))}
                        </div>
                        <div className="dock-action-row">
                          <button
                            type="button"
                            className="dock-action"
                            onClick={() => send('note:open-in-app', { id: pin.id })}
                          >
                            <OpenInAppIcon size={15} />
                            Abrir no app
                          </button>
                          <button
                            type="button"
                            className="icon-button is-small"
                            aria-label="Subir"
                            title="Subir"
                            disabled={index === 0}
                            onClick={() => move(pin.id, -1)}
                          >
                            <span className="dock-arrow">↑</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button is-small"
                            aria-label="Descer"
                            title="Descer"
                            disabled={index === state.pins.length - 1}
                            onClick={() => move(pin.id, 1)}
                          >
                            <span className="dock-arrow">↓</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button is-small is-danger"
                            aria-label="Desafixar"
                            title="Desafixar"
                            onClick={() => send('dock:unpin', { id: pin.id })}
                          >
                            <UnpinIcon size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
