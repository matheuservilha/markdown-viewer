import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { tableBlocks, tableBlocksField } from './tables'

const TABLE = ['| Coluna | Nota |', '|---|:-:|', '| um | 1 |', '| dois | 2 |'].join('\n')

function state(doc: string, cursor = 0): EditorState {
  return EditorState.create({ doc, selection: { anchor: cursor }, extensions: [tableBlocks] })
}

const found = (doc: string) => state(doc).field(tableBlocksField).tables

describe('encontrar tabelas', () => {
  it('acha uma tabela solta', () => {
    expect(found(TABLE)).toHaveLength(1)
  })

  it('acha as duas quando há duas', () => {
    expect(found(TABLE + '\n\ntexto no meio\n\n' + TABLE)).toHaveLength(2)
  })

  it('não confunde uma linha com barra com uma tabela', () => {
    expect(found('| isto não tem traços embaixo |\ntexto comum')).toHaveLength(0)
  })

  it('exige o mesmo número de colunas na linha de traços', () => {
    expect(found('| a | b |\n|---|\n| 1 | 2 |')).toHaveLength(0)
  })

  it('ignora tabela dentro de bloco de código', () => {
    expect(found('```\n' + TABLE + '\n```\n')).toHaveLength(0)
  })

  it('volta a achar depois que a cerca fecha', () => {
    expect(found('```\nnada\n```\n\n' + TABLE)).toHaveLength(1)
  })

  it('acha uma tabela que o analisador ainda não alcançou', () => {
    // Um documento longo o bastante para a árvore de sintaxe ficar incompleta,
    // que era o que deixava trinta das cinquenta e três tabelas como texto.
    const enchimento = Array.from({ length: 4000 }, (_, i) => 'Parágrafo ' + i + '.').join('\n\n')
    expect(found(enchimento + '\n\n' + TABLE)).toHaveLength(1)
  })
})

describe('desenhar tabelas', () => {
  it('desenha a grade mesmo com o cursor dentro', () => {
    expect(state(TABLE, 5).field(tableBlocksField).decorations.size).toBe(1)
  })

  it('desenha num documento sem tabela nenhuma', () => {
    expect(state('só texto').field(tableBlocksField).decorations.size).toBe(0)
  })
})
