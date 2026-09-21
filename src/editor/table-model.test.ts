import { describe, expect, it } from 'vitest'
import {
  insertColumn,
  insertRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
  splitRow,
  cellRange,
} from './table-model'

const TEXT = ['| A | B |', '|---|:-:|', '| 1 | 2 |', '| 3 | 4 |'].join('\n')

describe('splitRow', () => {
  it('tira as barras das pontas e apara o espaço', () => {
    expect(splitRow('| um | dois |')).toEqual(['um', 'dois'])
  })

  it('respeita a barra escapada dentro da célula', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a | b', 'c'])
  })

  it('aceita linha sem barra nas pontas', () => {
    expect(splitRow('um | dois')).toEqual(['um', 'dois'])
  })
})

describe('parseTable', () => {
  it('lê cabeçalho, alinhamento e corpo', () => {
    expect(parseTable(TEXT)).toEqual({
      header: ['A', 'B'],
      align: ['left', 'center'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    })
  })

  it('completa a linha curta e corta a longa pelo cabeçalho', () => {
    const model = parseTable('| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |')
    expect(model?.rows).toEqual([
      ['1', ''],
      ['1', '2'],
    ])
  })

  it('recusa o que não tem linha de traços', () => {
    expect(parseTable('| A | B |\n| 1 | 2 |')).toBeNull()
  })

  it('recusa quando o traço não tem as mesmas colunas', () => {
    expect(parseTable('| A | B |\n|---|\n| 1 | 2 |')).toBeNull()
  })
})

describe('serializeTable', () => {
  it('volta para Markdown mantendo o alinhamento', () => {
    expect(serializeTable(parseTable(TEXT)!)).toBe(TEXT)
  })

  it('escapa a barra que vier dentro de uma célula', () => {
    const model = setCell(parseTable(TEXT)!, 0, 0, 'a | b')
    expect(serializeTable(model)).toContain('a \\| b')
    expect(parseTable(serializeTable(model))?.rows[0]?.[0]).toBe('a | b')
  })

  it('não deixa uma quebra de linha partir a tabela', () => {
    const model = setCell(parseTable(TEXT)!, 0, 0, 'a\nb')
    expect(serializeTable(model).split('\n')).toHaveLength(4)
  })
})

describe('mudanças de estrutura', () => {
  const model = parseTable(TEXT)!

  it('insere coluna em todas as linhas de uma vez', () => {
    const wider = insertColumn(model, 1)
    expect(wider.header).toEqual(['A', '', 'B'])
    expect(wider.rows).toEqual([
      ['1', '', '2'],
      ['3', '', '4'],
    ])
  })

  it('remove coluna de todas as linhas', () => {
    expect(removeColumn(model, 0).rows).toEqual([['2'], ['4']])
  })

  it('nunca remove a última coluna', () => {
    const single = parseTable('| A |\n|---|\n| 1 |')!
    expect(removeColumn(single, 0)).toEqual(single)
  })

  it('insere e remove linha', () => {
    expect(insertRow(model, 1).rows).toEqual([
      ['1', '2'],
      ['', ''],
      ['3', '4'],
    ])
    expect(removeRow(model, 0).rows).toEqual([['3', '4']])
  })

  it('escreve no cabeçalho com a linha -1', () => {
    expect(setCell(model, -1, 1, 'Novo').header).toEqual(['A', 'Novo'])
  })
})

describe('cellRange', () => {
  const text = ['| A | B |', '|---|:-:|', '| 1 | 2 |'].join('\n')
  const slice = (row: number, column: number) => {
    const range = cellRange(text, row, column)
    return range ? text.slice(range.from, range.to) : null
  }

  it('acha a célula do cabeçalho', () => {
    expect(slice(-1, 0)).toBe(' A ')
    expect(slice(-1, 1)).toBe(' B ')
  })

  it('acha a célula do corpo, pulando a linha de traços', () => {
    expect(slice(0, 0)).toBe(' 1 ')
    expect(slice(0, 1)).toBe(' 2 ')
  })

  it('devolve nulo para coluna que não existe', () => {
    expect(slice(0, 5)).toBeNull()
  })

  it('devolve nulo para linha que não existe', () => {
    expect(slice(9, 0)).toBeNull()
  })
})

describe('cellRange sem pipe externo', () => {
  const text = ['A | B', '---|---', '1 | 2'].join('\n')
  it('acha as células mesmo assim', () => {
    const range = cellRange(text, 0, 1)
    expect(range && text.slice(range.from, range.to)).toBe(' 2')
  })
})
