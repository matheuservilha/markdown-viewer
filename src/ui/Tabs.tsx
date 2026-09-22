import { memo } from 'react'
import type { State } from '~/app/store'
import { findPin, type Pin } from '~/app/pinned'
import { CloseIcon } from './icons'
import { withoutExtension } from '~/platform/fs'

interface Props {
  state: State
  /** The notes on the edge of the screen, so a tab can wear its note's colour. */
  pins: readonly Pin[]
  onActivate: (id: string) => void
  onPin: (id: string) => void
  onClose: (id: string) => void
}

export const Tabs = memo(function Tabs({ state, pins, onActivate, onPin, onClose }: Props) {
  if (state.tabs.length === 0) return null

  return (
    <div className="tabs" role="tablist">
      {state.tabs.map((tab) => {
        const dirty = state.docs[tab.id]?.dirty === true
        // A tab whose note is on the edge of the screen wears that note's
        // colour, so the strip and the column answer to each other.
        const pin = findPin(pins, tab.id)
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={state.activeId === tab.id}
            tabIndex={0}
            data-color={pin?.color}
            className={
              'tab' +
              (state.activeId === tab.id ? ' is-active' : '') +
              (tab.preview ? ' is-preview' : '') +
              (dirty ? ' is-dirty' : '') +
              (pin ? ' is-pinned' : '')
            }
            title={tab.label ?? tab.path}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onPin(tab.id)}
            // The middle button closes the tab, the way it does in a browser.
            // The press is caught as well as the release, because otherwise
            // the system starts its own scroll gesture on the way down.
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault()
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return
              event.preventDefault()
              onClose(tab.id)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onActivate(tab.id)
            }}
          >
            {/* The extension says nothing here: every tab in this editor is
                a text file, and the strip is the narrowest place in the
                window. The full path is still on the tab's own tooltip. */}
            <span className="tab-name">{withoutExtension(tab.name)}</span>
            {/* The dot marks unsaved work, and gives way to the close button
                on hover so that a dirty tab is still closable in one click. */}
            <span className="tab-dot" aria-label="Não salvo" />
            <button
              type="button"
              className="tab-close"
              aria-label={'Fechar ' + tab.name}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
})
