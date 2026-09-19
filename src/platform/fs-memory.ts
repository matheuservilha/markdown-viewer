/**
 * In-memory adapter, for development and tests.
 *
 * It exists because the other adapters need a native folder dialog, which a test
 * cannot drive. Reached with `?demo` in the URL.
 */

import {
  baseName,
  compareEntries,
  copyName,
  entryId,
  joinPath,
  parentPath,
  type Base,
  type Entry,
  type FileSystem,
  type FileVersion,
  type LoadedFile,
  type LooseFile,
  type Capabilities,
  type Restored,
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

/**
 * A large document, generated rather than pasted, so that the performance of
 * the editor can be exercised without carrying a 200 kB fixture in the repo.
 */
function bigDocument(sections: number): string {
  const parts: string[] = ['# Documento grande\n']
  for (let index = 1; index <= sections; index++) {
    parts.push(
      `## Seção ${index}\n`,
      `Parágrafo com **negrito**, *itálico*, \`código\` e um [[wiki link ${index}]]. ` +
        'O texto existe para dar volume ao documento e medir o custo de rolar, ' +
        'selecionar e digitar num arquivo de tamanho realista.\n',
      `- item um da seção ${index}`,
      `- item dois da seção ${index}`,
      `- [ ] tarefa aberta ${index}\n`,
      `> [!note] Nota ${index}\n> Um callout para custar decoração de bloco.\n`,
      '```ts',
      `export function secao${index}(valor: number): number {`,
      '  return valor * 2',
      '}',
      '```\n',
      '| Coluna A | Coluna B |',
      '|---|---|',
      `| linha ${index} | valor ${index} |\n`,
    )
  }
  return parts.join('\n')
}

interface MemoryFile {
  text: string
  version: FileVersion
}

function file(text: string): MemoryFile {
  return { text, version: { size: text.length, modifiedAt: Date.now() } }
}

export class MemoryFileSystem implements FileSystem {
  /** Files opened outside every base, addressed by their own base id. */
  private readonly loose = new Map<string, MemoryFile>()

  /** Folders that exist without holding a file, which paths alone cannot show. */
  private readonly folders = new Set<string>(['notas'])

  private readonly files = new Map<string, MemoryFile>([
    ['exemplo.md', file(SAMPLE)],
    ['notas/soltas.md', file(NOTES)],
    ['notas/puro.txt', file(PLAIN)],
    ['leiame.markdown', file('# Leia-me\n\nOutro arquivo.\n')],
    ['grande.md', file(bigDocument(120))],
  ])

  async openBase(): Promise<Base> {
    return { id: 'demo', name: 'Pasta de exemplo', label: '/exemplo' }
  }

  /** Stands in for the system dialog, so the loose-file path can be exercised. */
  async openFile(): Promise<LooseFile | null> {
    const baseId = 'solto' + this.loose.size
    this.loose.set(baseId, file('# Arquivo solto\n\nAberto de fora de qualquer base.\n'))
    return { baseId, name: 'solto.md', label: '/Users/exemplo/Documentos/solto.md' }
  }

  async restoreBase(baseId: string): Promise<Restored<Base>> {
    if (baseId !== 'demo') return { status: 'gone' }
    return { status: 'ok', value: await this.openBase() }
  }

  async restoreFile(): Promise<Restored<LooseFile>> {
    // Nothing in memory outlives a reload.
    return { status: 'gone' }
  }

  async list(baseId: string, path: string): Promise<Entry[]> {
    const prefix = path === '' ? '' : path + '/'
    const seen = new Map<string, Entry>()

    for (const full of [...this.files.keys(), ...this.folders]) {
      if (!full.startsWith(prefix)) continue
      const rest = full.slice(prefix.length)
      const slash = rest.indexOf('/')
      const name = slash < 0 ? rest : rest.slice(0, slash)
      if (name === '') continue
      const childPath = joinPath(path, name)
      if (seen.has(childPath)) continue
      const kind = slash < 0 && !this.folders.has(childPath) ? 'file' : 'directory'
      seen.set(childPath, { id: entryId(baseId, childPath), baseId, path: childPath, name, kind })
    }

    return [...seen.values()].sort(compareEntries)
  }

  readonly can: Capabilities = { trash: true, reveal: false, absolutePath: true }

  async createFile(baseId: string, path: string): Promise<Entry> {
    if (this.files.has(path)) throw new Error('Já existe: ' + path)
    this.files.set(path, file(''))
    return this.entry(baseId, path, 'file')
  }

  async createFolder(baseId: string, path: string): Promise<Entry> {
    this.folders.add(path)
    return this.entry(baseId, path, 'directory')
  }

  async move(baseId: string, from: string, to: string): Promise<Entry> {
    const directory = this.folders.has(from)
    for (const key of [...this.files.keys()]) {
      if (key !== from && !key.startsWith(from + '/')) continue
      const moved = this.files.get(key)!
      this.files.delete(key)
      this.files.set(to + key.slice(from.length), moved)
    }
    if (directory) {
      this.folders.delete(from)
      this.folders.add(to)
    }
    return this.entry(baseId, to, directory ? 'directory' : 'file')
  }

  async duplicate(baseId: string, path: string): Promise<Entry> {
    const source = this.require(baseId, path)
    let name = copyName(baseName(path), 'copia')
    for (let attempt = 2; this.files.has(joinPath(parentPath(path), name)); attempt++) {
      name = copyName(baseName(path), 'copia ' + attempt)
    }
    const target = joinPath(parentPath(path), name)
    this.files.set(target, file(source.text))
    return this.entry(baseId, target, 'file')
  }

  async trash(_baseId: string, path: string): Promise<void> {
    for (const key of [...this.files.keys()]) {
      if (key === path || key.startsWith(path + '/')) this.files.delete(key)
    }
    this.folders.delete(path)
  }

  async reveal(): Promise<void> {
    throw new Error('Não há Finder atrás de uma pasta em memória.')
  }

  absolutePath(_baseId: string, path: string): string {
    return '/exemplo/' + path
  }

  private entry(baseId: string, path: string, kind: 'file' | 'directory'): Entry {
    return { id: entryId(baseId, path), baseId, path, name: baseName(path), kind }
  }

  async read(baseId: string, path: string): Promise<LoadedFile> {
    const found = this.require(baseId, path)
    const { text, shape } = decode(new TextEncoder().encode(found.text))
    return { text, shape, version: found.version }
  }

  async write(baseId: string, path: string, bytes: Uint8Array<ArrayBuffer>): Promise<FileVersion> {
    const text = new TextDecoder().decode(bytes)
    const version = { size: bytes.byteLength, modifiedAt: Date.now() }
    const target = path === '' ? this.loose : this.files
    target.set(path === '' ? baseId : path, { text, version })
    return version
  }

  async stat(baseId: string, path: string): Promise<FileVersion | null> {
    const found = path === '' ? this.loose.get(baseId) : this.files.get(path)
    return found?.version ?? null
  }

  /** An empty path means the base is the file itself. */
  private require(baseId: string, path: string): MemoryFile {
    const found = path === '' ? this.loose.get(baseId) : this.files.get(path)
    if (!found) throw new Error('Arquivo inexistente: ' + (path || baseId))
    return found
  }
}
