/**
 * What each file in a base links to, and who links back.
 *
 * The index is built in the background when a folder opens, and lives only in
 * memory: it is cheaper to read the files again next session than to keep a
 * cache that can quietly disagree with the disk.
 *
 * Links are pulled with regular expressions rather than by parsing every file.
 * Parsing a thousand notes to find their links costs seconds; reading them with
 * two patterns costs milliseconds, and a link inside a code fence being counted
 * is a smaller error than making somebody wait.
 */

import { fileSystem } from '~/platform'
import { entryId, isTextFile, joinPath, parentPath, type Entry } from '~/platform/fs'

export interface IndexedFile {
  baseId: string
  path: string
  name: string
  /** First heading of the file, or its name when it has none. */
  title: string
  /** Paths inside the base that this file points at. */
  links: string[]
}

export interface BaseIndex {
  files: Record<string, IndexedFile>
  /** Entry id of a file, to the entry ids of the files that point at it. */
  backlinks: Record<string, string[]>
  scanned: number
  total: number
  done: boolean
}

export const EMPTY_INDEX: BaseIndex = {
  files: {},
  backlinks: {},
  scanned: 0,
  total: 0,
  done: false,
}

/** Files past this size are listed but not read: they are not notes. */
const MAX_BYTES = 1024 * 1024
/** How many files are read at once. */
const BATCH = 8

const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g
const FIRST_HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/m

function isRemote(target: string): boolean {
  return /^[a-z][\w+.-]*:/i.test(target)
}

/** `a/b/../c.md` becomes `a/c.md`. */
function normalize(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

function rawLinks(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(WIKILINK)) found.add(match[1]!.trim())
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const target = match[1]!
    if (!isRemote(target)) found.add(decodeURI(target.split('#')[0]!).trim())
  }
  found.delete('')
  return [...found]
}

/**
 * Turns what was written into a path that exists.
 *
 * A link is tried as written, then relative to the file that holds it, then
 * with `.md` on the end, and only then by name anywhere in the folder, which
 * is how wiki links are usually meant.
 */
function resolve(target: string, from: string, paths: Set<string>, byName: Map<string, string>) {
  const here = parentPath(from)
  const candidates = [
    normalize(joinPath(here, target)),
    normalize(target),
    normalize(joinPath(here, target)) + '.md',
    normalize(target) + '.md',
  ]

  for (const candidate of candidates) if (paths.has(candidate)) return candidate

  const name = target.slice(target.lastIndexOf('/') + 1).toLowerCase()
  return byName.get(name) ?? byName.get(name + '.md') ?? null
}

async function collect(baseId: string, path: string, into: Entry[]): Promise<void> {
  let entries: Entry[] = []
  try {
    entries = await fileSystem().list(baseId, path)
  } catch {
    return // a folder that cannot be read is simply not indexed
  }

  for (const entry of entries) {
    if (entry.kind === 'directory') await collect(baseId, entry.path, into)
    else if (isTextFile(entry.name)) into.push(entry)
  }
}

export interface IndexProgress {
  (index: BaseIndex): void
}

export async function buildIndex(
  baseId: string,
  onProgress: IndexProgress,
  shouldStop: () => boolean,
): Promise<BaseIndex> {
  const entries: Entry[] = []
  await collect(baseId, '', entries)

  const index: BaseIndex = { ...EMPTY_INDEX, files: {}, backlinks: {}, total: entries.length }
  onProgress({ ...index })

  const paths = new Set(entries.map((entry) => entry.path))
  const byName = new Map<string, string>()
  for (const entry of entries) byName.set(entry.name.toLowerCase(), entry.path)

  const raw = new Map<string, string[]>()

  for (let start = 0; start < entries.length; start += BATCH) {
    if (shouldStop()) return index

    await Promise.all(
      entries.slice(start, start + BATCH).map(async (entry) => {
        try {
          const stamp = await fileSystem().stat(baseId, entry.path)
          if (stamp && stamp.size > MAX_BYTES) return
          const { text } = await fileSystem().read(baseId, entry.path)
          raw.set(entry.path, rawLinks(text))
          index.files[entry.id] = {
            baseId,
            path: entry.path,
            name: entry.name,
            title: FIRST_HEADING.exec(text)?.[1]?.trim() ?? entry.name,
            links: [],
          }
        } catch {
          // A file that cannot be read this time is left out of the index.
        }
      }),
    )

    index.scanned = Math.min(start + BATCH, entries.length)
    onProgress({ ...index, files: { ...index.files } })
    // Let the interface breathe between batches.
    await new Promise((resolve_) => setTimeout(resolve_, 0))
  }

  // Resolution needs every path to be known, so it happens at the end.
  for (const [path, targets] of raw) {
    const id = entryId(baseId, path)
    const file = index.files[id]
    if (!file) continue

    for (const target of targets) {
      const resolved = resolve(target, path, paths, byName)
      if (!resolved || resolved === path) continue
      file.links.push(resolved)
      const key = entryId(baseId, resolved)
      index.backlinks[key] = [...(index.backlinks[key] ?? []), id]
    }
  }

  index.done = true
  onProgress({ ...index })
  return index
}
