import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { fileSystem } from '~/platform'
import { buildIndex, EMPTY_INDEX, type BaseIndex } from './base-index'
import {
  clearRecents,
  forgetBase,
  forgetFile,
  loadRecents,
  rememberBase,
  rememberFile,
  type RecentBase,
  type RecentFile,
  type Recents,
} from './recents'
import { byDepth, restoreMayChooseActive, type Session, type SessionTab } from './session'
import { DRAFT_BASE, isDraft, nextDraftName, type Draft } from './drafts'
import {
  baseName,
  entryId,
  isPlainText,
  joinPath,
  parentPath,
  type Base,
  type Entry,
  type FileVersion,
  nativeBaseName,
} from '~/platform/fs'
import { encode, type TextShape } from '~/platform/text'

/** The shape a note is born with: plain UTF-8, newline endings, no BOM. */
const DRAFT_SHAPE: TextShape = { eol: '\n', bom: false, encoding: 'utf-8', lossy: false }

export interface Tab {
  /** Same as the entry id, so a file is never open twice. */
  id: string
  baseId: string
  path: string
  name: string
  /** A preview tab shows in italic and is replaced by the next single click. */
  preview: boolean
  /** Full path of a file opened outside every base. */
  label?: string
}

export interface Doc {
  text: string
  shape: TextShape
  version: FileVersion
  dirty: boolean
  /** Set when the file changed on disk while we had unsaved edits. */
  conflict: boolean
  /** Set when the file is no longer on disk. */
  gone: boolean
}

export interface State {
  bases: Base[]
  /** Children by entry id of the folder. */
  children: Record<string, Entry[]>
  expanded: Record<string, boolean>
  tabs: Tab[]
  activeId: string | null
  docs: Record<string, Doc>
  filter: string
  error: string | null
  /** What has been opened before, folders and files. */
  recents: Recents
  /** Links and titles of each open base, built in the background. */
  index: Record<string, BaseIndex>
  /** Bases from last session that the browser will only reopen after a click. */
  pending: string[]
  /** False until the attempt to reopen last session has finished. */
  restored: boolean
}

type Action =
  | { type: 'base/added'; base: Base }
  | { type: 'children/loaded'; id: string; entries: Entry[] }
  | { type: 'folder/toggled'; id: string }
  | { type: 'tab/opened'; tab: Tab }
  | { type: 'tab/pinned'; id: string }
  | { type: 'tab/renamed'; id: string; name: string }
  | { type: 'tab/closed'; id: string }
  | { type: 'tab/activated'; id: string }
  | { type: 'doc/loaded'; id: string; doc: Doc }
  | { type: 'doc/edited'; id: string; text: string }
  | { type: 'doc/saved'; id: string; version: FileVersion }
  | { type: 'doc/conflicted'; id: string }
  | { type: 'doc/vanished'; id: string }
  | { type: 'filter/set'; value: string }
  | { type: 'error/set'; message: string | null }
  | { type: 'session/restored'; pending: string[] }
  | { type: 'folder/expanded'; id: string }
  | { type: 'entry/moved'; baseId: string; from: string; to: string }
  | { type: 'entry/removed'; baseId: string; path: string }
  | { type: 'folders/collapsed' }
  | { type: 'recents/set'; recents: Recents }
  | { type: 'index/progress'; baseId: string; index: BaseIndex }

