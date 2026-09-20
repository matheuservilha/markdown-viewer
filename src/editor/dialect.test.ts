import { describe, expect, it } from 'vitest'
import { markdown } from '@codemirror/lang-markdown'
import { dialect } from './dialect'

const parser = markdown({ extensions: dialect }).language.parser

/** Every node in the tree, as `name(text)`, which is enough to assert shape. */
function nodes(text: string): string[] {
  const out: string[] = []
  parser.parse(text).iterate({
    enter: (node) => {
      out.push(node.name + '(' + text.slice(node.from, node.to) + ')')
    },
  })
  return out
}

const has = (text: string, node: string) => nodes(text).includes(node)

describe('o dialeto', () => {
  it('reconhece marca-texto', () => {
    expect(has('um ==marcado== aqui', 'Highlight(==marcado==)')).toBe(true)
    expect(has('um ==marcado== aqui', 'HighlightMark(==)')).toBe(true)
  })

  it('não abre marca-texto que nunca fecha', () => {
    expect(has('um == solto', 'Highlight(==)')).toBe(false)
  })

  it('reconhece wiki link, e separa o alvo do apelido', () => {
    expect(has('veja [[alvo]]', 'WikilinkText(alvo)')).toBe(true)
    expect(has('veja [[alvo|apelido]]', 'WikilinkText(apelido)')).toBe(true)
    expect(has('veja [[alvo|apelido]]', 'WikilinkPath(alvo|)')).toBe(true)
  })

  it('reconhece o embed de imagem no estilo wiki', () => {
    expect(has('olha ![[foto.png]]', 'Embed(![[foto.png]])')).toBe(true)
    expect(has('olha ![[foto.png]]', 'EmbedTarget(foto.png)')).toBe(true)
  })

  it('distingue embed de wiki link comum', () => {
    expect(has('![[foto.png]]', 'Wikilink([[foto.png]])')).toBe(false)
  })

  it('reconhece referência de nota de rodapé', () => {
    expect(has('um texto[^1] aqui', 'FootnoteRef([^1])')).toBe(true)
    expect(has('um texto[^1] aqui', 'FootnoteLabel(1)')).toBe(true)
  })

  it('não confunde colchete comum com nota de rodapé', () => {
    expect(has('um [texto] aqui', 'FootnoteRef([texto])')).toBe(false)
  })

  it('mantém o que o GitHub já trazia', () => {
    expect(has('~~riscado~~', 'Strikethrough(~~riscado~~)')).toBe(true)
    expect(has('- [x] feito', 'TaskMarker([x])')).toBe(true)
    expect(has('| a |\n|---|\n| 1 |', 'Table(| a |\n|---|\n| 1 |)')).toBe(true)
  })
})
