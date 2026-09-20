import { memo, useState } from 'react'
import type { BaseIndex } from '~/app/base-index'
import type { Tab } from '~/app/store'
import type { Heading } from '~/editor/outline'
import { entryId } from '~/platform/fs'
import { MarkdownIcon } from './icons'

type Page = 'sumario' | 'links'

interface Props {
  tab: Tab
  headings: Heading[]
  index: BaseIndex | undefined
  onGoTo: (position: number) => void
  onOpenPath: (baseId: string, path: string) => void
}

export const InfoPanel = memo(function InfoPanel({
  tab,
  headings,
  index,
  onGoTo,
  onOpenPath,
}: Props) {
  const [page, setPage] = useState<Page>('sumario')

  return (
    <aside className="info">
      <div className="info-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={page === 'sumario'}
          className={'info-tab' + (page === 'sumario' ? ' is-active' : '')}
          onClick={() => setPage('sumario')}
        >
          Sumário
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === 'links'}
          className={'info-tab' + (page === 'links' ? ' is-active' : '')}
          onClick={() => setPage('links')}
        >
          Links
        </button>
      </div>

      <div className="info-body">
        {page === 'sumario' ? (
          <Outline headings={headings} onGoTo={onGoTo} />
        ) : (
          <Links tab={tab} index={index} onOpenPath={onOpenPath} />
        )}
      </div>
    </aside>
  )
})

function Outline({ headings, onGoTo }: { headings: Heading[]; onGoTo: (at: number) => void }) {
  if (headings.length === 0) {
    return <p className="info-empty">Este arquivo não tem títulos.</p>
  }

  // The smallest level present becomes the left edge, so a file that starts at
  // `##` does not sit indented for no reason.
  const top = Math.min(...headings.map((heading) => heading.level))

  return (
    <ul className="info-list">
      {headings.map((heading) => (
        <li key={heading.from}>
          <button
            type="button"
            className="info-row"
            style={{ paddingLeft: 0.5 + (heading.level - top) * 0.75 + 'rem' }}
            title={heading.text}
            onClick={() => onGoTo(heading.from)}
          >
            <span className="info-level">H{heading.level}</span>
            <span className="info-name">{heading.text}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface LinksProps {
  tab: Tab
  index: BaseIndex | undefined
  onOpenPath: (baseId: string, path: string) => void
}

function Links({ tab, index, onOpenPath }: LinksProps) {
  if (!index) {
    return <p className="info-empty">Um arquivo aberto de fora não pertence a nenhuma pasta.</p>
  }

  if (!index.done) {
    const percent = index.total === 0 ? 0 : Math.round((index.scanned / index.total) * 100)
    return (
      <p className="info-empty">
        Lendo a pasta: {index.scanned} de {index.total} arquivos ({percent}%).
      </p>
    )
  }

  const id = entryId(tab.baseId, tab.path)
  const incoming = index.backlinks[id] ?? []
  const outgoing = index.files[id]?.links ?? []

  const label = (entry: string) => index.files[entry]?.title ?? entry.slice(entry.indexOf(':') + 1)

  return (
    <>
      <p className="info-title">Apontam para este ({incoming.length})</p>
      {incoming.length === 0 ? (
        <p className="info-empty">Nenhum arquivo aponta para este.</p>
      ) : (
        <ul className="info-list">
          {incoming.map((entry) => {
            const file = index.files[entry]
            return (
              <li key={entry}>
                <button
                  type="button"
                  className="info-row"
                  title={file?.path}
                  onClick={() => file && onOpenPath(file.baseId, file.path)}
                >
                  <MarkdownIcon size={14} className="tree-icon is-markdown" />
                  <span className="info-name">{label(entry)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="info-title">Este aponta para ({outgoing.length})</p>
      {outgoing.length === 0 ? (
        <p className="info-empty">Este arquivo não aponta para nenhum outro.</p>
      ) : (
        <ul className="info-list">
          {outgoing.map((path) => (
            <li key={path}>
              <button
                type="button"
                className="info-row"
                title={path}
                onClick={() => onOpenPath(tab.baseId, path)}
              >
                <MarkdownIcon size={14} className="tree-icon is-markdown" />
                <span className="info-name">
                  {index.files[entryId(tab.baseId, path)]?.title ?? path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
