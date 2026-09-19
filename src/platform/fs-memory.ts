/**
 * In-memory adapter, for development and tests.
 *
 * It exists because the other adapters need a native folder dialog, which a test
 * cannot drive. Reached with `?demo` in the URL.
 */

import {
  compareEntries,
  entryId,
  joinPath,
  type Base,
  type Entry,
  type FileSystem,
  type FileVersion,
  type LoadedFile,
} from './fs'
import { decode } from './text'

const SAMPLE = `---
tags:
  - projeto
  - metodo
aliases:
  - Exemplo do editor
Período: 2026-09-19, em andamento
updated: 2026-09-19
---

# Escrita seamless

A marcação some quando o cursor sai da linha, e volta quando ele entra. O texto no
disco continua **Markdown puro**, com *ênfase*, ~~riscado~~, ==marca-texto== e
\`código inline\`.

## Listas e tarefas

- um item comum
- outro item
- [ ] tarefa aberta
- [x] tarefa fechada

1. primeiro
2. segundo

## Citação

> A verdade é o arquivo em disco, não um banco de dados nosso.

## Bloco de código

\`\`\`ts
export function soma(a: number, b: number): number {
  return a + b
}
\`\`\`

## Callouts

> [!abstract] O que é este exemplo
> Um arquivo só, com uma amostra de cada coisa que o editor desenha.

> [!tip] Dica
> A marcação volta quando o cursor entra na linha.

> [!warning] Atenção
> O texto no disco não muda. O que muda é só o desenho.

> [!success] Pronto
> Callout de tipo desconhecido cai no neutro, em vez de virar citação.

## Tabela

| Plataforma | Prioridade | O que pesa |
|---|:---:|---|
| macOS | 1 | é a plataforma de referência do visual |
| Windows | 2 | mesma base de código |
| Web | 3 | depende da File System Access API |

## Links

Um [link comum](https://bear.app), um [[wiki link]] e um [[notas/soltas|com apelido]].

---

Fim do exemplo.
`

const NOTES = `# Notas soltas

Texto com uma linha só para testar a troca de aba.
`

const PLAIN = `Isto é um .txt.

Não interpreta Markdown: o # abaixo continua um # na tela.

# não é um título
`

interface MemoryFile {
  text: string
  version: FileVersion
}

function file(text: string): MemoryFile {
  return { text, version: { size: text.length, modifiedAt: Date.now() } }
}

export class MemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, MemoryFile>([
    ['exemplo.md', file(SAMPLE)],
    ['notas/soltas.md', file(NOTES)],
    ['notas/puro.txt', file(PLAIN)],
    ['leiame.markdown', file('# Leia-me\n\nOutro arquivo.\n')],
  ])

  async openBase(): Promise<Base> {
    return { id: 'demo', name: 'Pasta de exemplo', label: '/exemplo' }
  }

  async list(baseId: string, path: string): Promise<Entry[]> {
    const prefix = path === '' ? '' : path + '/'
    const seen = new Map<string, Entry>()

    for (const full of this.files.keys()) {
      if (!full.startsWith(prefix)) continue
      const rest = full.slice(prefix.length)
      const slash = rest.indexOf('/')
      const name = slash < 0 ? rest : rest.slice(0, slash)
      const childPath = joinPath(path, name)
      if (seen.has(childPath)) continue
      seen.set(childPath, {
        id: entryId(baseId, childPath),
        baseId,
        path: childPath,
        name,
        kind: slash < 0 ? 'file' : 'directory',
      })
    }

    return [...seen.values()].sort(compareEntries)
  }

  async read(_baseId: string, path: string): Promise<LoadedFile> {
    const found = this.require(path)
    const { text, shape } = decode(new TextEncoder().encode(found.text))
    return { text, shape, version: found.version }
  }

  async write(_baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion> {
    const text = new TextDecoder().decode(bytes)
    const version = { size: bytes.byteLength, modifiedAt: Date.now() }
    this.files.set(path, { text, version })
    return version
  }

  async stat(_baseId: string, path: string): Promise<FileVersion | null> {
    return this.files.get(path)?.version ?? null
  }

  private require(path: string): MemoryFile {
    const found = this.files.get(path)
    if (!found) throw new Error('Arquivo inexistente: ' + path)
    return found
  }
}
