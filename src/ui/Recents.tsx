import { memo, useState } from 'react'
import type { RecentBase, RecentFile, Recents as RecentsData } from '~/app/recents'
import { isPlainText, isTextFile } from '~/platform/fs'
import { ChevronIcon, FileIcon, FolderIcon, MarkdownIcon } from './icons'

/** How many entries the panel shows before the rest is folded away. */
const VISIBLE = 6

interface Props {
  recents: RecentsData
  /** Ids of the folders already open, which do not need reopening. */
  openBases: string[]
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
  onOpenFile,
  onOpenBase,
  onClear,
}: Props) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  // A folder already open needs no shortcut back to itself.
  const folders = recents.bases.filter((base) => !openBases.includes(base.id))
  const files = recents.files
  if (folders.length === 0 && files.length === 0) return null

  const shown = showAll ? files : files.slice(0, VISIBLE)

  return (
    <section className="tree-section">
      <div className="section-head">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronIcon size={12} className={'tree-twisty' + (open ? ' is-open' : '')} />
          <h2 className="section-label">Recentes</h2>
        </button>
        {open && (
          <div className="section-actions">
            <button
              type="button"
              className="section-link"
              title="Esquecer tudo que está listado aqui"
              onClick={onClear}
            >
              limpar
            </button>
          </div>
        )}
      </div>

      {open && (
        <ul className="tree" role="group">
          {folders.map((base) => (
            <li key={base.id}>
              <button
                type="button"
                className="tree-row"
                title={base.label}
                onClick={() => onOpenBase(base)}
              >
                <span className="tree-twisty is-leaf" />
                <FolderIcon size={15} className="tree-icon is-folder" />
                <span className="tree-name">{base.name}</span>
              </button>
            </li>
          ))}

          {shown.map((file) => (
            <li key={file.baseId + ':' + file.path}>
              <button
                type="button"
                className="tree-row"
                title={file.label ?? file.path}
                onClick={() => onOpenFile(file)}
              >
                <span className="tree-twisty is-leaf" />
                <FileMark name={file.name} />
                <span className="tree-name">{file.name}</span>
              </button>
            </li>
          ))}

          {files.length > VISIBLE && (
            <li>
              <button
                type="button"
                className="tree-row is-more"
                onClick={() => setShowAll((value) => !value)}
              >
                <span className="tree-twisty is-leaf" />
                <span className="tree-name">
                  {showAll ? 'mostrar menos' : 'mais ' + (files.length - VISIBLE)}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
})
