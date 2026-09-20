import { memo, useDeferredValue, useMemo } from 'react'
import type { Doc, Tab } from '~/app/store'
import { AlertIcon } from './icons'

/** 200 words a minute, the figure Bear and iA Writer both use. */
const WORDS_PER_MINUTE = 200

/**
 * Counts by walking the string instead of splitting it. Splitting a document of
 * a few hundred kilobytes allocates one string per word, and this runs again on
 * every keystroke.
 */
function countWords(text: string): number {
  let words = 0
  let inside = false
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    const blank = code === 32 || code === 10 || code === 9 || code === 13
    if (blank) inside = false
    else if (!inside) {
      inside = true
      words++
    }
  }
  return words
}

interface Props {
  tab: Tab | null
  doc: Doc | null
  onReload: () => void
  onSave: () => void
}

export const StatusBar = memo(function StatusBar({ tab, doc, onReload, onSave }: Props) {
  // The counts are worth having, not worth blocking a keystroke for: React is
  // free to recompute them once the typing pauses.
  const text = useDeferredValue(doc?.text ?? '')
  const counts = useMemo(() => {
    const words = countWords(text)
    return {
      words,
      characters: text.length,
      minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    }
  }, [text])

  if (!tab || !doc) return <footer className="status" />

  return (
    <footer className="status">
      {doc.gone && (
        <span className="status-conflict">
          <AlertIcon size={13} />O arquivo não está mais no disco.
          <button type="button" onClick={onSave}>
            Gravar de novo
          </button>
        </span>
      )}
      {!doc.gone && doc.conflict && (
        <span className="status-conflict">
          <AlertIcon size={13} />O arquivo mudou fora do editor.
          <button type="button" onClick={onSave}>
            Manter o meu
          </button>
          <button type="button" onClick={onReload}>
            Usar o do disco
          </button>
        </span>
      )}
      <span className="status-path">{tab.label ?? tab.path}</span>
      <span className="status-spacer" />
      {doc.shape.lossy && (
        <span className="status-warn">
          <AlertIcon size={13} />
          não é UTF-8, somente leitura
        </span>
      )}
      <span>{doc.shape.eol === '\r\n' ? 'CRLF' : 'LF'}</span>
      <span>{doc.shape.encoding.toUpperCase()}</span>
      <span>{counts.words} palavras</span>
      <span>{counts.characters} caracteres</span>
      <span>{counts.minutes} min de leitura</span>
    </footer>
  )
})
