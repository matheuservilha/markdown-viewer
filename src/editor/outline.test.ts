import { describe, expect, it } from 'vitest'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { dialect } from './dialect'
import { outlineOf } from './outline'

function outline(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: dialect })] })
  ensureSyntaxTree(state, doc.length, 5000)
  return outlineOf(state)
}

describe('outlineOf', () => {
  it('lê os títulos com o nível certo', () => {
    expect(outline('# Um\n\n## Dois\n\n### Três\n').map((h) => [h.level, h.text])).toEqual([
      [1, 'Um'],
      [2, 'Dois'],
      [3, 'Três'],
    ])
  })

  it('tira o fecho de um título fechado dos dois lados', () => {
    expect(outline('## Meio ##\n')[0]?.text).toBe('Meio')
  })

  it('não confunde um # dentro de bloco de código com título', () => {
    expect(outline('# Real\n\n```sh\n# comentário\n```\n')).toHaveLength(1)
  })

  it('guarda onde cada título começa', () => {
    const doc = 'texto\n\n## Alvo\n'
    expect(outline(doc)[0]?.from).toBe(doc.indexOf('## Alvo'))
  })

  it('ignora um título vazio', () => {
    expect(outline('#\n\ntexto\n')).toHaveLength(0)
  })
})
