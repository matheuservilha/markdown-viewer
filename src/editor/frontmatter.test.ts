import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { bodyStart, findFrontmatter, frontmatterBlock, parseProperties } from './frontmatter'

const state = (doc: string) => EditorState.create({ doc, extensions: [frontmatterBlock] })

describe('findFrontmatter', () => {
  it('acha o bloco quando ele abre a primeira linha', () => {
    const found = findFrontmatter(state('---\ntags: um\n---\n\ncorpo\n'))
    expect(found).not.toBeNull()
    expect(found!.from).toBe(0)
    expect(found!.to).toBe(16)
  })

  it('ignora um traço que não está na primeira linha', () => {
    expect(findFrontmatter(state('# título\n\n---\nnão é front matter\n---\n'))).toBeNull()
  })

  it('ignora um bloco que nunca fecha', () => {
    expect(findFrontmatter(state('---\ntags: um\n\ncorpo sem fechar\n'))).toBeNull()
  })

  it('não confunde com um separador horizontal logo no começo', () => {
    // Sem uma segunda cerca, não há bloco: é só uma régua.
    expect(findFrontmatter(state('---\n\ntexto\n'))).toBeNull()
  })
})

describe('bodyStart', () => {
  it('leva o cursor para depois do bloco', () => {
    expect(bodyStart('---\ntags: um\n---\ncorpo\n')).toBe(17)
  })

  it('deixa o cursor no começo quando não há bloco', () => {
    expect(bodyStart('# só o texto\n')).toBe(0)
  })
})

describe('parseProperties', () => {
  it('lê par e lista', () => {
    expect(parseProperties('tags:\n  - um\n  - dois\nupdated: 2026-09-19')).toEqual([
      { key: 'tags', values: ['um', 'dois'], list: true },
      { key: 'updated', values: ['2026-09-19'], list: false },
    ])
  })

  it('não perde uma chave sem valor', () => {
    expect(parseProperties('aliases:')).toEqual([{ key: 'aliases', values: [], list: false }])
  })
})

describe('frontmatterBlock', () => {
  const decorations = (doc: string, cursor: number) => {
    const base = state(doc)
    const moved = base.update({ selection: { anchor: cursor } }).state
    return moved.field(frontmatterBlock).decorations.size
  }

  it('fecha o bloco quando o cursor está no corpo', () => {
    expect(decorations('---\ntags: um\n---\n\ncorpo\n', 20)).toBe(1)
  })

  it('abre o bloco quando o cursor entra nele', () => {
    expect(decorations('---\ntags: um\n---\n\ncorpo\n', 6)).toBe(0)
  })

  it('não desenha nada num arquivo sem bloco', () => {
    expect(decorations('# só texto\n', 0)).toBe(0)
  })
})
