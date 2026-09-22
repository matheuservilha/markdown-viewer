import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadSession,
  saveSession,
  type Session,
  type SessionTab,
  type ViewState,
} from '~/app/session'
import {
  DRAFT_BASE,
  isDraft,
  loadDrafts,
  nextDraftName,
  noteTitle,
  saveDrafts,
  type Draft,
} from '~/app/drafts'
import { isDraftPin, isPinned, type Pin, type PinTarget } from '~/app/pinned'
import { useDock } from './useDock'
import { onTrayNewNote } from '~/platform/tray'
import { DEFAULTS, LIMITS, useSettings } from '~/app/settings'
import { useWorkspace, type Doc, type Tab } from '~/app/store'
import { entryId, nativeBaseName, parentPath, type Entry } from '~/platform/fs'
import type { Heading } from '~/editor/outline'
import { EditorView, type Command } from '@codemirror/view'
import { redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import {
  insertLink,
  toggleBold,
  toggleCode,
  toggleHighlight,
  toggleItalic,
  toggleStrike,
  toggleTask,
} from '~/editor/commands'
import { exportDocument } from '~/editor/export-html'
import { exportPdf } from '~/editor/export-pdf'
import { fileSystem, isDesktop, platform } from '~/platform'
import { onOpenedPaths } from '~/platform/opened'
import { supportsDirectoryPicker } from '~/platform/fs-browser'
import { EditorPane } from './EditorPane'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Dialog, type DialogChoice } from './Dialog'
import { SHORTCUTS, keyCap, matchShortcut, onApple } from './shortcuts'
import { installAppMenu, menuPlan, type CommandId } from './app-menu'
import { FileTree, type TreeData, type TreeHandlers } from './FileTree'
import { InfoPanel } from './InfoPanel'
import { MeasureGuides } from './MeasureGuides'
import { centreOf, changeTheme } from './theme-transition'
import { UpdateNotice } from './UpdateNotice'
import { Recents } from './Recents'
import { SettingsWindow } from './SettingsWindow'
import { SidebarResizer } from './SidebarResizer'
import { canPrint, printHtml } from './print'
import { installWindowDrag } from './window-drag'
import { StatusBar } from './StatusBar'
import { Tabs } from './Tabs'
import {
  AlertIcon,
  BrandMark,
  CollapseIcon,
  CrosshairIcon,
  FileIcon,
  FilePlusIcon,
  FolderPlusIcon,
  MoreIcon,
  PanelRightIcon,
  PinIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  ThemeIcon,
  UnpinIcon,
} from './icons'
import { useResolvedTheme } from './useTheme'

/**
 * A tab as the session remembers it. The optional halves are set rather than
 * spread so the shape is written in one place and read in one pass.
 */
function toSessionTab(tab: Tab, view: ViewState | undefined): SessionTab {
  const kept: SessionTab = {
    id: tab.id,
    baseId: tab.baseId,
    path: tab.path,
    name: tab.name,
    preview: tab.preview,
  }
  if (tab.label !== undefined) kept.label = tab.label
  if (view) kept.view = view
  return kept
}

/** How long the typing has to stop before the file is written. */
const AUTOSAVE_DELAY = 1500

