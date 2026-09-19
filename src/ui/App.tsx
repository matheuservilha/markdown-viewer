import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from '~/app/store'
import { entryId } from '~/platform/fs'
import { supportsDirectoryPicker } from '~/platform/fs-browser'
import { Breadcrumbs } from './Breadcrumbs'
import { EditorPane } from './EditorPane'
import { FileTree } from './FileTree'
import { StatusBar } from './StatusBar'
import { Tabs } from './Tabs'
import { useTheme } from './useTheme'

/** How long the typing has to stop before the file is written. */
const AUTOSAVE_DELAY = 1500

export function App() {
  const { state, actions } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showAllFiles, setShowAllFiles] = useState(false)

  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) ?? null
  const activeDoc = state.activeId ? (state.docs[state.activeId] ?? null) : null

  const saveActive = useCallback(() => {
    if (state.activeId) void actions.save(state.activeId)
  }, [actions, state.activeId])

  // Autosave: a short pause in the typing writes the file.
  const saveRef = useRef(saveActive)
  saveRef.current = saveActive
  useEffect(() => {
    if (!activeDoc?.dirty || activeDoc.conflict) return
    const timer = window.setTimeout(() => saveRef.current(), AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [activeDoc?.text, activeDoc?.dirty, activeDoc?.conflict])

  // Saving on blur, and looking for changes made behind our back on focus.
  useEffect(() => {
    const onBlur = () => saveRef.current()
    const onFocus = () => void actions.checkExternalChanges()
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [actions])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key === '\\') {
        event.preventDefault()
        setSidebarOpen((open) => !open)
      }
      if (event.key === 'w' && state.activeId) {
        event.preventDefault()
        actions.closeTab(state.activeId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, state.activeId])

  return (
    <div className={'shell' + (sidebarOpen ? '' : ' is-collapsed')}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <button type="button" className="button" onClick={() => void actions.openBase()}>
            Abrir pasta
          </button>
          <button
            type="button"
            className="button is-quiet"
            aria-label="Alternar tema"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
        </div>

        {state.bases.length > 0 && (
          <input
            className="filter"
            type="search"
            placeholder="Filtrar arquivos"
            value={state.filter}
            onChange={(event) => actions.setFilter(event.target.value)}
          />
        )}

        <nav className="tree-scroll" role="tree" aria-label="Arquivos">
          {state.bases.map((base) => (
            <section key={base.id}>
              <h2 className="base-name">{base.name}</h2>
              <FileTree
                state={state}
                parentId={entryId(base.id, '')}
                depth={0}
                showAllFiles={showAllFiles}
                onToggleFolder={(entry) => void actions.toggleFolder(entry)}
                onOpenFile={(entry, preview) => void actions.openFile(entry, preview)}
              />
            </section>
          ))}
        </nav>

        {state.bases.length > 0 && (
          <label className="sidebar-foot">
            <input
              type="checkbox"
              checked={showAllFiles}
              onChange={(event) => setShowAllFiles(event.target.checked)}
            />
            Mostrar os outros arquivos
          </label>
        )}
      </aside>

      <main className="main">
        <Tabs
          state={state}
          onActivate={actions.activateTab}
          onPin={actions.pinTab}
          onClose={actions.closeTab}
        />

        {activeTab && activeDoc ? (
          <>
            <Breadcrumbs
              tab={activeTab}
              base={state.bases.find((base) => base.id === activeTab.baseId)}
            />
            <EditorPane
              key={activeTab.id}
              tab={activeTab}
              doc={activeDoc}
              onChange={(text) => actions.edit(activeTab.id, text)}
              onSave={saveActive}
            />
          </>
        ) : (
          <EmptyState hasBase={state.bases.length > 0} />
        )}

        <StatusBar
          tab={activeTab}
          doc={activeDoc}
          onSave={saveActive}
          onReload={() => state.activeId && void actions.reload(state.activeId)}
        />
      </main>

      {state.error && (
        <div className="toast" role="alert">
          {state.error}
          <button type="button" onClick={actions.dismissError}>
            fechar
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ hasBase }: { hasBase: boolean }) {
  return (
    <div className="empty">
      <p className="empty-title">{hasBase ? 'Nenhum arquivo aberto' : 'Nenhuma pasta aberta'}</p>
      <p className="empty-hint">
        {hasBase
          ? 'Um clique abre em prévia, dois cliques fixam a aba.'
          : 'Abra uma pasta para começar. Nada é copiado, os arquivos ficam onde estão.'}
      </p>
      {!hasBase && !supportsDirectoryPicker() && (
        <p className="empty-warn">
          Este navegador não abre uma pasta inteira. Use um navegador Chromium ou o app de desktop.
        </p>
      )}
    </div>
  )
}
