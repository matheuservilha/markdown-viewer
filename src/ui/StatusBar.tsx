import { useMemo } from 'react'
import type { Doc, Tab } from '~/app/store'

/** 200 words a minute, the figure Bear and iA Writer both use. */
const WORDS_PER_MINUTE = 200

interface Props {
  tab: Tab | null
  doc: Doc | null
  onReload: () => void
  onSave: () => void
}

export function StatusBar({ tab, doc, onReload, onSave }: Props) {
  const counts = useMemo(() => {
    if (!doc) return null
    const words = doc.text.trim() === '' ? 0 : doc.text.trim().split(/\s+/).length
    return {
      words,
      characters: doc.text.length,
      minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    }
  }, [doc])

  if (!tab || !doc || !counts) return <footer className="status" />

  return (
    <footer className="status">
      {doc.conflict && (
        <span className="status-conflict">
          O arquivo mudou fora do editor.
          <button type="button" onClick={onSave}>
            Manter o meu
          </button>
          <button type="button" onClick={onReload}>
            Usar o do disco
          </button>
        </span>
      )}
      <span className="status-path">{tab.path}</span>
      <span className="status-spacer" />
      {doc.shape.lossy && <span className="status-warn">não é UTF-8, somente leitura</span>}
      <span>{doc.shape.eol === '\r\n' ? 'CRLF' : 'LF'}</span>
      <span>{doc.shape.encoding.toUpperCase()}</span>
      <span>{counts.words} palavras</span>
      <span>{counts.characters} caracteres</span>
      <span>{counts.minutes} min de leitura</span>
    </footer>
  )
}
