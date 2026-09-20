/**
 * Images drawn in place.
 *
 * The file on disk keeps its Markdown. What the widget does is read the bytes
 * through the filesystem port and hand the web view a blob URL, because neither
 * a browser page nor the desktop web view may load an arbitrary local path.
 */

import { Facet } from '@codemirror/state'
import { WidgetType, type EditorView } from '@codemirror/view'
import { fileSystem } from '~/platform'
import { parentPath } from '~/platform/fs'

/** Which file the editor is showing, so relative paths can be resolved. */
export const documentSource = Facet.define<Source, Source | null>({
  combine: (values) => values[0] ?? null,
})

export interface Source {
  baseId: string
  path: string
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

export function mimeOf(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return MIME[extension] ?? 'application/octet-stream'
}

export function isImagePath(path: string): boolean {
  return mimeOf(path) !== 'application/octet-stream'
}

/** `a/b/../c.png` becomes `a/c.png`. */
function normalize(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

/**
 * Blob URLs are kept for as long as the app runs. They are cheap handles, and
 * revoking one while a decoration still points at it shows a broken image.
 */
const resolved = new Map<string, string>()
const failed = new Set<string>()

export async function resolveImage(source: Source, src: string): Promise<string | null> {
  if (/^(https?:|data:|blob:)/i.test(src)) return src

  const wanted = decodeURI(src)
  // Relative to the document first, then from the root of the base, which is
  // how a wiki-style embed is usually written.
  const candidates = [normalize(parentPath(source.path) + '/' + wanted), normalize(wanted)]

  for (const path of candidates) {
    const key = source.baseId + ':' + path
    const cached = resolved.get(key)
    if (cached) return cached
    if (failed.has(key)) continue

    try {
      const bytes = await fileSystem().readBinary(source.baseId, path)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }))
      resolved.set(key, url)
      return url
    } catch {
      failed.add(key)
    }
  }

  return null
}

export type ImageKind = 'markdown' | 'embed'

export interface ImageSpec {
  kind: ImageKind
  /** Alt text for a Markdown image, target file for an embed. */
  label: string
  src: string
  /** Width in px, from the `|300` suffix both dialects use. */
  width: number | null
}

const MARKDOWN_IMAGE = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)$/
const EMBED = /^!\[\[([^\]]+)\]\]$/

export function parseImage(text: string): ImageSpec | null {
  const embed = EMBED.exec(text)
  if (embed) {
    const { name, width } = splitWidth(embed[1]!)
    return { kind: 'embed', label: name, src: name, width }
  }

  const image = MARKDOWN_IMAGE.exec(text)
  if (!image) return null
  const { name, width } = splitWidth(image[1]!)
  return { kind: 'markdown', label: name, src: image[2]!, width }
}

function splitWidth(text: string): { name: string; width: number | null } {
  const bar = text.lastIndexOf('|')
  if (bar < 0) return { name: text, width: null }
  const width = Number(text.slice(bar + 1).trim())
  if (!Number.isFinite(width) || width <= 0) return { name: text, width: null }
  return { name: text.slice(0, bar), width: Math.round(width) }
}

/** Writes the spec back as Markdown, which is what a resize actually changes. */
export function writeImage(spec: ImageSpec, width: number | null): string {
  const label = width === null ? spec.label : spec.label + '|' + width
  return spec.kind === 'embed' ? '![[' + label + ']]' : '![' + label + '](' + spec.src + ')'
}

const MIN_WIDTH = 48

export class ImageWidget extends WidgetType {
  constructor(
    private readonly spec: ImageSpec,
    private readonly source: Source,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return (
      other.from === this.from &&
      other.spec.src === this.spec.src &&
      other.spec.width === this.spec.width &&
      other.spec.label === this.spec.label
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement('span')
    frame.className = 'cm-md-image'

    const image = document.createElement('img')
    image.alt = this.spec.kind === 'embed' ? this.spec.label : this.spec.label
    image.draggable = false
    if (this.spec.width) image.style.width = this.spec.width + 'px'

    void resolveImage(this.source, this.spec.src).then((url) => {
      if (url) image.src = url
      else frame.classList.add('is-missing')
    })

    const handle = document.createElement('span')
    handle.className = 'cm-md-image-handle'
    handle.title = 'Arraste para redimensionar'
    handle.addEventListener('pointerdown', (event) => this.startResize(event, view, image))

    frame.append(image, handle)
    return frame
  }

  /**
   * Resizing writes the new width into the Markdown, so the size survives the
   * file being closed, and travels with it to any other editor that reads the
   * same `|300` suffix.
   */
  private startResize(event: PointerEvent, view: EditorView, image: HTMLImageElement): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = image.getBoundingClientRect().width
    let width = Math.round(startWidth)

    const onMove = (move: PointerEvent) => {
      width = Math.max(MIN_WIDTH, Math.round(startWidth + move.clientX - startX))
      image.style.width = width + 'px'
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: writeImage(this.spec, width) },
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  ignoreEvent(): boolean {
    return false
  }
}