export function App() {
  const { state, actions } = useWorkspace()
  const { settings, update, reset } = useSettings()
  const theme = useResolvedTheme(settings.themeMode)
  const [sidebarOpen, setSidebarOpen] = useState(() => loadSession()?.sidebarOpen ?? true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null)
  const restore = actions.restoreSession
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const editor = useRef<EditorView | null>(null)
  /**
   * The pinned list and the way to change it, read from the file tree's menu.
   * That menu is built above the dock host and would drag half the file with
   * it if it were moved below, so it reaches both through a reference.
   */
  const latestPins = useRef<Pin[]>([])
  const togglePinRef = useRef<(target: PinTarget) => void>(() => {})
  const unpinRef = useRef<(id: string) => void>(() => {})

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
        ...(entry.kind === 'file'
          ? [
              {
                label: isPinned(latestPins.current, entry.id)
                  ? 'Desafixar da barra de notas'
                  : 'Fixar na barra de notas',
                separated: true,
                onSelect: () =>
                  togglePinRef.current({
                    id: entry.id,
                    baseId: entry.baseId,
                    path: entry.path,
                    name: entry.name,
                  }),
              },
            ]
          : []),
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
  // The keyboard handler is bound once and has to read the state of the
  // moment the key was pressed, not of the render that bound it.
  const latestState = useRef(state)
  useEffect(() => {
    // React allows writing a ref from an effect; the rule does not tell that
    // apart from writing one while rendering, which is the real hazard.
    // oxlint-disable-next-line immutability
    latestTab.current = activeTab
    // oxlint-disable-next-line immutability
    latestDoc.current = activeDoc
    // oxlint-disable-next-line immutability
    latestState.current = state
  })

  /** The address of a note, the shape both the pin list and the dock use. */
  const pinTargetOf = useCallback(
    (tab: Tab): PinTarget => ({
      id: tab.id,
      baseId: tab.baseId,
      path: tab.path,
      name: tab.name,
      ...(tab.label === undefined ? {} : { label: tab.label }),
    }),
    [],
  )

  /**
   * Which documents have something unwritten in them, as one string so that
   * the list handed to the dock keeps its identity between keystrokes. Without
   * this the dock is sent a fresh copy of itself on every letter typed.
   */
  const dirtyKey = Object.entries(state.docs)
    .filter(([, doc]) => doc.dirty)
    .map(([id]) => id)
    .toSorted()
    .join('\n')
  const dirtyIds = useMemo(() => (dirtyKey === '' ? [] : dirtyKey.split('\n')), [dirtyKey])

  const dock = useDock({
    enabled: settings.dock,
    side: settings.dockSide,
    theme,
    opacity: settings.noteOpacity,
    readOnly: settings.readOnly,
    dirty: dirtyIds,

    draftText: useCallback((pinId: string) => latestState.current.docs[pinId]?.text, []),

    onDraftText: useCallback(
      (pinId: string, next: string) => {
        actions.edit(pinId, next)
        // The tab, the note and the square on the edge of the screen show the
        // same draft, so they answer to the same name: its own first line.
        const tab = latestState.current.tabs.find((one: Tab) => one.id === pinId)
        if (tab) actions.renameTab(pinId, noteTitle(next, tab.name))
      },
      [actions],
    ),

    /**
     * The square at the foot of the column writes an ordinary draft, in an
     * ordinary tab.
     *
     * It is the same note in both places: unsaved in the tab strip and a
     * square on the edge of the screen. Closing the tab throws the text away,
     * so the square goes with it.
     */
    onNewNote: useCallback((): PinTarget | null => {
      const taken = latestState.current.tabs.map((tab: Tab) => tab.name)
      const draft: Draft = {
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
        name: nextDraftName(taken),
        text: '',
        at: Date.now(),
      }
      const id = actions.newNote(draft)
      return { id, baseId: DRAFT_BASE, path: draft.id, name: draft.name }
    }, [actions]),

    onOpenInApp: useCallback(
      (pin: Pin) => {
        // A draft is already a tab; it only has to come to the front.
        if (isDraftPin(pin)) {
          actions.activateTab(pin.id)
          return
        }
        void actions.openRecentFile({
          baseId: pin.baseId,
          path: pin.path,
          name: pin.name,
          ...(pin.label === undefined ? {} : { label: pin.label }),
          at: Date.now(),
        })
      },
      [actions],
    ),
  })

  const { pins } = dock
  const pinnedActive = activeTab !== null && isPinned(pins, activeTab.id)

  useEffect(() => {
    // oxlint-disable-next-line immutability
    latestPins.current = pins
    // oxlint-disable-next-line immutability
    togglePinRef.current = dock.togglePin
    // oxlint-disable-next-line immutability
    unpinRef.current = dock.unpin
  })

  const togglePinActive = useCallback(() => {
    const tab = latestTab.current
    if (!tab) return
    dock.togglePin(pinTargetOf(tab))
  }, [dock, pinTargetOf])

  // A note asked for from the tray, which may have been the only thing on
  // screen for days.
  useEffect(() => onTrayNewNote(() => actions.newNote()), [actions])

  // Dragging the window by its own interface, on the desktop.
  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void installWindowDrag().then((off) => {
      if (cancelled) off()
      else stop = off
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  // Reopen last session once, before anything else touches the workspace.
  const previous = useRef<Session | null>(null)
  const restoreStarted = useRef(false)
  useEffect(() => {
    // Development runs effects twice, and reopening a session is not something
    // to do twice.
    if (restoreStarted.current) return
    restoreStarted.current = true

    // The drafts come back first, and on their own: they have nothing on disk
    // to reopen, so they do not depend on any folder still being reachable.
    for (const draft of loadDrafts()) actions.newNote(draft)

    const session = loadSession()
    if (!session) return
    previous.current = session
    views.current = Object.fromEntries(
      session.tabs.flatMap((tab) => (tab.view ? [[tab.id, tab.view]] : [])),
    )
    void restore(session, false)
    // `actions` is stable and asking for it here would re-run the restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // A draft has nothing on disk to reopen, so it travels in its own
        // store and not in the list of files to read back.
        ...state.tabs
          .filter((tab) => !isDraft(tab))
          .map((tab) => toSessionTab(tab, views.current[tab.id])),
      ],
      activeId: state.activeId ?? kept?.activeId ?? null,
      sidebarOpen,
    })

    // The drafts themselves, text and all, because there is nowhere else they
    // could be read back from.
    saveDrafts(
      state.tabs.filter(isDraft).map((tab) => ({
        id: tab.path,
        name: tab.name,
        text: state.docs[tab.id]?.text ?? '',
        at: Date.now(),
      })),
    )
  }, [
    state.bases,
    state.tabs,
    state.docs,
    state.expanded,
    state.activeId,
    state.pending,
    sidebarOpen,
  ])

  // Writing the session costs a few hundred bytes of ids and paths, so it is
  // written on every change rather than on the way out.
  useEffect(() => {
    if (!state.restored && state.bases.length === 0 && state.tabs.length === 0) return
    persist()
  }, [persist, state.restored, state.bases.length, state.tabs.length])

  const saveActive = useCallback(() => {
    if (state.activeId) void actions.save(state.activeId)
  }, [actions, state.activeId])

  // Autosave: a short pause in the typing writes the file. Off unless it was
  // asked for in the settings, so that by default nothing reaches the disk
  // that the person did not ask to be written.
  useEffect(() => {
    // The text is read so that every keystroke restarts the wait: that is the
    // whole point of the delay, not an accident of the dependency list.
    if (!settings.autosave || !activeDoc) return
    const { text, dirty, conflict } = activeDoc
    if (text === undefined || !dirty || conflict) return
    const timer = window.setTimeout(saveActive, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [activeDoc, saveActive, settings.autosave])

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

  // The window says which file is open, and marks it when there is something
  // unsaved in it.
  useEffect(() => {
    const name = activeTab?.name
    document.title = name ? (activeDoc?.dirty ? '• ' + name : name) : 'markdown-viewer'
  }, [activeTab?.name, activeDoc?.dirty])

  // Files handed over by the system, from a double click in the file manager
  // or from the command line.
  useEffect(() => {
    return onOpenedPaths((paths) => {
      for (const path of paths) {
        // A file opened from outside every folder is its own base, which is
        // the same shape the history uses for a loose file.
        void actions.openRecentFile({
          baseId: path,
          path: '',
          name: nativeBaseName(path),
          label: path,
          at: Date.now(),
        })
      }
    })
  }, [actions])

  // Saving on blur, and looking for changes made behind our back on focus.
  useEffect(() => {
    const onBlur = () => {
      if (settings.autosave) saveActive()
    }
    const onFocus = () => void actions.checkExternalChanges()
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [actions, saveActive, settings.autosave])

  /**
   * Closing a tab that has unsaved text asks first.
   *
   * With the automatic saving off, the text in the editor is the only copy
   * there is, and closing the tab throws it away.
   */
  const closed = useRef<Tab[]>([])
  const [question, setQuestion] = useState<{
    title: string
    body?: string
    choices: DialogChoice[]
  } | null>(null)

  const closeTab = useCallback(
    (id: string) => {
      const tab = latestState.current.tabs.find((candidate: Tab) => candidate.id === id)
      const drop = () => {
        if (tab) closed.current = [tab, ...closed.current].slice(0, 12)
        // A draft only exists in its tab. Closing it throws the text away, and
        // a row on the edge of the screen pointing at nothing is worse than no
        // row at all, so the pin goes with it. A file outlives its tab, and
        // stays pinned.
        if (tab && isDraft(tab)) unpinRef.current(id)
        actions.closeTab(id)
      }
      if (!tab || !latestState.current.docs[id]?.dirty) {
        drop()
        return
      }
      setQuestion({
        title: 'Fechar ' + tab.name + '?',
        body: 'Há alterações que ainda não foram salvas.',
        choices: [
          {
            label: 'Cancelar',
            onSelect: () => setQuestion(null),
          },
          {
            label: 'Fechar sem salvar',
            destructive: true,
            onSelect: () => {
              setQuestion(null)
              drop()
            },
          },
          {
            label: 'Salvar e fechar',
            primary: true,
            onSelect: () => {
              setQuestion(null)
              void actions.save(id).then(() => {
                // A save that did not take, because the file changed on disk
                // or the folder went away, leaves the tab open: closing it now
                // would throw away the text the save failed to write.
                if (!latestState.current.docs[id]?.dirty) drop()
              })
            },
          },
        ],
      })
    },
    [actions],
  )

  const reopenTab = useCallback(() => {
    const [tab, ...rest] = closed.current
    if (!tab) return
    closed.current = rest
    void actions.openFile(
      { id: tab.id, baseId: tab.baseId, path: tab.path, name: tab.name } as Entry,
      false,
    )
  }, [actions])

  const stepTab = useCallback(
    (delta: number) => {
      const { tabs, activeId } = latestState.current
      if (tabs.length === 0) return
      const at = tabs.findIndex((tab: Tab) => tab.id === activeId)
      const next = tabs[(at + delta + tabs.length) % tabs.length]
      if (next) actions.activateTab(next.id)
    },
    [actions],
  )

  const zoom = useCallback(
    (by: number | null) => {
      const { min, max, step } = LIMITS.uiScale
      if (by === null) {
        update('uiScale', DEFAULTS.uiScale)
        return
      }
      const next = Math.round((settings.uiScale + by * step) * 100) / 100
      update('uiScale', Math.min(max, Math.max(min, next)))
    },
    [settings.uiScale, update],
  )

  /**
   * Runs a command once, even when two paths ask for it.
   *
   * The native menu and the keyboard both claim the same keys, and which one
   * swallows a press is the system's business, not ours. A second identical
   * request inside a blink is the same request arriving twice.
   */
  const lastRun = useRef<Map<string, number>>(new Map())
  const once = useCallback((key: string, act: () => void) => {
    const now = Date.now()
    if (now - (lastRun.current.get(key) ?? 0) < 120) return
    lastRun.current.set(key, now)
    act()
  }, [])

  const runCommand = useCallback(
    (hit: CommandId) => {
      const { activeId, tabs, recents } = latestState.current
      const view = editor.current

      if (typeof hit === 'object') {
        if ('tab' in hit) {
          const tab: Tab | undefined = tabs[hit.tab - 1]
          if (tab) actions.activateTab(tab.id)
          return
        }
        if ('recentFile' in hit) {
          const file = recents.files[hit.recentFile]
          if (file) void actions.openRecentFile(file)
          return
        }
        const base = recents.bases[hit.recentBase]
        if (base) void actions.openRecentBase(base)
        return
      }

      const editorCommands: Partial<Record<string, Command>> = {
        undo,
        redo,
        find: openSearchPanel,
        bold: toggleBold,
        italic: toggleItalic,
        code: toggleCode,
        link: insertLink,
        strike: toggleStrike,
        highlight: toggleHighlight,
        task: toggleTask,
      }
      const command = editorCommands[hit]
      if (command) {
        if (!view) return
        once(hit, () => {
          view.focus()
          command(view)
        })
        return
      }

      once(hit, () => {
        switch (hit) {
          case 'save':
            // Saving works wherever the focus is, including inside a table.
            if (activeId) void actions.save(activeId)
            break
          case 'newFile':
            actions.newNote()
            break
          case 'openBase':
            void actions.openBase()
            break
          case 'openFile':
            void actions.openLooseFile()
            break
          case 'closeTab':
            if (activeId) closeTab(activeId)
            break
          case 'reopenTab':
            reopenTab()
            break
          case 'nextTab':
            stepTab(1)
            break
          case 'previousTab':
            stepTab(-1)
            break
          case 'toggleSidebar':
            setSidebarOpen((open) => !open)
            break
          case 'toggleInfo':
            update('infoPanel', !settings.infoPanel)
            break
          case 'togglePin':
            togglePinActive()
            break
          case 'toggleDock':
            update('dock', !settings.dock)
            break
          case 'settings':
            setSettingsOpen((open) => !open)
            break
          case 'print': {
            // The browser would otherwise print the interface itself.
            if (!activeId) return
            const printing = documentMenu().find((entry) => entry.label.startsWith('Imprimir'))
            printing?.onSelect()
            break
          }
          case 'zoomIn':
            zoom(1)
            break
          case 'zoomOut':
            zoom(-1)
            break
          case 'zoomReset':
            zoom(null)
            break
        }
      })
    },
    [
      actions,
      closeTab,
      documentMenu,
      once,
      reopenTab,
      settings.dock,
      settings.infoPanel,
      stepTab,
      togglePinActive,
      update,
      zoom,
    ],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hit = matchShortcut(event)
      if (hit === null) return
      event.preventDefault()
      runCommand(hit)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runCommand])

  // The menu the system draws. It is rebuilt when what it offers changes, not
  // on every keystroke: the whole tree crosses to the other side each time.
  const latestRun = useRef(runCommand)
  useEffect(() => {
    // oxlint-disable-next-line immutability
    latestRun.current = runCommand
  })
  const hasDocument = state.tabs.length > 0
  useEffect(() => {
    if (!isDesktop()) return
    void installAppMenu(
      menuPlan({ recents: state.recents, hasDocument, apple: onApple() }),
      (command) => latestRun.current(command),
    )
      // A menu that did not install leaves the app usable by keyboard, so it
      // is worth a line in the console and not an interruption.
      .catch((error: unknown) => console.error('menu do sistema:', error))
  }, [state.recents, hasDocument])

  const dark = theme === 'dark'

  return (
    <div className={'shell' + (sidebarOpen ? '' : ' is-collapsed')}>
      {/* The desktop window has no title bar, so this strip is what it is
          dragged by. Tauri only starts a drag when the press lands on the
          element carrying the attribute, never on a child of it, which is why
          the strip is empty and why the text below repeats the attribute. */}
      <div className="drag-strip" data-drag-window />
      <aside className="sidebar">
        <div className="brand" data-drag-window>
          <BrandMark />
          <span className="brand-name">markdown-viewer</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Ajustes"
            title="Ajustes (⌘,)"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SettingsIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={dark ? 'Usar o tema claro' : 'Usar o tema escuro'}
            title={dark ? 'Usar o tema claro' : 'Usar o tema escuro'}
            onClick={(event) =>
              changeTheme(centreOf(event.currentTarget), () =>
                update('themeMode', dark ? 'light' : 'dark'),
              )
            }
          >
            <ThemeIcon size={16} />
          </button>
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
          <button type="button" className="nav-action" onClick={() => actions.newNote()}>
            <FilePlusIcon />
            Nova nota
          </button>
          <button type="button" className="nav-action" onClick={() => void actions.openBase()}>
            <FolderPlusIcon />
            Abrir pasta
          </button>
          <button type="button" className="nav-action" onClick={() => void actions.openLooseFile()}>
            <FileIcon />
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
                showAllFiles={settings.showAllFiles}
                renamingId={renamingId}
                {...tree}
              />
            </section>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="accent-rule" />
          <Recents
            recents={state.recents}
            openBases={state.bases.map((base) => base.id)}
            open={settings.recentsOpen}
            onToggle={() => update('recentsOpen', !settings.recentsOpen)}
            onOpenFile={(file) => void actions.openRecentFile(file)}
            onOpenBase={(base) => void actions.openRecentBase(base)}
            onForgetFile={(file) => actions.forgetRecentFile(file.baseId, file.path)}
            onForgetBase={(base) => actions.forgetRecentBase(base.id)}
            onClear={actions.forgetRecents}
          />
        </div>
      </aside>

      {sidebarOpen && (
        <SidebarResizer
          width={settings.sidebarWidth}
          onCommit={(width) => update('sidebarWidth', width)}
        />
      )}

      <main className="workspace">
        {/* The reveal button sits in this row and not in the breadcrumb bar, so
            that it stays at the height it was pressed at. */}
        {(state.tabs.length > 0 || !sidebarOpen) && (
          <div className="workspace-top">
            {!sidebarOpen && (
              <button
                type="button"
                className="icon-button is-reveal"
                aria-label="Mostrar a barra lateral"
                title="Mostrar a barra lateral (⌘\)"
                onClick={() => setSidebarOpen(true)}
              >
                <SidebarIcon />
              </button>
            )}
            <Tabs
              state={state}
              onActivate={actions.activateTab}
              onPin={actions.pinTab}
              onClose={closeTab}
            />
          </div>
        )}

        {/* The bar stays up whenever there is something for it to carry, which
            includes the only way back from a collapsed sidebar. */}
        {activeTab && (
          <header className="topbar" data-drag-window>
            {activeDoc && (
              <span className="save-state" data-state={activeDoc.dirty ? 'dirty' : 'saved'}>
                <span className="save-dot" />
                {activeDoc.dirty ? 'Não salvo' : 'Salvo'}
              </span>
            )}
            {activeDoc && (
              <button
                type="button"
                className={'icon-button' + (pinnedActive ? ' is-on' : '')}
                aria-label={
                  pinnedActive ? 'Desafixar da barra de notas' : 'Fixar na barra de notas'
                }
                title={
                  (pinnedActive ? 'Desafixar da barra de notas' : 'Fixar na barra de notas') +
                  ' (' +
                  keyCap(SHORTCUTS.find((one) => one.id === 'togglePin')!) +
                  ')'
                }
                aria-pressed={pinnedActive}
                onClick={togglePinActive}
              >
                {pinnedActive ? <UnpinIcon size={16} /> : <PinIcon size={16} />}
              </button>
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
                onChange={(text) => {
                  actions.edit(activeTab.id, text)
                  // A draft has no file to take its name from, so it takes it
                  // from its own first line, in the tab strip and on its
                  // square at the same time.
                  if (isDraft(activeTab)) {
                    const named = noteTitle(text, activeTab.name)
                    actions.renameTab(activeTab.id, named)
                    dock.renamePin(activeTab.id, named)
                  }
                }}
                onSave={saveActive}
                onOutline={setHeadings}
                onReady={(view) => {
                  editor.current = view
                }}
              />
              {settings.infoPanel && (
                <SidebarResizer
                  width={settings.infoWidth}
                  onCommit={(next) => update('infoWidth', next)}
                  variable="--info-width"
                  limits={LIMITS.infoWidth}
                  invert
                  label="Largura do painel de sumário e links"
                  restore={DEFAULTS.infoWidth}
                />
              )}
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
          base={activeTab ? state.bases.find((base) => base.id === activeTab.baseId) : undefined}
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

      {question && (
        <Dialog
          title={question.title}
          body={question.body}
          choices={question.choices}
          onCancel={() => setQuestion(null)}
        />
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

      <UpdateNotice />

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