const initialState: State = {
  bases: [],
  children: {},
  expanded: {},
  tabs: [],
  activeId: null,
  docs: {},
  filter: '',
  error: null,
  recents: loadRecents(),
  index: {},
  pending: [],
  restored: false,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'base/added': {
      // Opening the same folder twice, or restoring one that is already open,
      // must not draw the tree twice.
      const known = state.bases.some((base) => base.id === action.base.id)
      if (known) return state
      return { ...state, bases: [...state.bases, action.base] }
    }

    case 'children/loaded':
      return { ...state, children: { ...state.children, [action.id]: action.entries } }

    case 'folder/toggled':
      return { ...state, expanded: { ...state.expanded, [action.id]: !state.expanded[action.id] } }

    case 'tab/opened': {
      const existing = state.tabs.find((tab) => tab.id === action.tab.id)
      if (existing) {
        // Reopening a preview tab as a pinned one keeps its place in the strip.
        const tabs = action.tab.preview
          ? state.tabs
          : state.tabs.map((tab) => (tab.id === action.tab.id ? { ...tab, preview: false } : tab))
        return { ...state, tabs, activeId: action.tab.id }
      }
      const withoutPreview = action.tab.preview
        ? state.tabs.filter((tab) => !tab.preview || state.docs[tab.id]?.dirty)
        : state.tabs
      return { ...state, tabs: [...withoutPreview, action.tab], activeId: action.tab.id }
    }

    case 'tab/pinned':
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, preview: false } : tab)),
      }

    /**
     * Only a draft is renamed this way, and only by its own first line. A file
     * is renamed on disk, by `entry/moved`, because its name is the name of
     * something that exists.
     */
    case 'tab/renamed': {
      const tab = state.tabs.find((candidate) => candidate.id === action.id)
      if (!tab || tab.name === action.name || !isDraft(tab)) return state
      return {
        ...state,
        tabs: state.tabs.map((one) => (one.id === action.id ? { ...one, name: action.name } : one)),
      }
    }

    case 'tab/closed': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id)
      const tabs = state.tabs.filter((tab) => tab.id !== action.id)
      const docs = { ...state.docs }
      delete docs[action.id]
      const fallback = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      return {
        ...state,
        tabs,
        docs,
        activeId: state.activeId === action.id ? fallback : state.activeId,
      }
    }

    case 'tab/activated':
      return { ...state, activeId: action.id }

    case 'doc/loaded':
      return { ...state, docs: { ...state.docs, [action.id]: action.doc } }

    case 'doc/edited': {
      const doc = state.docs[action.id]
      if (!doc || doc.text === action.text) return state
      return {
        ...state,
        // Typing pins the tab. Without this, a preview tab the person has
        // already written in would be thrown away by the next single click.
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, preview: false } : tab)),
        docs: { ...state.docs, [action.id]: { ...doc, text: action.text, dirty: true } },
      }
    }

    case 'doc/saved': {
      const doc = state.docs[action.id]
      if (!doc) return state
      return {
        ...state,
        docs: {
          ...state.docs,
          [action.id]: { ...doc, dirty: false, conflict: false, version: action.version },
        },
      }
    }

    case 'doc/conflicted': {
      const doc = state.docs[action.id]
      if (!doc) return state
      return { ...state, docs: { ...state.docs, [action.id]: { ...doc, conflict: true } } }
    }

    case 'doc/vanished': {
      const doc = state.docs[action.id]
      if (!doc || doc.gone) return state
      // The text stays in the editor. Saving it puts the file back.
      return { ...state, docs: { ...state.docs, [action.id]: { ...doc, gone: true, dirty: true } } }
    }

    case 'filter/set':
      return { ...state, filter: action.value }

    case 'error/set':
      return { ...state, error: action.message }

    case 'session/restored':
      return { ...state, restored: true, pending: action.pending }

    case 'index/progress':
      return { ...state, index: { ...state.index, [action.baseId]: action.index } }

    case 'recents/set':
      return { ...state, recents: action.recents }

    case 'folders/collapsed':
      return { ...state, expanded: {} }

    case 'folder/expanded':
      return { ...state, expanded: { ...state.expanded, [action.id]: true } }

    case 'entry/moved': {
      // A rename moves the entry and everything under it, so every open tab,
      // every loaded document and every expanded folder has to follow.
      const under = (path: string) => path === action.from || path.startsWith(action.from + '/')
      const moved = (path: string) => action.to + path.slice(action.from.length)

      const docs: Record<string, Doc> = {}
      for (const [id, doc] of Object.entries(state.docs)) {
        const [base, path] = splitEntryId(id)
        docs[base === action.baseId && under(path) ? entryId(base, moved(path)) : id] = doc
      }

      const expanded: Record<string, boolean> = {}
      for (const [id, open] of Object.entries(state.expanded)) {
        const [base, path] = splitEntryId(id)
        expanded[base === action.baseId && under(path) ? entryId(base, moved(path)) : id] = open
      }

      const tabs = state.tabs.map((tab) => {
        if (tab.baseId !== action.baseId || !under(tab.path)) return tab
        const path = moved(tab.path)
        return { ...tab, path, name: baseName(path), id: entryId(tab.baseId, path) }
      })

      const activeId =
        state.activeId === null ? null : remapId(state.activeId, action.baseId, under, moved)

      return { ...state, docs, expanded, tabs, activeId }
    }

    case 'entry/removed': {
      const under = (path: string) => path === action.path || path.startsWith(action.path + '/')
      const gone = (tab: Tab) => tab.baseId === action.baseId && under(tab.path)

      const docs = { ...state.docs }
      for (const tab of state.tabs.filter(gone)) delete docs[tab.id]
      const tabs = state.tabs.filter((tab) => !gone(tab))

      return {
        ...state,
        docs,
        tabs,
        activeId: tabs.some((tab) => tab.id === state.activeId)
          ? state.activeId
          : (tabs[tabs.length - 1]?.id ?? null),
      }
    }
  }
}

