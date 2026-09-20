import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadSession, saveSession, type Session, type ViewState } from '~/app/session'
import { useSettings } from '~/app/settings'
import { useWorkspace, type Doc, type Tab } from '~/app/store'
import { entryId, parentPath, type Entry } from '~/platform/fs'
import type { Heading } from '~/editor/outline'
import { EditorView } from '@codemirror/view'
import { exportDocument } from '~/editor/export-html'
import { exportPdf } from '~/editor/export-pdf'
import { fileSystem, platform } from '~/platform'
import { supportsDirectoryPicker } from '~/platform/fs-browser'
import { Breadcrumbs } from './Breadcrumbs'
import { EditorPane } from './EditorPane'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { FileTree, type TreeData, type TreeHandlers } from './FileTree'
import { InfoPanel } from './InfoPanel'
import { MeasureGuides } from './MeasureGuides'
import { Recents } from './Recents'
import { SettingsWindow } from './SettingsWindow'
import { SidebarResizer } from './SidebarResizer'
import { canPrint, printHtml } from './print'
import { StatusBar } from './StatusBar'
import { Tabs } from './Tabs'
import {
  AlertIcon,
  BrandMark,
  CollapseIcon,
  CrosshairIcon,
  EyeIcon,
  FilePlusIcon,
  FolderPlusIcon,
  MoreIcon,
  PanelRightIcon,
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
  const [sidebarOpen, setSidebarOpen] = useState(() => loadSession()?.sidebarOpen ?? true)
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null)
  const restore = actions.restoreSession
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const editor = useRef<EditorView | null>(null)

  // Only the four slices the tree reads, so that typing in a document does not
  // invalidate it.
  const treeData: TreeData = useMemo(
    () => ({
      children: state.children,
      expanded: state.expanded,
      activeId: state.activeId,
      filter: state.filter,
    }),
    [state.children, state.expanded, state.activeId, state.filter],
  )

  /**
   * Cursor and scroll per file. It is a reference and not state because nothing
   * on screen depends on it: it exists only to be written into the session.
   */
  const views = useRef<Record<string, ViewState>>({})

  const toggleFolder = useCallback((entry: Entry) => void actions.toggleFolder(entry), [actions])
  const openFile = useCallback(
    (entry: Entry, preview: boolean) => void actions.openFile(entry, preview),
    [actions],
  )

  /**
   * Creating something drops it straight into rename mode, because the name a
   * file is born with is never the one it should keep.
   */
  const createIn = useCallback(
    async (baseId: string, parent: string, kind: 'file' | 'folder') => {
      await actions.expandFolder(baseId, parent)
      const entry = await actions.createEntry(baseId, parent, kind)
      if (!entry) return
      if (kind === 'file') void actions.openFile(entry, false)
      setRenamingId(entry.id)
    },
    [actions],
  )

  const menuItems = useCallback(
    (entry: Entry): MenuItem[] => {
      const files = fileSystem()
      const parent = entry.kind === 'directory' ? entry.path : parentPath(entry.path)
      const copy = (text: string) => void navigator.clipboard.writeText(text)

      return [
        { label: 'Novo arquivo', onSelect: () => void createIn(entry.baseId, parent, 'file') },
        { label: 'Nova pasta', onSelect: () => void createIn(entry.baseId, parent, 'folder') },
        {
          label: 'Renomear',
          hint: 'F2',
          separated: true,
          onSelect: () => setRenamingId(entry.id),
        },
        {
          label: 'Duplicar',
          disabled: entry.kind === 'directory',
          onSelect: () => void actions.duplicateEntry(entry),
        },
        {
          label: 'Copiar caminho',
          separated: true,
          disabled: !files.can.absolutePath,
          onSelect: () => copy(files.absolutePath(entry.baseId, entry.path) ?? entry.path),
        },
        { label: 'Copiar caminho relativo', onSelect: () => copy(entry.path) },
        ...(files.can.reveal
          ? [
              {
                label: 'Revelar no Finder',
                onSelect: () => void actions.revealEntry(entry),
              },
            ]
          : []),
        {
          label: 'Mover para a lixeira',
          hint: '⌘⌫',
          separated: true,
          destructive: true,
          disabled: !files.can.trash,
          onSelect: () => void actions.trashEntry(entry),
        },
      ]
    },
    [actions, createIn],
  )

  const tree: TreeHandlers = useMemo(
    () => ({
      onToggleFolder: toggleFolder,
      onOpenFile: openFile,
      onContextMenu: (entry, x, y) => setMenu({ items: menuItems(entry), x, y }),
      onStartRename: (entry) => setRenamingId(entry.id),
      onRename: (entry, name) => {
        setRenamingId(null)
        void actions.renameEntry(entry, name)
      },
      onCancelRename: () => setRenamingId(null),
      onTrash: (entry) => void actions.trashEntry(entry),
    }),
    [actions, menuItems, openFile, toggleFolder],
  )

  /**
   * What can be done with the file that is open. The export runs from the text
   * in memory rather than from disk, so what leaves is what is on screen, even
   * before autosave has caught up.
   */
  const documentMenu = useCallback((): MenuItem[] => {
    const tab = latestTab.current
    const doc = tab ? latestDoc.current : null
    if (!tab || !doc) return []

    const files = fileSystem()
    const source = { baseId: tab.baseId, path: tab.path }
    const entry: Entry = {
      id: tab.id,
      baseId: tab.baseId,
      path: tab.path,
      name: tab.name,
      kind: 'file' as const,
    }
    const copy = (text: string) => void navigator.clipboard.writeText(text)
    const stem = tab.name.replace(/\.[^.]+$/, '')
    const html = (palette: 'auto' | 'light') =>
      exportDocument(stem, doc.text, source, { theme: palette })

    return [
      {
        label: 'Exportar HTML',
        onSelect: () => {
          void html('auto').then((page) =>
            files.saveAs(stem + '.html', new TextEncoder().encode(page)),
          )
        },
      },
      {
        // Laid out from the syntax tree rather than photographed from a web
        // page, so the text in the file is text: selectable, searchable, and
        // never cut in half by a page break.
        label: 'Exportar PDF',
        hint: '⌘P',
        onSelect: () => {
          setBusy('Gerando o PDF')
          void exportPdf(stem, doc.text, source)
            .then((bytes) => files.saveAs(stem + '.pdf', bytes))
            .catch((error: unknown) =>
              setNotice(error instanceof Error ? error.message : String(error)),
            )
            .finally(() => setBusy(null))
        },
      },
      ...(canPrint()
        ? [{ label: 'Imprimir', onSelect: () => void html('light').then(printHtml) }]
        : []),
      {
        label: 'Copiar caminho',
        separated: true,
        disabled: !files.can.absolutePath,
        onSelect: () => copy(tab.label ?? files.absolutePath(tab.baseId, tab.path) ?? tab.path),
      },
      { label: 'Copiar caminho relativo', onSelect: () => copy(tab.path) },
      ...(files.can.reveal
        ? [{ label: 'Revelar no Finder', onSelect: () => void actions.revealEntry(entry) }]
        : []),
    ]
  }, [actions])

  /** Opens every folder down to the file that is on screen, and scrolls to it. */
  const revealActive = useCallback(async () => {
    const tab = latestTab.current
    if (!tab) return
    await actions.revealPath(tab.baseId, tab.path)
    requestAnimationFrame(() => {
      document
        .querySelector('.tree-row.is-active')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [actions])

  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) ?? null
  const activeDoc = state.activeId ? (state.docs[state.activeId] ?? null) : null
  // Read from callbacks that must not change identity on every keystroke. The
  // assignment happens after the commit, which is the only moment React allows
  // a ref to be written.
  const latestTab = useRef<Tab | null>(null)
  const latestDoc = useRef<Doc | null>(null)
  useEffect(() => {
    // React allows writing a ref from an effect; the rule does not tell that
    // apart from writing one while rendering, which is the real hazard.
    // oxlint-disable-next-line immutability
    latestTab.current = activeTab
    // oxlint-disable-next-line immutability
    latestDoc.current = activeDoc
  })

  // Reopen last session once, before anything else touches the workspace.
  const previous = useRef<Session | null>(null)
  const restoreStarted = useRef(false)
  useEffect(() => {
    // Development runs effects twice, and reopening a session is not something
    // to do twice.
    if (restoreStarted.current) return
    restoreStarted.current = true

    const session = loadSession()
    if (!session) return
    previous.current = session
    views.current = Object.fromEntries(
      session.tabs.flatMap((tab) => (tab.view ? [[tab.id, tab.view]] : [])),
    )
    void restore(session, false)
  }, [restore])

  /**
   * Whatever could not be reopened is carried over untouched. Without this, a
   * folder waiting for the person to grant permission again would be erased
   * from the session by the first save, and the offer to reopen it would have
   * nothing left to reopen.
   */
  const persist = useCallback(() => {
    const kept = previous.current
    const waiting = new Set(state.pending)
    const heldTabs = kept ? kept.tabs.filter((tab) => waiting.has(tab.baseId)) : []
    const heldBases = kept ? kept.bases.filter((id) => waiting.has(id)) : []
    const heldFiles = kept ? kept.files.filter((id) => waiting.has(id)) : []
    const heldFolders = kept
      ? kept.expanded.filter((id) => waiting.has(id.slice(0, id.indexOf(':'))))
      : []

    saveSession({
      version: 1,
      bases: [...heldBases, ...state.bases.map((base) => base.id)],
      files: [
        ...heldFiles,
        ...state.tabs.filter((tab) => tab.label !== undefined).map((tab) => tab.baseId),
      ],
      expanded: [...heldFolders, ...Object.keys(state.expanded).filter((id) => state.expanded[id])],
      tabs: [
        ...heldTabs,
        ...state.tabs.map((tab) => ({
          id: tab.id,
          baseId: tab.baseId,
          path: tab.path,
          name: tab.name,
          preview: tab.preview,
          ...(tab.label === undefined ? {} : { label: tab.label }),
          ...(views.current[tab.id] ? { view: views.current[tab.id] } : {}),
        })),
      ],
      activeId: state.activeId ?? kept?.activeId ?? null,
      sidebarOpen,
    })
  }, [state.bases, state.tabs, state.expanded, state.activeId, state.pending, sidebarOpen])

  // Writing the session costs a few hundred bytes of ids and paths, so it is
  // written on every change rather than on the way out.
  useEffect(() => {
    if (!state.restored && state.bases.length === 0 && state.tabs.length === 0) return
    persist()
  }, [persist, state.restored, state.bases.length, state.tabs.length])

  const saveActive = useCallback(() => {
    if (state.activeId) void actions.save(state.activeId)
  }, [actions, state.activeId])

  // Autosave: a short pause in the typing writes the file.
  useEffect(() => {
    // The text is read so that every keystroke restarts the wait: that is the
    // whole point of the delay, not an accident of the dependency list.
    if (!activeDoc) return
    const { text, dirty, conflict } = activeDoc
    if (text === undefined || !dirty || conflict) return
    const timer = window.setTimeout(saveActive, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [activeDoc, saveActive])

  /**
   * Noticing what changed behind our back. Three ways, because no single one
   * covers every platform: the desktop watcher, the moment the window comes
   * back, and a slow poll for the browser, which has no watcher at all.
   */
  const POLL = 4000
  const openBases = state.bases.map((base) => base.id).join(',')
  useEffect(() => {
    const check = () => void actions.checkExternalChanges()
    // Read so the watchers are set up again whenever a folder is opened.
    const stop = openBases === '' ? () => {} : actions.watchBases(check)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, POLL)
    return () => {
      stop()
      window.clearInterval(timer)
    }
  }, [actions, openBases])

  // Reading each folder once, to learn what links to what.
  useEffect(() => {
    for (const id of openBases.split(',')) {
      if (id !== '' && !state.index[id]) void actions.indexBase(id)
    }
  }, [actions, openBases, state.index])

  // Saving on blur, and looking for changes made behind our back on focus.
  useEffect(() => {
    const onBlur = () => saveActive()
    const onFocus = () => void actions.checkExternalChanges()
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [actions, saveActive])

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
      if (event.key === 'p' && state.activeId) {
        // The browser would otherwise print the interface itself.
        event.preventDefault()
        const item = documentMenu().find((entry) => entry.label.startsWith('Imprimir'))
        item?.onSelect()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, documentMenu, state.activeId])

  const dark = theme === 'dark'

  return (
    <div className={'shell' + (sidebarOpen ? '' : ' is-collapsed')}>
      <aside className="sidebar">
        <div className="brand" data-tauri-drag-region>
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

        <div className="nav-actions">
          <button type="button" className="nav-action" onClick={() => void actions.openBase()}>
            <FolderPlusIcon />
            Abrir pasta
          </button>
          <button type="button" className="nav-action" onClick={() => void actions.openLooseFile()}>
            <FilePlusIcon />
            Abrir arquivo
          </button>
        </div>

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

        {state.pending.length > 0 && (
          <button
            type="button"
            className="nav-notice"
            onClick={() => {
              const session = loadSession()
              if (session) void actions.restoreSession(session, true)
            }}
          >
            <AlertIcon size={15} />
            <span>
              Reabrir a sessão anterior
              <span className="nav-notice-hint">
                {state.pending.length === 1
                  ? 'o navegador precisa da sua permissão de novo'
                  : state.pending.length + ' pastas precisam da sua permissão de novo'}
              </span>
            </span>
          </button>
        )}

        <nav className="tree-scroll" role="tree" aria-label="Arquivos">
          <Recents
            recents={state.recents}
            openBases={state.bases.map((base) => base.id)}
            onOpenFile={(file) => void actions.openRecentFile(file)}
            onOpenBase={(base) => void actions.openRecentBase(base)}
            onClear={actions.forgetRecents}
          />

          {state.bases.map((base) => (
            <section className="tree-section" key={base.id}>
              <div className="section-head">
                <h2 className="section-label" title={base.label}>
                  {base.name}
                </h2>
                <div className="section-actions">
                  <button
                    type="button"
                    className="icon-button is-small"
                    aria-label="Novo arquivo"
                    title="Novo arquivo"
                    onClick={() => void createIn(base.id, '', 'file')}
                  >
                    <FilePlusIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button is-small"
                    aria-label="Nova pasta"
                    title="Nova pasta"
                    onClick={() => void createIn(base.id, '', 'folder')}
                  >
                    <FolderPlusIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button is-small"
                    aria-label="Revelar o arquivo aberto"
                    title="Revelar o arquivo aberto"
                    onClick={() => void revealActive()}
                  >
                    <CrosshairIcon size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button is-small"
                    aria-label="Recolher tudo"
                    title="Recolher tudo"
                    onClick={actions.collapseAll}
                  >
                    <CollapseIcon size={17} />
                  </button>
                </div>
              </div>
              <FileTree
                data={treeData}
                parentId={entryId(base.id, '')}
                depth={0}
                showAllFiles={showAllFiles}
                renamingId={renamingId}
                {...tree}
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

      {sidebarOpen && (
        <SidebarResizer
          width={settings.sidebarWidth}
          onCommit={(width) => update('sidebarWidth', width)}
        />
      )}

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
          <header className="topbar" data-tauri-drag-region>
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
            {activeDoc && (
              <button
                type="button"
                className={'icon-button' + (settings.infoPanel ? ' is-on' : '')}
                aria-label="Sumário e links"
                title="Sumário e links"
                aria-pressed={settings.infoPanel}
                onClick={() => update('infoPanel', !settings.infoPanel)}
              >
                <PanelRightIcon size={16} />
              </button>
            )}
            {activeDoc && (
              <button
                type="button"
                className="icon-button"
                aria-label="Ações do documento"
                title="Ações do documento"
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect()
                  setMenu({ items: documentMenu(), x: box.right - 4, y: box.bottom + 4 })
                }}
              >
                <MoreIcon size={16} />
              </button>
            )}
          </header>
        )}

        {activeTab && activeDoc ? (
          <>
            <div className="workspace-body">
              <EditorPane
                key={activeTab.id}
                tab={activeTab}
                doc={activeDoc}
                readOnly={activeDoc.shape.lossy || settings.readOnly}
                getInitialView={() => views.current[activeTab.id]}
                onViewChange={(view) => {
                  views.current = { ...views.current, [activeTab.id]: view }
                  persist()
                }}
                onChange={(text) => actions.edit(activeTab.id, text)}
                onSave={saveActive}
                onOutline={setHeadings}
                onReady={(view) => {
                  editor.current = view
                }}
              />
              {settings.infoPanel && (
                <InfoPanel
                  tab={activeTab}
                  headings={headings}
                  index={state.index[activeTab.baseId]}
                  onGoTo={(position) => {
                    const view = editor.current
                    if (!view) return
                    view.dispatch({
                      selection: { anchor: position },
                      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 24 }),
                    })
                    view.focus()
                  }}
                  onOpenPath={(baseId, path) =>
                    void actions.openRecentFile({
                      baseId,
                      path,
                      name: path.slice(path.lastIndexOf('/') + 1),
                      at: Date.now(),
                    })
                  }
                />
              )}
            </div>
          </>
        ) : (
          <EmptyState
            hasBase={state.bases.length > 0}
            onOpenBase={() => void actions.openBase()}
            onOpenFile={() => void actions.openLooseFile()}
          />
        )}

        <StatusBar
          tab={activeTab}
          doc={activeDoc}
          onSave={saveActive}
          onReload={() => state.activeId && void actions.reload(state.activeId)}
        />
      </main>

      {busy && (
        <div className="toast is-busy" role="status">
          <span className="busy-dot" />
          {busy}
        </div>
      )}

      {notice && (
        <div className="toast" role="alert">
          {notice}
          <button type="button" onClick={() => setNotice(null)}>
            fechar
          </button>
        </div>
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}

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
  onOpenFile: () => void
}

function EmptyState({ hasBase, onOpenBase, onOpenFile }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-card">
        <p className="empty-title">{hasBase ? 'Nenhum arquivo aberto' : 'Nenhuma pasta aberta'}</p>
        <p className="empty-hint">
          {hasBase
            ? 'Um clique abre em prévia, dois cliques fixam a aba.'
            : 'Abra uma pasta, ou um arquivo de qualquer lugar do disco. Nada é copiado, os arquivos ficam onde estão.'}
        </p>
        {!hasBase && (
          <div className="empty-actions">
            <button type="button" className="empty-action" onClick={onOpenBase}>
              Abrir pasta
            </button>
            <button type="button" className="empty-action is-quiet" onClick={onOpenFile}>
              Abrir arquivo
            </button>
          </div>
        )}
        {!hasBase && platform() === 'browser' && !supportsDirectoryPicker() && (
          <p className="empty-warn">
            Este navegador não abre uma pasta inteira. Use um navegador Chromium ou o app de
            desktop.
          </p>
        )}
      </div>
    </div>
  )
}
