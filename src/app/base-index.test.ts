import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIndex } from './base-index'
import { entryId } from '~/platform/fs'

/**
 * The index reads through the filesystem port, so the test stands a small
 * folder up behind it instead of mocking the index itself.
 */
const files: Record<string, string> = {}

vi.mock('~/platform', () => ({
  fileSystem: () => ({
    list: async (_baseId: string, path: string) => {
      const prefix = path === '' ? '' : path + '/'
      const seen = new Map<
        string,
        { id: string; baseId: string; path: string; name: string; kind: string }
      >()
      for (const full of Object.keys(files)) {
        if (!full.startsWith(prefix)) continue
        const rest = full.slice(prefix.length)
        const slash = rest.indexOf('/')
        const name = slash < 0 ? rest : rest.slice(0, slash)
        const childPath = prefix + name
        if (!seen.has(childPath)) {
          seen.set(childPath, {
            id: 'b:' + childPath,
            baseId: 'b',
            path: childPath,
            name,
            kind: slash < 0 ? 'file' : 'directory',
          })
        }
      }
      return [...seen.values()]
    },
    stat: async (_baseId: string, path: string) => ({
      size: files[path]?.length ?? 0,
      modifiedAt: 1,
    }),
    read: async (_baseId: string, path: string) => ({ text: files[path] ?? '' }),
  }),
}))

function set(contents: Record<string, string>): void {
  for (const key of Object.keys(files)) delete files[key]
  Object.assign(files, contents)
}

const build = () =>
  buildIndex(
    'b',
    () => {},
    () => false,
  )

describe('buildIndex', () => {
  beforeEach(() => set({}))

  it('acha o título pelo primeiro cabeçalho, e cai no nome do arquivo sem ele', async () => {
    set({ 'a.md': '# O título\n\ncorpo', 'b.md': 'sem título nenhum' })
    const index = await build()
    expect(index.files[entryId('b', 'a.md')]?.title).toBe('O título')
    expect(index.files[entryId('b', 'b.md')]?.title).toBe('b.md')
  })

  it('liga um wiki link ao arquivo que ele aponta', async () => {
    set({ 'origem.md': 'veja [[destino]]', 'destino.md': '# Destino' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'destino.md')]).toEqual([entryId('b', 'origem.md')])
  })

  it('resolve um link com apelido e com âncora', async () => {
    set({ 'origem.md': 'veja [[destino#uma seção|apelido]]', 'destino.md': '# Destino' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'destino.md')]).toHaveLength(1)
  })

  it('resolve link relativo de Markdown', async () => {
    set({ 'pasta/origem.md': 'veja [x](./vizinho.md)', 'pasta/vizinho.md': '# Vizinho' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'pasta/vizinho.md')]).toHaveLength(1)
  })

  it('acha um arquivo pelo nome quando o caminho não bate', async () => {
    set({ 'origem.md': 'veja [[vizinho]]', 'muito/fundo/vizinho.md': '# Vizinho' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'muito/fundo/vizinho.md')]).toHaveLength(1)
  })

  it('ignora endereço da internet', async () => {
    set({ 'a.md': 'veja [x](https://exemplo.com) e [y](mailto:a@b.c)' })
    const index = await build()
    expect(index.files[entryId('b', 'a.md')]?.links).toEqual([])
  })

  it('não conta um link do arquivo para ele mesmo', async () => {
    set({ 'a.md': 'eu sou [[a]]' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'a.md')]).toBeUndefined()
  })

  it('conta duas origens diferentes para o mesmo destino', async () => {
    set({ 'um.md': '[[alvo]]', 'dois.md': '[[alvo]]', 'alvo.md': '# Alvo' })
    const index = await build()
    expect(index.backlinks[entryId('b', 'alvo.md')]).toHaveLength(2)
  })
})
