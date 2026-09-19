import { isPlainText, isTextFile, type Entry } from '~/platform/fs'
import type { State } from '~/app/store'
import { FileIcon, FolderIcon, MarkdownIcon } from './icons'

interface Props {
  state: State
  /** Entry id of the folder whose children we are drawing. */
  parentId: string
  depth: number
  showAllFiles: boolean
  onToggleFolder: (entry: Entry) => void
  onOpenFile: (entry: Entry, preview: boolean) => void
}

/** True when the entry itself matches, or any loaded descendant does. */
function matchesFilter(state: State, entry: Entry, filter: string): boolean {
  if (entry.name.toLowerCase().includes(filter)) return true
  if (entry.kind === 'file') return false
  return (state.children[entry.id] ?? []).some((child) => matchesFilter(state, child, filter))
}

/** Folder, Markdown file, plain text and everything else each get their own mark. */
function EntryIcon({ entry }: { entry: Entry }) {
  if (entry.kind === 'directory') return <FolderIcon className="tree-icon is-folder" />
  if (isPlainText(entry.name)) return <FileIcon className="tree-icon is-text" />
  if (isTextFile(entry.name)) return <MarkdownIcon className="tree-icon is-markdown" />
  return <FileIcon className="tree-icon is-other" />
}

export function FileTree({
  state,
  parentId,
  depth,
  showAllFiles,
  onToggleFolder,
  onOpenFile,
}: Props) {
  const filter = state.filter.trim().toLowerCase()
  const entries = (state.children[parentId] ?? []).filter((entry) => {
    if (entry.kind === 'file' && !showAllFiles && !isTextFile(entry.name)) return false
    return filter === '' || matchesFilter(state, entry, filter)
  })

  return (
    <ul className="tree" role="group">
      {entries.map((entry) => {
        const open = state.expanded[entry.id] === true
        const readable = entry.kind === 'directory' || isTextFile(entry.name)
        return (
          <li key={entry.id}>
            <div
              className={
                'tree-row' +
                (state.activeId === entry.id ? ' is-active' : '') +
                (entry.kind === 'directory' ? ' is-folder' : '') +
                (readable ? '' : ' is-muted')
              }
              style={{ paddingLeft: depth * 14 + 8 + 'px' }}
              role="treeitem"
              aria-expanded={entry.kind === 'directory' ? open : undefined}
              tabIndex={0}
              onClick={() => {
                if (entry.kind === 'directory') onToggleFolder(entry)
                else if (readable) onOpenFile(entry, true)
              }}
              onDoubleClick={() => {
                if (entry.kind === 'file' && readable) onOpenFile(entry, false)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                if (entry.kind === 'directory') onToggleFolder(entry)
                else if (readable) onOpenFile(entry, false)
              }}
            >
              <span className="tree-twisty" aria-hidden="true">
                {entry.kind === 'directory' ? (open ? '▾' : '▸') : ''}
              </span>
              <EntryIcon entry={entry} />
              <span className="tree-name">{entry.name}</span>
            </div>
            {entry.kind === 'directory' && open && (
              <FileTree
                state={state}
                parentId={entry.id}
                depth={depth + 1}
                showAllFiles={showAllFiles}
                onToggleFolder={onToggleFolder}
                onOpenFile={onOpenFile}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
