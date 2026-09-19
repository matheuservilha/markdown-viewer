import { useCallback, useMemo, useReducer, useRef } from 'react'
import { fileSystem } from '~/platform'
import { byDepth, type Session, type SessionTab } from './session'
import {
  baseName,
  entryId,
  isPlainText,
  joinPath,
  parentPath,
  type Base,
  type Entry,
  type FileVersion,
} from '~/platform/fs'
import { encode, type TextShape } from '~/platform/text'

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
  | { type: 'tab/closed'; id: string }
  | { type: 'tab/activated'; id: string }
  | { type: 'doc/loaded'; id: string; doc: Doc }
  | { type: 'doc/edited'; id: string; text: string }
  | { type: 'doc/saved'; id: string; version: FileVersion }
  | { type: 'doc/conflicted'; id: string }
  | { type: 'filter/set'; value: string }
  | { type: 'error/set'; message: string | null }
  | { type: 'session/restored'; pending: string[] }
  | { type: 'folder/expanded'; id: string }
  | { type: 'entry/moved'; baseId: string; from: string; to: string }
  | { type: 'entry/removed'; baseId: string; path: string }
  | { type: 'folders/collapsed' }

const initialState: State = {
  bases: [],
  children: {},
  expanded: {},
  tabs: [],
  activeId: null,
  docs: {},
  filter: '',
  error: null,
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

    case 'tab/closed': {
      const index = state.tabs.findIndex((tab) => tab.id === action.id)
      const tabs = state.tabs.filter((tab) => tab.id !== action.id)
      const docs = { ...state.docs }
      delete docs[action.id]
      const fallback = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      return { ...state, tabs, docs, activeId: state.activeId === action.id ? fallback : state.activeId }
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
        docs: { ...state.docs, [action.id]: { ...doc, dirty: false, conflict: false, version: action.version } },
      }
    }

    case 'doc/conflicted': {
      const doc = state.docs[action.id]
      if (!doc) return state
      return { ...state, docs: { ...state.docs, [action.id]: { ...doc, conflict: true } } }
    }

    case 'filter/set':
      return { ...state, filter: action.value }

    case 'error/set':
      return { ...state, error: action.message }

    case 'session/restored':
      return { ...state, restored: true, pending: action.pending }

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
  latest.current = state

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

      if (latest.current.docs[id]) return
      const loaded = await fileSystem().read(loose.baseId, '')
      dispatch({ type: 'doc/loaded', id, doc: { ...loaded, dirty: false, conflict: false } })
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
      if (latest.current.docs[entry.id]) return
      try {
        const loaded = await fileSystem().read(entry.baseId, entry.path)
        dispatch({
          type: 'doc/loaded',
          id: entry.id,
          doc: { ...loaded, dirty: false, conflict: false },
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
      if (doc.shape.lossy) {
        report(new Error('Arquivo não é UTF-8. Aberto somente para leitura para não corromper os bytes.'))
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
    [report],
  )

  /** Pulls the file from disk again, throwing away what is in the editor. */
  const reload = useCallback(
    async (id: string) => {
      const tab = latest.current.tabs.find((candidate) => candidate.id === id)
      if (!tab) return
      try {
        const loaded = await fileSystem().read(tab.baseId, tab.path)
        dispatch({ type: 'doc/loaded', id, doc: { ...loaded, dirty: false, conflict: false } })
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
        dispatch({ type: 'doc/conflicted', id: tab.id })
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

  const collapseAll = useCallback(() => dispatch({ type: 'folders/collapsed' }), [])

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

      for (const tab of session.tabs) {
        if (!available.has(tab.baseId)) continue
        try {
          const loaded = await fileSystem().read(tab.baseId, tab.path)
          dispatch({ type: 'tab/opened', tab: toTab(tab) })
          dispatch({
            type: 'doc/loaded',
            id: tab.id,
            doc: { ...loaded, dirty: false, conflict: false },
          })
        } catch {
          // A file that moved or was deleted simply does not come back.
        }
      }

      if (session.activeId && latest.current.docs[session.activeId]) {
        dispatch({ type: 'tab/activated', id: session.activeId })
      }

      dispatch({ type: 'session/restored', pending })
    },
    [loadChildren],
  )

  const actions = useMemo(
    () => ({
      openBase,
      openLooseFile,
      restoreSession,
      createEntry,
      renameEntry,
      duplicateEntry,
      trashEntry,
      revealEntry,
      collapseAll,
      expandFolder,
      revealPath,
      toggleFolder,
      openFile,
      save,
      reload,
      checkExternalChanges,
      pinTab: (id: string) => dispatch({ type: 'tab/pinned', id }),
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
      expandFolder,
      revealPath,
      duplicateEntry,
      renameEntry,
      revealEntry,
      trashEntry,
      openBase,
      openFile,
      openLooseFile,
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
