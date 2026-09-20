import { describe, expect, it } from 'vitest'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { dialect } from './dialect'
import { parseTable, tableBlocks } from './tables'

const TABLE = ['| Coluna | Nota |', '|---|:---:|', '| um | 1 |', '| dois | 2 |'].join('\n')

function state(doc: string, cursor = 0): EditorState {
  const created = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ extensions: dialect }), tableBlocks],
  })
  // The tree is what the field reads, so it has to exist before we look.
  ensureSyntaxTree(created, doc.length, 5000)
  return created
}

describe('parseTable', () => {
  it('lê cabeçalho, corpo e alinhamento', () => {
    const parsed = parseTable(state(TABLE), 0, TABLE.length)
    expect(parsed.header?.cells.map((cell) => cell.text.trim())).toEqual(['Coluna', 'Nota'])
    expect(parsed.align).toEqual(['left', 'center'])
    expect(parsed.body.map((row) => row.cells.map((cell) => cell.text.trim()))).toEqual([
      ['um', '1'],
      ['dois', '2'],
    ])
  })

  it('guarda onde cada célula começa, que é o que o clique usa', () => {
    const parsed = parseTable(state(TABLE), 0, TABLE.length)
    const first = parsed.header!.cells[0]!
    expect(TABLE.slice(first.from, first.from + first.text.length)).toBe(first.text)
  })

  it('não se perde com uma barra escapada dentro da célula', () => {
    const doc = '| a \\| b | c |\n|---|---|\n| 1 | 2 |'
    const parsed = parseTable(state(doc), 0, doc.length)
    expect(parsed.header?.cells).toHaveLength(2)
  })
})

describe('tableBlocks', () => {
  const drawn = (cursor: number) => state(TABLE + '\n\ndepois\n', cursor).field(tableBlocks)

  it('desenha a grade quando o cursor está longe', () => {
    expect(drawn(TABLE.length + 4).decorations.size).toBe(1)
  })

  it('devolve o texto quando o cursor entra na tabela', () => {
    expect(drawn(5).decorations.size).toBe(0)
  })

  it('guarda onde estão as tabelas para não varrer a árvore a cada tecla', () => {
    expect(drawn(TABLE.length + 4).tables).toHaveLength(1)
  })
})
