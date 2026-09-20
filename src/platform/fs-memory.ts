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

## Imagem

![Um exemplo|240](imagens/exemplo.png)

E um embed, no estilo do Obsidian: ![[imagens/exemplo.png|120]]

## Nota de rodapé

O texto cita uma fonte[^1] e segue em frente.

[^1]: A nota fica aqui embaixo, desenhada à parte do texto.

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

/** A small PNG, so the demo folder has a real image to draw. */
const SAMPLE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAADDElEQVR42u3Q5VaUURQG4H1nYneL3Up3d9fQDN1wV/QMOZSCgoCCouecb2aWP779XsG71nMFj/xNunAelXCenPAn+aKVcsm5/DvVuGKlXTXO0q6dpXuuG6cZN5ybp5nGrV9G1m3nzs9s466Vc884se6f5BoPjOO8h86j43zj8ZFR8MRJPCpM/GE9tYqeHVrPD4uNF8ZByUvn1UGp8fq7UfYm5u23cuOdVfHe2K/4sF9pfDT2qj45n/eqra/VSVZNspPypdZIterSjN269N16I8MQ7oCd3YZM4Q7Y2XFB3FF3XBB39J2dhizhDtjZafSCuKPsbDdmC3fATjyIO/472005wh2wY4O4A3a2m3KFO2Bnq9kL4o6ys9WcJ9wBO9Eg7mg7Wy35wh2w44K4o+9sthQId8DOZsAGcUfdiQZxR9vZDBQKd8BOPIg7/juR1iLhDthxQdzRdyKtxcIdsBNpKxbugJ1IW4lwB+xsxIK447+z0V4q3AE7Nog7YGejvUy4A3bWO7wg7ig76x3lwh2wEw3ijraz3lkh3AE7XhB31J01G8QdfWets1K4A3bWulwQd7Sdta4q4Q7YiQdxx39ntbtauAN2XBB39J3V7hrhDthZ7akR7oCd1Z5a4Q7YWYkFccd/ZyVYJ9wBOy6IO/rOSrBeuAN2VnptEHfUneVoEHeUneXeBuEO2LFB3AE7y32Nwh2wE7ZB3NF3wn1Nwh2wE+53QdzRdsL9zcIdsBMP4o7/TmigRbgDdlwQd/Sd0EBAuAN2QoMB4Q7YCQ22CnfAztJ/Qdzx2VkaahPugB0viDvqjg3iDthZGmoX7oCdxWEviDvKzuJwh3AH7ESDuKPtLI50CnfAjgvijr6zMNIl3AE7C6MuiDvazsJot3AH7MSDuOO/Mz/WI9wBOy6IO/rO/FhQuAN25seDwh2wEwvijrIzN94r3AE78SDu+O/MTfQJd8CODeIO2Jmb6BfugJ3ZSS+IO8rO7OSAcAfsRIO4o+3MTg0Kd8COC+KOvjMzNSTcATsz014Qd5Sdmenhf1ZJY6+znbuKAAAAAElFTkSuQmCC'

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
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
  private readonly folders = new Set<string>(['notas', 'imagens'])

  private readonly binaries = new Map<string, Uint8Array>([
    ['imagens/exemplo.png', decodeBase64(SAMPLE_IMAGE_BASE64)],
  ])

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

    for (const full of [...this.files.keys(), ...this.binaries.keys(), ...this.folders]) {
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

    return [...seen.values()].toSorted(compareEntries)
  }

  readonly can: Capabilities = { trash: true, reveal: false, absolutePath: true }

  async readBinary(baseId: string, path: string): Promise<Uint8Array> {
    const bytes = this.binaries.get(path)
    if (bytes) return bytes
    return new TextEncoder().encode(this.require(baseId, path).text)
  }

  async openTemporary(): Promise<void> {
    throw new Error('Não há sistema de arquivos atrás de uma pasta em memória.')
  }

  async saveAs(): Promise<string | null> {
    // Nothing in memory has a place on disk to be saved to.
    return null
  }

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
    // The copy is required: the loop writes new keys into the same map, and
    // walking it live would visit what it had just written.
    // oxlint-disable-next-line no-useless-spread
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
    // oxlint-disable-next-line no-useless-spread
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
