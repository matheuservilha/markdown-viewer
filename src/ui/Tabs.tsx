import { memo } from 'react'
import type { State } from '~/app/store'
import { CloseIcon } from './icons'

interface Props {
  state: State
  onActivate: (id: string) => void
  onPin: (id: string) => void
  onClose: (id: string) => void
}

export const Tabs = memo(function Tabs({ state, onActivate, onPin, onClose }: Props) {
  if (state.tabs.length === 0) return null

  return (
    <div className="tabs" role="tablist">
      {state.tabs.map((tab) => {
        const dirty = state.docs[tab.id]?.dirty === true
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={state.activeId === tab.id}
            tabIndex={0}
            className={
              'tab' +
              (state.activeId === tab.id ? ' is-active' : '') +
              (tab.preview ? ' is-preview' : '') +
              (dirty ? ' is-dirty' : '')
            }
            title={tab.label ?? tab.path}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onPin(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onActivate(tab.id)
            }}
          >
            <span className="tab-name">{tab.name}</span>
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
