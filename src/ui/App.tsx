import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '~/app/settings'
import { useWorkspace } from '~/app/store'
import { entryId } from '~/platform/fs'
import { supportsDirectoryPicker } from '~/platform/fs-browser'
import { Breadcrumbs } from './Breadcrumbs'
import { EditorPane } from './EditorPane'
import { FileTree } from './FileTree'
import { MeasureGuides } from './MeasureGuides'
import { SettingsWindow } from './SettingsWindow'
import { StatusBar } from './StatusBar'
import { Tabs } from './Tabs'
import {
  BrandMark,
  EyeIcon,
  FolderPlusIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SunIcon,
} from './icons'
import { useResolvedTheme } from './useTheme'

/** How long the typing has to stop before the file is written. */
const AUTOSAVE_DELAY = 1500

export function App() {
  const { state, actions } = useWorkspace()
  const { settings, update, reset } = useSettings()
  const theme = useResolvedTheme(settings.themeMode)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)

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
      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, state.activeId])

  const dark = theme === 'dark'

  return (
    <div className={'shell' + (sidebarOpen ? '' : ' is-collapsed')}>
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">markdown-viewer</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Esconder a barra lateral"
            title="Esconder a barra lateral"
            onClick={() => setSidebarOpen(false)}
          >
            <SidebarIcon />
          </button>
        </div>

        <button type="button" className="nav-action" onClick={() => void actions.openBase()}>
          <FolderPlusIcon />
          Abrir pasta
        </button>

        {state.bases.length > 0 && (
          <div className="search">
            <SearchIcon size={15} className="search-icon" />
            <input
              className="search-input"
              type="search"
              placeholder="Filtrar arquivos"
              value={state.filter}
              onChange={(event) => actions.setFilter(event.target.value)}
            />
          </div>
        )}

        <nav className="tree-scroll" role="tree" aria-label="Arquivos">
          {state.bases.map((base) => (
            <section className="tree-section" key={base.id}>
              <h2 className="section-label" title={base.label}>
                {base.name}
              </h2>
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

        <div className="sidebar-foot">
          <div className="accent-rule" />
          {state.bases.length > 0 && (
            <button
              type="button"
              className="foot-row"
              aria-pressed={showAllFiles}
              onClick={() => setShowAllFiles((shown) => !shown)}
            >
              <EyeIcon size={16} />
              <span className="foot-label">Outros arquivos</span>
              <span className="switch" data-on={showAllFiles} />
            </button>
          )}
          <button
            type="button"
            className="foot-row"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SettingsIcon size={16} />
            <span className="foot-label">Ajustes</span>
            <kbd className="foot-key">⌘,</kbd>
          </button>
          <button
            type="button"
            className="foot-row"
            aria-pressed={dark}
            onClick={() => update('themeMode', dark ? 'light' : 'dark')}
          >
            {dark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
            <span className="foot-label">Modo escuro</span>
            <span className="switch" data-on={dark} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <Tabs
          state={state}
          onActivate={actions.activateTab}
          onPin={actions.pinTab}
          onClose={actions.closeTab}
        />

        {/* The bar stays up whenever there is something for it to carry, which
            includes the only way back from a collapsed sidebar. */}
        {(activeTab || !sidebarOpen) && (
          <header className="topbar">
            {!sidebarOpen && (
              <button
                type="button"
                className="icon-button"
                aria-label="Mostrar a barra lateral"
                title="Mostrar a barra lateral (⌘\)"
                onClick={() => setSidebarOpen(true)}
              >
                <SidebarIcon />
              </button>
            )}
            {activeTab ? (
              <Breadcrumbs
                tab={activeTab}
                base={state.bases.find((base) => base.id === activeTab.baseId)}
              />
            ) : (
              <span className="crumbs" />
            )}
            {activeDoc && (
              <span className="save-state" data-state={activeDoc.dirty ? 'dirty' : 'saved'}>
                <span className="save-dot" />
                {activeDoc.dirty ? 'Não salvo' : 'Salvo'}
              </span>
            )}
          </header>
        )}

        {activeTab && activeDoc ? (
          <>
            <EditorPane
              key={activeTab.id}
              tab={activeTab}
              doc={activeDoc}
              readOnly={activeDoc.shape.lossy || settings.readOnly}
              onChange={(text) => actions.edit(activeTab.id, text)}
              onSave={saveActive}
            />
          </>
        ) : (
          <EmptyState hasBase={state.bases.length > 0} onOpenBase={() => void actions.openBase()} />
        )}

        <StatusBar
          tab={activeTab}
          doc={activeDoc}
          onSave={saveActive}
          onReload={() => state.activeId && void actions.reload(state.activeId)}
        />
      </main>

      {settingsOpen && (
        <SettingsWindow
          settings={settings}
          update={update}
          reset={reset}
          onClose={() => setSettingsOpen(false)}
          onMeasureFocus={setMeasuring}
        />
      )}

      <MeasureGuides active={measuring && activeTab !== null} />

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

interface EmptyStateProps {
  hasBase: boolean
  onOpenBase: () => void
}

function EmptyState({ hasBase, onOpenBase }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-card">
        <p className="empty-title">{hasBase ? 'Nenhum arquivo aberto' : 'Nenhuma pasta aberta'}</p>
        <p className="empty-hint">
          {hasBase
            ? 'Um clique abre em prévia, dois cliques fixam a aba.'
            : 'Abra uma pasta para começar. Nada é copiado, os arquivos ficam onde estão.'}
        </p>
        {!hasBase && (
          <button type="button" className="empty-action" onClick={onOpenBase}>
            Abrir pasta
          </button>
        )}
        {!hasBase && !supportsDirectoryPicker() && (
          <p className="empty-warn">
            Este navegador não abre uma pasta inteira. Use um navegador Chromium ou o app de
            desktop.
          </p>
        )}
      </div>
    </div>
  )
}
