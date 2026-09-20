import { memo } from 'react'
import type { RecentBase, RecentFile, Recents as RecentsData } from '~/app/recents'
import { isPlainText, isTextFile } from '~/platform/fs'
import { ChevronIcon, FileIcon, FolderIcon, MarkdownIcon } from './icons'

/** How much history is worth showing. Older than this is noise. */
const LIMIT = 8

interface Props {
  recents: RecentsData
  /** Ids of the folders already open, which need no shortcut back to themselves. */
  openBases: string[]
  open: boolean
  onToggle: () => void
  onOpenFile: (file: RecentFile) => void
  onOpenBase: (base: RecentBase) => void
  onClear: () => void
}

function FileMark({ name }: { name: string }) {
  if (isPlainText(name)) return <FileIcon size={15} className="tree-icon is-text" />
  if (isTextFile(name)) return <MarkdownIcon size={15} className="tree-icon is-markdown" />
  return <FileIcon size={15} className="tree-icon is-other" />
}

export const Recents = memo(function Recents({
  recents,
  openBases,
  open,
  onToggle,
  onOpenFile,
  onOpenBase,
  onClear,
}: Props) {
  const folders = recents.bases.filter((base) => !openBases.includes(base.id))
  const files = recents.files.slice(0, LIMIT)
  if (folders.length === 0 && files.length === 0) return null

  return (
    <div className={'recents' + (open ? ' is-open' : '')}>
      <button type="button" className="foot-row" aria-expanded={open} onClick={onToggle}>
        <ChevronIcon size={14} className={'tree-twisty' + (open ? ' is-open' : '')} />
        <span className="foot-label">Recentes</span>
        <span className="recents-count">{folders.length + files.length}</span>
      </button>

      {open && (
        <ul className="tree recents-list" role="group">
          {folders.map((base) => (
            <li key={base.id}>
              <button
                type="button"
                className="tree-row"
                title={base.label}
                onClick={() => onOpenBase(base)}
              >
                <FolderIcon size={15} className="tree-icon is-folder" />
                <span className="tree-name">{base.name}</span>
              </button>
            </li>
          ))}

          {files.map((file) => (
            <li key={file.baseId + ':' + file.path}>
              <button
                type="button"
                className="tree-row"
                title={file.label ?? file.path}
                onClick={() => onOpenFile(file)}
              >
                <FileMark name={file.name} />
                <span className="tree-name">{file.name}</span>
              </button>
            </li>
          ))}

          <li>
            <button type="button" className="tree-row is-quiet" onClick={onClear}>
              <span className="tree-name">limpar histórico</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
})
