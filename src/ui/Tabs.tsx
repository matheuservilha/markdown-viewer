import type { State } from '~/app/store'

interface Props {
  state: State
  onActivate: (id: string) => void
  onPin: (id: string) => void
  onClose: (id: string) => void
}

export function Tabs({ state, onActivate, onPin, onClose }: Props) {
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
              (tab.preview ? ' is-preview' : '')
            }
            title={tab.path}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onPin(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onActivate(tab.id)
            }}
          >
            <span className="tab-name">{tab.name}</span>
            <button
              type="button"
              className={'tab-close' + (dirty ? ' is-dirty' : '')}
              aria-label={dirty ? 'Fechar sem salvar ' + tab.name : 'Fechar ' + tab.name}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
            >
              {dirty ? '●' : '×'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
