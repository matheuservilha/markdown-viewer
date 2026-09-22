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

describe('outlineOf em um documento longo', () => {
  /** Um arquivo com mais de uma tela: a primeira leitura não alcança o fim. */
  const longo =
    '---\ntags: [a]\n---\n\n' +
    Array.from({ length: 120 }, (_, n) => `Parágrafo ${n} de enchimento, com bastante texto.`).join(
      '\n\n',
    ) +
    '\n\n## Seção lá embaixo\n\ntexto\n\n### Subseção lá embaixo\n'

  it('alcança os títulos abaixo da primeira tela sem ninguém forçar o parse', () => {
    // De propósito sem `ensureSyntaxTree` antes: é exatamente o que o app faz,
    // e era por isso que o sumário parava na primeira tela.
    const state = EditorState.create({
      doc: longo,
      extensions: [markdown({ extensions: dialect })],
    })
    expect(outlineOf(state).map((h) => h.text)).toEqual(['Seção lá embaixo', 'Subseção lá embaixo'])
  })
})

describe('outlineOf e o front matter', () => {
  it('não conta a última linha do front matter como título', () => {
    // As três barras que fecham o bloco ficam debaixo da última linha dele, e
    // três barras debaixo de uma linha de texto é como o Markdown escreve um
    // título de nível dois.
    const state = EditorState.create({
      doc: '---\ntags: [a]\nupdated: 2026-09-16\n---\n\n## De verdade\n',
      extensions: [markdown({ extensions: dialect })],
    })
    expect(outlineOf(state).map((h) => h.text)).toEqual(['De verdade'])
  })

  it('não confunde um documento que começa com uma régua', () => {
    const state = EditorState.create({
      doc: '---\n\n## Primeiro\n',
      extensions: [markdown({ extensions: dialect })],
    })
    expect(outlineOf(state).map((h) => h.text)).toEqual(['Primeiro'])
  })
})