export function useWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState)

  /**
   * The actions read the state through this reference rather than through the
   * closure, so that none of them changes identity between renders. Without it
   * every keystroke hands the file tree and the tab strip a new set of
   * callbacks, and they all render again for nothing.
   */
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  })

  const report = useCallback((error: unknown) => {
    dispatch({ type: 'error/set', message: error instanceof Error ? error.message : String(error) })
  }, [])

  const loadChildren = useCallback(
    async (baseId: string, path: string) => {
      try {
        const entries = await fileSystem().list(baseId, path)
        dispatch({ type: 'children/loaded', id: entryId(baseId, path), entries })
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  const openBase = useCallback(async () => {
    try {
      const base = await fileSystem().openBase()
      if (!base) return
      dispatch({ type: 'recents/set', recents: rememberBase(base) })
      dispatch({ type: 'base/added', base })
      await loadChildren(base.id, '')
    } catch (error) {
      report(error)
    }
  }, [loadChildren, report])

  const toggleFolder = useCallback(
    async (entry: Entry) => {
      dispatch({ type: 'folder/toggled', id: entry.id })
      if (!latest.current.children[entry.id]) await loadChildren(entry.baseId, entry.path)
    },
    [loadChildren],
  )

  /**
   * A file picked from anywhere on disk. It gets a base of its own, does not
   * enter the tree, and opens pinned: nobody opens a file through the system
   * dialog by accident.
   */
  const openLooseFile = useCallback(async () => {
    try {
      const loose = await fileSystem().openFile()
      if (!loose) return

      const id = entryId(loose.baseId, '')
      dispatch({
        type: 'tab/opened',
        tab: {
          id,
          baseId: loose.baseId,
          path: '',
          name: loose.name,
          label: loose.label,
          preview: false,
        },
      })

      dispatch({
        type: 'recents/set',
        recents: rememberFile({
          baseId: loose.baseId,
          path: '',
          name: loose.name,
          label: loose.label,
        }),
      })
      if (latest.current.docs[id]) return
      const loaded = await fileSystem().read(loose.baseId, '')
      dispatch({
        type: 'doc/loaded',
        id,
        doc: { ...loaded, dirty: false, conflict: false, gone: false },
      })
    } catch (error) {
      report(error)
    }
  }, [report])

  const openFile = useCallback(
    async (entry: Entry, preview: boolean) => {
      dispatch({
        type: 'tab/opened',
        tab: { id: entry.id, baseId: entry.baseId, path: entry.path, name: entry.name, preview },
      })
      dispatch({
        type: 'recents/set',
        recents: rememberFile({ baseId: entry.baseId, path: entry.path, name: entry.name }),
      })
      if (latest.current.docs[entry.id]) return
      try {
        const loaded = await fileSystem().read(entry.baseId, entry.path)
        dispatch({
          type: 'doc/loaded',
          id: entry.id,
          doc: { ...loaded, dirty: false, conflict: false, gone: false },
        })
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  /**
   * Opening a recent file is defined further down, and saving a draft needs
   * it, so it is reached through a reference rather than by moving either one.
   */
  const openRecent = useRef<((file: RecentFile) => Promise<void>) | null>(null)

  /**
   * Opens a note that exists only in the app.
   *
   * No dialog, no file, nothing on disk. It becomes a file the first time it
   * is saved, and only then is the person asked where it goes.
   */
  const newNote = useCallback((restoring?: Draft) => {
    const taken = latest.current.tabs.map((tab) => tab.name)
    const draft: Draft = restoring ?? {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      name: nextDraftName(taken),
      text: '',
      at: Date.now(),
    }
    const id = entryId(DRAFT_BASE, draft.id)
    dispatch({
      type: 'tab/opened',
      tab: { id, baseId: DRAFT_BASE, path: draft.id, name: draft.name, preview: false },
    })
    dispatch({
      type: 'doc/loaded',
      id,
      doc: {
        text: draft.text,
        shape: DRAFT_SHAPE,
        version: { size: 0, modifiedAt: 0 },
        // Never clean: a draft is unsaved by definition, and the dot on the
        // tab is what says so.
        dirty: true,
        conflict: false,
        gone: false,
      },
    })
    return id
  }, [])

  /**
   * Saving a draft is the moment it stops being one: the person says where it
   * goes, the bytes are written there, and the tab is replaced by the file.
   */
  const saveDraftAs = useCallback(
    async (id: string) => {
      const tab = latest.current.tabs.find((candidate) => candidate.id === id)
      const doc = latest.current.docs[id]
      if (!tab || !doc) return
      try {
        const suggested = tab.name.endsWith('.md') ? tab.name : tab.name + '.md'
        const target = await fileSystem().saveAs(suggested, encode(doc.text, doc.shape))
        if (!target) return
        dispatch({ type: 'tab/closed', id })
        await openRecent.current?.({
          baseId: target,
          path: '',
          name: nativeBaseName(target),
          label: target,
          at: Date.now(),
        })
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  const save = useCallback(
    async (id: string) => {
      const tab = latest.current.tabs.find((candidate) => candidate.id === id)
      const doc = latest.current.docs[id]
      if (!tab || !doc || !doc.dirty) return
      if (isDraft(tab)) {
        await saveDraftAs(id)
        return
      }
      if (doc.shape.lossy) {
        report(
          new Error(
            'Arquivo não é UTF-8. Aberto somente para leitura para não corromper os bytes.',
          ),
        )
        return
      }
      try {
        const onDisk = await fileSystem().stat(tab.baseId, tab.path)
        if (onDisk && onDisk.modifiedAt > doc.version.modifiedAt) {
          dispatch({ type: 'doc/conflicted', id })
          return
        }
        const version = await fileSystem().write(tab.baseId, tab.path, encode(doc.text, doc.shape))
        dispatch({ type: 'doc/saved', id, version })
      } catch (error) {
        report(error)
      }
    },
    [report, saveDraftAs],
  )

  /** Pulls the file from disk again, throwing away what is in the editor. */
  const reload = useCallback(
    async (id: string) => {
      const tab = latest.current.tabs.find((candidate) => candidate.id === id)
      if (!tab) return
      try {
        const loaded = await fileSystem().read(tab.baseId, tab.path)
        dispatch({
          type: 'doc/loaded',
          id,
          doc: { ...loaded, dirty: false, conflict: false, gone: false },
        })
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  /**
   * Notices files that changed behind our back. A clean document reloads on its
   * own; a dirty one is flagged and the person decides, so no text is lost.
   */
  const checkExternalChanges = useCallback(async () => {
    for (const tab of latest.current.tabs) {
      const doc = latest.current.docs[tab.id]
      if (!doc) continue
      const onDisk = await fileSystem().stat(tab.baseId, tab.path)
      if (!onDisk) {
        dispatch({ type: 'doc/vanished', id: tab.id })
        continue
      }
      if (onDisk.modifiedAt <= doc.version.modifiedAt) continue
      if (doc.dirty) dispatch({ type: 'doc/conflicted', id: tab.id })
      else await reload(tab.id)
    }
  }, [reload])

  /** A name nobody is using yet in that folder. */
  const freeName = useCallback((baseId: string, parent: string, base: string): string => {
    const taken = new Set(
      (latest.current.children[entryId(baseId, parent)] ?? []).map((entry) => entry.name),
    )
    if (!taken.has(base)) return base

    const dot = base.lastIndexOf('.')
    const stem = dot <= 0 ? base : base.slice(0, dot)
    const extension = dot <= 0 ? '' : base.slice(dot)
    for (let attempt = 2; ; attempt++) {
      const candidate = stem + ' ' + attempt + extension
      if (!taken.has(candidate)) return candidate
    }
  }, [])

  const createEntry = useCallback(
    async (baseId: string, parent: string, kind: 'file' | 'folder'): Promise<Entry | null> => {
      try {
        const name = freeName(baseId, parent, kind === 'file' ? 'Sem título.md' : 'Nova pasta')
        const path = joinPath(parent, name)
        const entry =
          kind === 'file'
            ? await fileSystem().createFile(baseId, path)
            : await fileSystem().createFolder(baseId, path)
        await loadChildren(baseId, parent)
        return entry
      } catch (error) {
        report(error)
        return null
      }
    },
    [freeName, loadChildren, report],
  )

  const renameEntry = useCallback(
    async (entry: Entry, name: string) => {
      const trimmed = name.trim()
      if (trimmed === '' || trimmed === entry.name) return
      const parent = parentPath(entry.path)
      const target = joinPath(parent, trimmed)
      try {
        await fileSystem().move(entry.baseId, entry.path, target)
        dispatch({ type: 'entry/moved', baseId: entry.baseId, from: entry.path, to: target })
        await loadChildren(entry.baseId, parent)
      } catch (error) {
        report(error)
      }
    },
    [loadChildren, report],
  )

  const duplicateEntry = useCallback(
    async (entry: Entry): Promise<Entry | null> => {
      try {
        const copy = await fileSystem().duplicate(entry.baseId, entry.path)
        await loadChildren(entry.baseId, parentPath(entry.path))
        return copy
      } catch (error) {
        report(error)
        return null
      }
    },
    [loadChildren, report],
  )

  const trashEntry = useCallback(
    async (entry: Entry) => {
      try {
        await fileSystem().trash(entry.baseId, entry.path)
        dispatch({ type: 'entry/removed', baseId: entry.baseId, path: entry.path })
        await loadChildren(entry.baseId, parentPath(entry.path))
      } catch (error) {
        report(error)
      }
    },
    [loadChildren, report],
  )

  const revealEntry = useCallback(
    async (entry: Entry) => {
      try {
        await fileSystem().reveal(entry.baseId, entry.path)
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  /**
   * Opens something from the history. The folder it lives in may not be open
   * any more, so it is reopened first. This always runs from a click, which is
   * the only moment a browser will grant a folder's permission again.
   */
  const openRecentFile = useCallback(
    async (file: RecentFile) => {
      try {
        const known = latest.current.bases.some((base) => base.id === file.baseId)
        if (!known && file.path !== '') {
          const result = await fileSystem().restoreBase(file.baseId, true)
          if (result.status !== 'ok') {
            report(new Error('A pasta desse arquivo não está mais acessível.'))
            return
          }
          dispatch({ type: 'base/added', base: result.value })
          await loadChildren(file.baseId, '')
        }
        if (!known && file.path === '') {
          const result = await fileSystem().restoreFile(file.baseId, true)
          if (result.status !== 'ok') {
            report(new Error('Esse arquivo não está mais acessível.'))
            return
          }
        }

        const id = entryId(file.baseId, file.path)
        dispatch({
          type: 'tab/opened',
          tab: {
            id,
            baseId: file.baseId,
            path: file.path,
            name: file.name,
            preview: false,
            ...(file.label === undefined ? {} : { label: file.label }),
          },
        })
        dispatch({ type: 'recents/set', recents: rememberFile(file) })
        if (latest.current.docs[id]) return
        const loaded = await fileSystem().read(file.baseId, file.path)
        dispatch({
          type: 'doc/loaded',
          id,
          doc: { ...loaded, dirty: false, conflict: false, gone: false },
        })
      } catch (error) {
        report(error)
      }
    },
    [loadChildren, report],
  )

  const openRecentBase = useCallback(
    async (base: RecentBase) => {
      try {
        if (latest.current.bases.some((open) => open.id === base.id)) return
        const result = await fileSystem().restoreBase(base.id, true)
        if (result.status !== 'ok') {
          report(new Error('Essa pasta não está mais acessível.'))
          return
        }
        dispatch({ type: 'recents/set', recents: rememberBase(result.value) })
        dispatch({ type: 'base/added', base: result.value })
        await loadChildren(base.id, '')
      } catch (error) {
        report(error)
      }
    },
    [loadChildren, report],
  )

  /**
   * Watches every open folder, where the platform can. The desktop notices a
   * file changed by another program while the window still has focus, which is
   * the case the focus check never covered.
   */
  const watchBases = useCallback((onChange: () => void): (() => void) => {
    const stops: (() => void)[] = []
    let cancelled = false

    for (const base of latest.current.bases) {
      void fileSystem()
        .watch(base.id, onChange)
        .then((stop) => {
          if (!stop) return
          if (cancelled) stop()
          else stops.push(stop)
        })
        .catch(() => {
          // A folder that refuses to be watched is simply not watched.
        })
    }

    return () => {
      cancelled = true
      for (const stop of stops) stop()
    }
  }, [])

  const collapseAll = useCallback(() => dispatch({ type: 'folders/collapsed' }), [])

  /**
   * Reads the whole folder once, in the background, to learn what links to
   * what. Nothing on screen waits for it: the panel shows how far it got.
   */
  const indexing = useRef(new Set<string>())
  const indexBase = useCallback(async (baseId: string) => {
    if (indexing.current.has(baseId)) return
    indexing.current.add(baseId)
    dispatch({ type: 'index/progress', baseId, index: EMPTY_INDEX })
    try {
      await buildIndex(
        baseId,
        (index) => dispatch({ type: 'index/progress', baseId, index }),
        () => false,
      )
    } finally {
      indexing.current.delete(baseId)
    }
  }, [])

  const forgetRecents = useCallback(
    () => dispatch({ type: 'recents/set', recents: clearRecents() }),
    [],
  )

  const forgetRecentFile = useCallback(
    (baseId: string, path: string) =>
      dispatch({ type: 'recents/set', recents: forgetFile(baseId, path) }),
    [],
  )

  const forgetRecentBase = useCallback(
    (id: string) => dispatch({ type: 'recents/set', recents: forgetBase(id) }),
    [],
  )

  const expandFolder = useCallback(
    async (baseId: string, path: string) => {
      dispatch({ type: 'folder/expanded', id: entryId(baseId, path) })
      await loadChildren(baseId, path)
    },
    [loadChildren],
  )

  /** Opens every folder on the way to a path, so the row can be seen. */
  const revealPath = useCallback(
    async (baseId: string, path: string) => {
      const segments = path.split('/').slice(0, -1)
      let walked = ''
      for (const segment of segments) {
        walked = joinPath(walked, segment)
        await expandFolder(baseId, walked)
      }
    },
    [expandFolder],
  )

  /**
   * Reopens what was open last time. `interactive` may only be true when this
   * runs inside a click: that is the one moment a browser lets us ask for a
   * folder's permission back.
   */
  const restoreSession = useCallback(
    async (session: Session, interactive: boolean) => {
      const pending: string[] = []
      const available = new Set<string>()

      for (const baseId of session.bases) {
        const result = await fileSystem().restoreBase(baseId, interactive)
        if (result.status === 'needs-permission') pending.push(baseId)
        if (result.status !== 'ok') continue
        available.add(baseId)
        dispatch({ type: 'base/added', base: result.value })
        await loadChildren(baseId, '')
      }

      for (const baseId of session.files) {
        const result = await fileSystem().restoreFile(baseId, interactive)
        if (result.status === 'needs-permission') pending.push(baseId)
        if (result.status === 'ok') available.add(baseId)
      }

      for (const id of byDepth(session.expanded)) {
        const [baseId, path] = splitEntryId(id)
        if (!available.has(baseId)) continue
        dispatch({ type: 'folder/expanded', id })
        await loadChildren(baseId, path)
      }

      const restoredIds: string[] = []
      for (const tab of session.tabs) {
        if (!available.has(tab.baseId)) continue
        try {
          const loaded = await fileSystem().read(tab.baseId, tab.path)
          restoredIds.push(tab.id)
          dispatch({ type: 'tab/opened', tab: toTab(tab) })
          dispatch({
            type: 'doc/loaded',
            id: tab.id,
            doc: { ...loaded, dirty: false, conflict: false, gone: false },
          })
        } catch {
          // A file that moved or was deleted simply does not come back.
        }
      }

      if (
        session.activeId &&
        latest.current.docs[session.activeId] &&
        restoreMayChooseActive(latest.current.activeId, restoredIds)
      ) {
        dispatch({ type: 'tab/activated', id: session.activeId })
      }

      dispatch({ type: 'session/restored', pending })
    },
    [loadChildren],
  )

  // Kept up to date rather than reordered, because moving either function
  // would drag half the file with it.
  useEffect(() => {
    openRecent.current = openRecentFile
  }, [openRecentFile])

  const actions = useMemo(
    () => ({
      openBase,
      openLooseFile,
      openRecentFile,
      openRecentBase,
      newNote,
      forgetRecents,
      forgetRecentFile,
      forgetRecentBase,
      restoreSession,
      createEntry,
      renameEntry,
      duplicateEntry,
      trashEntry,
      revealEntry,
      collapseAll,
      indexBase,
      expandFolder,
      revealPath,
      toggleFolder,
      openFile,
      save,
      reload,
      checkExternalChanges,
      watchBases,
      pinTab: (id: string) => dispatch({ type: 'tab/pinned', id }),
      renameTab: (id: string, name: string) => dispatch({ type: 'tab/renamed', id, name }),
      closeTab: (id: string) => dispatch({ type: 'tab/closed', id }),
      activateTab: (id: string) => dispatch({ type: 'tab/activated', id }),
      edit: (id: string, text: string) => dispatch({ type: 'doc/edited', id, text }),
      setFilter: (value: string) => dispatch({ type: 'filter/set', value }),
      dismissError: () => dispatch({ type: 'error/set', message: null }),
    }),
    [
      checkExternalChanges,
      collapseAll,
      createEntry,
      newNote,
      forgetRecents,
      forgetRecentFile,
      forgetRecentBase,
      indexBase,
      expandFolder,
      revealPath,
      duplicateEntry,
      renameEntry,
      revealEntry,
      trashEntry,
      watchBases,
      openBase,
      openFile,
      openLooseFile,
      openRecentBase,
      openRecentFile,
      reload,
      restoreSession,
      save,
      toggleFolder,
    ],
  )

  return { state, actions }
}

/** `<baseId>:<path>`, where the path may itself be empty or contain colons. */
function splitEntryId(id: string): [string, string] {
  const cut = id.indexOf(':')
  return cut < 0 ? [id, ''] : [id.slice(0, cut), id.slice(cut + 1)]
}

function toTab(tab: SessionTab): Tab {
  return {
    id: tab.id,
    baseId: tab.baseId,
    path: tab.path,
    name: tab.name,
    preview: tab.preview,
    ...(tab.label === undefined ? {} : { label: tab.label }),
  }
}

function remapId(
  id: string,
  baseId: string,
  under: (path: string) => boolean,
  moved: (path: string) => string,
): string {
  const [base, path] = splitEntryId(id)
  return base === baseId && under(path) ? entryId(base, moved(path)) : id
}

export function isPlainTextTab(tab: Tab): boolean {
  return isPlainText(tab.name)
}
