import { useCallback, useMemo, useReducer } from 'react'
import { fileSystem } from '~/platform'
import {
  entryId,
  isPlainText,
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

const initialState: State = {
  bases: [],
  children: {},
  expanded: {},
  tabs: [],
  activeId: null,
  docs: {},
  filter: '',
  error: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'base/added':
      return { ...state, bases: [...state.bases, action.base] }

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
  }
}

export function useWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const report = useCallback((error: unknown) => {
    dispatch({ type: 'error/set', message: error instanceof Error ? error.message : String(error) })
  }, [])

  const loadChildren = useCallback(
    async (baseId: string, path: string) => {
      try {
        const entries = await fileSystem.list(baseId, path)
        dispatch({ type: 'children/loaded', id: entryId(baseId, path), entries })
      } catch (error) {
        report(error)
      }
    },
    [report],
  )

  const openBase = useCallback(async () => {
    try {
      const base = await fileSystem.openBase()
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
      if (!state.children[entry.id]) await loadChildren(entry.baseId, entry.path)
    },
    [loadChildren, state.children],
  )

  const openFile = useCallback(
    async (entry: Entry, preview: boolean) => {
      dispatch({
        type: 'tab/opened',
        tab: { id: entry.id, baseId: entry.baseId, path: entry.path, name: entry.name, preview },
      })
      if (state.docs[entry.id]) return
      try {
        const loaded = await fileSystem.read(entry.baseId, entry.path)
        dispatch({
          type: 'doc/loaded',
          id: entry.id,
          doc: { ...loaded, dirty: false, conflict: false },
        })
      } catch (error) {
        report(error)
      }
    },
    [report, state.docs],
  )

  const save = useCallback(
    async (id: string) => {
      const tab = state.tabs.find((candidate) => candidate.id === id)
      const doc = state.docs[id]
      if (!tab || !doc || !doc.dirty) return
      if (doc.shape.lossy) {
        report(new Error('Arquivo não é UTF-8. Aberto somente para leitura para não corromper os bytes.'))
        return
      }
      try {
        const onDisk = await fileSystem.stat(tab.baseId, tab.path)
        if (onDisk && onDisk.modifiedAt > doc.version.modifiedAt) {
          dispatch({ type: 'doc/conflicted', id })
          return
        }
        const version = await fileSystem.write(tab.baseId, tab.path, encode(doc.text, doc.shape))
        dispatch({ type: 'doc/saved', id, version })
      } catch (error) {
        report(error)
      }
    },
    [report, state.docs, state.tabs],
  )

  /** Pulls the file from disk again, throwing away what is in the editor. */
  const reload = useCallback(
    async (id: string) => {
      const tab = state.tabs.find((candidate) => candidate.id === id)
      if (!tab) return
      try {
        const loaded = await fileSystem.read(tab.baseId, tab.path)
        dispatch({ type: 'doc/loaded', id, doc: { ...loaded, dirty: false, conflict: false } })
      } catch (error) {
        report(error)
      }
    },
    [report, state.tabs],
  )

  /**
   * Notices files that changed behind our back. A clean document reloads on its
   * own; a dirty one is flagged and the person decides, so no text is lost.
   */
  const checkExternalChanges = useCallback(async () => {
    for (const tab of state.tabs) {
      const doc = state.docs[tab.id]
      if (!doc) continue
      const onDisk = await fileSystem.stat(tab.baseId, tab.path)
      if (!onDisk) {
        dispatch({ type: 'doc/conflicted', id: tab.id })
        continue
      }
      if (onDisk.modifiedAt <= doc.version.modifiedAt) continue
      if (doc.dirty) dispatch({ type: 'doc/conflicted', id: tab.id })
      else await reload(tab.id)
    }
  }, [reload, state.docs, state.tabs])

  const actions = useMemo(
    () => ({
      openBase,
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
    [checkExternalChanges, openBase, openFile, reload, save, toggleFolder],
  )

  return { state, actions }
}

export function isPlainTextTab(tab: Tab): boolean {
  return isPlainText(tab.name)
}
