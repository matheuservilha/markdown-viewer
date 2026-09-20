/**
 * Markdown to a PDF with real text.
 *
 * It walks the same syntax tree the editor draws from, like the HTML export
 * does, and hands the result to a layout engine instead of photographing a web
 * page. The text in the file is text: it can be selected, searched and copied,
 * the file weighs a fraction of a rasterised one, and a page break can never
 * fall through the middle of a line because the engine decides where pages end.
 *
 * The cost is that the typography is the engine's, not the editor's: the shapes
 * are close but not identical, because the fonts a PDF can embed are not the
 * ones loaded in the interface.
 */

import { markdown } from '@codemirror/lang-markdown'
import type { SyntaxNode } from '@lezer/common'
import { parseCallout } from './callouts'
import { dialect } from './dialect'
import { mimeOf, parseImage, resolveImage, type Source } from './images'

const parser = markdown({ extensions: dialect }).language.parser

/** Paper is white everywhere, so the palette is the light one, always. */
const PALETTE = {
  text: '#16151d',
  dim: '#4f4d5c',
  faint: '#85828f',
  accent: '#c2410c',
  border: '#dcdce7',
  codeBg: '#f4f4f8',
  mark: '#fdeeb8',
  blue: '#2f6ab8',
  teal: '#17797a',
  green: '#2c7a46',
  yellow: '#8a6a15',
  orange: '#ab6318',
  red: '#b3382f',
  purple: '#6b3fa0',
}

const TONES: Record<string, { line: string; fill: string }> = {
  note: { line: PALETTE.blue, fill: '#eaf1fb' },
  abstract: { line: PALETTE.teal, fill: '#e3f3f3' },
  tip: { line: PALETTE.green, fill: '#e6f4ea' },
  success: { line: PALETTE.green, fill: '#e6f4ea' },
  question: { line: PALETTE.yellow, fill: '#f8f1dd' },
  important: { line: PALETTE.purple, fill: '#f0e9fa' },
  example: { line: PALETTE.purple, fill: '#f0e9fa' },
  warning: { line: PALETTE.orange, fill: '#fbeee1' },
  caution: { line: PALETTE.red, fill: '#fbe9e7' },
  failure: { line: PALETTE.red, fill: '#fbe9e7' },
  bug: { line: PALETTE.red, fill: '#fbe9e7' },
  quote: { line: PALETTE.faint, fill: '#f2f2f6' },
}

/** Width of the text column, in points: A4 minus the margins. */
const COLUMN = 483

interface Style {
  bold?: boolean
  italics?: boolean
  color?: string
  background?: string
  font?: string
  fontSize?: number
  decoration?: string
  decorationColor?: string
  link?: string
}

type Run = Style & { text: string }
type Block = Record<string, unknown>

interface Context {
  text: string
  /** Placeholder key to source path, resolved into data URIs at the end. */
  images: Map<string, string>
  /** What to write instead when a picture cannot be found. */
  labels: Map<string, string>
}

const EMPHASIS_MARKS = new Set(['EmphasisMark'])
const HEADER_MARKS = new Set(['HeaderMark'])
const LINK_PARTS = new Set(['LinkMark', 'URL', 'LinkTitle'])

function push(out: Run[], raw: string, style: Style): void {
  // A soft wrap in the source is a space in the output: a newline here would
  // become a hard line break in the page.
  const value = raw.replace(/\s+/g, ' ')
  if (value !== '') out.push({ ...style, text: value })
}

function runs(node: SyntaxNode, context: Context, style: Style, skip?: Set<string>): Run[] {
  const out: Run[] = []
  let pos = node.from
  for (let child = node.firstChild; child; child = child.nextSibling) {
    push(out, context.text.slice(pos, child.from), style)
    if (!skip?.has(child.name)) out.push(...inline(child, context, style))
    pos = child.to
  }
  push(out, context.text.slice(pos, node.to), style)
  return out
}

function childText(node: SyntaxNode, context: Context, name: string): string {
  const child = node.getChild(name)
  return child ? context.text.slice(child.from, child.to) : ''
}

function inline(node: SyntaxNode, context: Context, style: Style): Run[] {
  const raw = () => context.text.slice(node.from, node.to)

  switch (node.name) {
    case 'Emphasis':
      return runs(node, context, { ...style, italics: true }, EMPHASIS_MARKS)
    case 'StrongEmphasis':
      return runs(node, context, { ...style, bold: true }, EMPHASIS_MARKS)
    case 'Strikethrough':
      return runs(
        node,
        context,
        { ...style, decoration: 'lineThrough', color: PALETTE.faint },
        new Set(['StrikethroughMark']),
      )
    case 'Highlight':
      return runs(node, context, { ...style, background: PALETTE.mark }, new Set(['HighlightMark']))
    case 'InlineCode':
      return runs(
        node,
        context,
        { ...style, font: 'Courier', fontSize: 9, background: PALETTE.codeBg },
        new Set(['CodeMark']),
      )
    case 'Link': {
      const href = childText(node, context, 'URL')
      return runs(node, context, { ...style, color: PALETTE.accent, link: href }, LINK_PARTS)
    }
    case 'Wikilink':
      return [{ ...style, color: PALETTE.accent, text: childText(node, context, 'WikilinkText') }]
    case 'FootnoteRef':
      return [
        {
          ...style,
          color: PALETTE.accent,
          fontSize: 7,
          text: childText(node, context, 'FootnoteLabel'),
        },
      ]
    case 'TaskMarker':
      // The box is drawn by the list, not by the text.
      return []
    case 'Escape':
      return [{ ...style, text: raw().slice(1) }]
    case 'HTMLTag':
      // The only tag that carries meaning in a page of prose is the break.
      return /^<br\s*\/?>$/i.test(raw()) ? [{ ...style, text: '\n' }] : []
    default:
      return runs(node, context, style)
  }
}

function imageBlock(node: SyntaxNode, context: Context): Block | null {
  const spec = parseImage(context.text.slice(node.from, node.to))
  if (!spec) return null

  const key = 'img' + context.images.size
  context.images.set(key, spec.src)
  context.labels.set(key, spec.label || spec.src)
  // The width written in the Markdown is in screen pixels; a point is 3/4 of one.
  const width = Math.min(spec.width ? spec.width * 0.75 : COLUMN, COLUMN)
  return { image: key, width, margin: [0, 4, 0, 10] }
}

/**
 * A paragraph that carries an image becomes a stack, because a picture cannot
 * sit inside a run of text in a laid-out page the way it can in a line of HTML.
 */
function paragraph(node: SyntaxNode, context: Context, style: Style = {}): Block[] {
  const out: Block[] = []
  let pending: Run[] = []
  let pos = node.from

  const flush = () => {
    if (pending.length > 0) out.push({ text: pending, margin: [0, 0, 0, 9] })
    pending = []
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    push(pending, context.text.slice(pos, child.from), style)
    if (child.name === 'Image' || child.name === 'Embed') {
      flush()
      const image = imageBlock(child, context)
      if (image) out.push(image)
    } else {
      pending.push(...inline(child, context, style))
    }
    pos = child.to
  }

  push(pending, context.text.slice(pos, node.to), style)
  flush()
  return out
}

/** The little square in front of a task, drawn rather than typed. */
function checkbox(done: boolean): Block {
  return {
    width: 16,
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 3.5,
        w: 8,
        h: 8,
        r: 1.5,
        lineWidth: 1,
        lineColor: done ? PALETTE.accent : PALETTE.faint,
        color: done ? PALETTE.accent : undefined,
      },
    ],
  }
}

/** The bullet the engine would have drawn, drawn by hand instead. */
function bullet(): Block {
  return { width: 16, text: '•', color: PALETTE.accent, alignment: 'right', margin: [0, 0, 6, 0] }
}

function listItems(node: SyntaxNode, context: Context): { items: Block[]; tasks: boolean } {
  const rows: { parts: Block[]; done: boolean | null }[] = []
  let tasks = false

  for (let item = node.firstChild; item; item = item.nextSibling) {
    if (item.name !== 'ListItem') continue

    const marker = item.getChild('Task')?.getChild('TaskMarker')
    const done = marker ? /\[[xX]\]/.test(context.text.slice(marker.from, marker.to)) : null
    if (marker) tasks = true

    const parts: Block[] = []
    for (let child = item.firstChild; child; child = child.nextSibling) {
      if (child.name === 'ListMark') continue
      parts.push(...block(child, context))
    }

    rows.push({ parts, done })
  }

  // A blank line between items does not start a new list, so one list can hold
  // both tasks and plain items. When it does, every item draws its own marker,
  // because the engine can only be told about the list as a whole.
  const items = rows.map(({ parts, done }) => {
    const body = parts.length === 1 ? parts[0]! : { stack: parts }
    if (!tasks) return body
    return {
      columns: [done === null ? bullet() : checkbox(done), { width: '*', ...body }],
      columnGap: 0,
    }
  })

  return { items, tasks }
}

const CODE_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  fillColor: () => PALETTE.codeBg,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 9,
  paddingBottom: () => 9,
}

function panel(inner: Block[], line: string, fill: string | null): Block {
  return {
    table: { widths: ['*'], body: [[{ stack: inner, margin: [0, 0, 0, 0] }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (index: number) => (index === 0 ? 2 : 0),
      vLineColor: () => line,
      fillColor: () => fill,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 9,
      paddingBottom: () => 2,
    },
    margin: [0, 4, 0, 11],
  }
}

const QUOTE_PREFIX = /^\s{0,3}>\s?/
const CALLOUT_MARKER = /^\[!\w+\][+-]?\s*/

function quote(node: SyntaxNode, context: Context): Block {
  const raw = context.text.slice(node.from, node.to)
  const callout = parseCallout(raw.split('\n')[0] ?? '')
  const lines = raw.split('\n').map((line) => line.replace(QUOTE_PREFIX, ''))

  if (!callout) {
    const inner = fragment(lines.join('\n'), context, { color: PALETTE.dim, italics: true })
    return panel(inner, PALETTE.border, null)
  }

  const tone = TONES[callout.type] ?? TONES.note!
  const title = (lines[0] ?? '').replace(CALLOUT_MARKER, '')
  const body = lines.slice(1).join('\n').trim()

  const inner: Block[] = []
  if (title !== '') inner.push(...fragment(title, context, { bold: true, color: tone.line }))
  if (body !== '') inner.push(...fragment(body, context, {}))

  return panel(inner, tone.line, tone.fill)
}

function table(node: SyntaxNode, context: Context): Block {
  const body: Block[][] = []
  let columns = 0

  for (let row = node.firstChild; row; row = row.nextSibling) {
    if (row.name === 'TableDelimiter') continue
    const header = row.name === 'TableHeader'
    const cells: Block[] = []
    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== 'TableCell') continue
      cells.push({
        text: runs(cell, context, header ? { bold: true } : {}),
        fillColor: header ? PALETTE.codeBg : null,
      })
    }
    if (cells.length === 0) continue
    columns = Math.max(columns, cells.length)
    body.push(cells)
  }

  // A short row would make the engine refuse to lay the table out at all.
  for (const row of body) while (row.length < columns) row.push({ text: '' })

  return {
    table: { headerRows: body.length > 1 ? 1 : 0, widths: Array<string>(columns).fill('*'), body },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => PALETTE.border,
      vLineColor: () => PALETTE.border,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    fontSize: 9.5,
    margin: [0, 4, 0, 12],
  }
}

const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:/

function block(node: SyntaxNode, context: Context): Block[] {
  const name = node.name
  const raw = () => context.text.slice(node.from, node.to)

  const heading = /^ATXHeading([1-6])$/.exec(name) ?? /^SetextHeading([12])$/.exec(name)
  if (heading) {
    return [{ text: runs(node, context, {}, HEADER_MARKS), style: 'h' + heading[1] }]
  }

  switch (name) {
    case 'Paragraph': {
      const first = context.text.slice(node.from, node.to).split('\n')[0] ?? ''
      if (FOOTNOTE_DEFINITION.test(first)) {
        return paragraph(node, context, { color: PALETTE.faint, fontSize: 9 })
      }
      return paragraph(node, context)
    }
    case 'Task':
      // A task item holds its text loose inside the node, with no paragraph
      // around it, so it has to be laid out like one.
      return paragraph(node, context)
    case 'Blockquote':
      return [quote(node, context)]
    case 'BulletList':
    case 'OrderedList': {
      const { items, tasks } = listItems(node, context)
      if (items.length === 0) return []
      const list: Block =
        name === 'BulletList'
          ? { ul: items, markerColor: PALETTE.accent }
          : { ol: items, markerColor: PALETTE.faint }
      // A list of tasks draws its own boxes, so the engine's bullets come off.
      if (tasks) list.type = 'none'
      return [{ ...list, margin: [0, 0, 0, 9] }]
    }
    case 'FencedCode':
    case 'CodeBlock': {
      const lines = raw().split('\n')
      const fenced = name === 'FencedCode'
      const body = (fenced ? lines.slice(1, -1) : lines).join('\n')
      return [
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: body,
                  font: 'Courier',
                  fontSize: 8.5,
                  lineHeight: 1.3,
                  preserveLeadingSpaces: true,
                },
              ],
            ],
          },
          layout: CODE_LAYOUT,
          margin: [0, 4, 0, 12],
        },
      ]
    }
    case 'Table':
      return [table(node, context)]
    case 'HorizontalRule':
      return [
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: COLUMN,
              y2: 0,
              lineWidth: 0.7,
              lineColor: PALETTE.border,
            },
          ],
          margin: [0, 8, 0, 16],
        },
      ]
    case 'Image':
    case 'Embed': {
      const image = imageBlock(node, context)
      return image ? [image] : []
    }
    default:
      return blocks(node, context)
  }
}

function blocks(node: SyntaxNode, context: Context): Block[] {
  const out: Block[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    out.push(...block(child, context))
  }
  return out
}

/** Lays out a piece of Markdown on its own, sharing the image list. */
function fragment(text: string, context: Context, style: Style): Block[] {
  const sub: Context = { text, images: context.images, labels: context.labels }
  const out = blocks(parser.parse(text).topNode, sub)

  if (style.bold === undefined && style.italics === undefined && style.color === undefined) {
    return out
  }
  // The quote styles reach the runs that were built without them.
  for (const item of out) {
    const line = (item as { text?: Run[] }).text
    if (Array.isArray(line)) for (const run of line) Object.assign(run, { ...style, ...run })
  }
  return out
}

const FENCE = /^-{3,}\s*$/

function stripFrontmatter(text: string): string {
  const lines = text.split('\n')
  if (lines[0] === undefined || !FENCE.test(lines[0])) return text
  for (let index = 1; index < Math.min(lines.length, 200); index++) {
    if (FENCE.test(lines[index]!)) return lines.slice(index + 1).join('\n')
  }
  return text
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary)
}

async function resolveImages(
  wanted: Map<string, string>,
  source: Source | null,
): Promise<Record<string, string>> {
  const images: Record<string, string> = {}
  for (const [key, src] of wanted) {
    if (!source) continue
    const url = await resolveImage(source, src)
    if (!url) continue
    if (url.startsWith('data:')) {
      images[key] = url
      continue
    }
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    images[key] = 'data:' + mimeOf(src) + ';base64,' + bytesToBase64(bytes)
  }
  return images
}

/**
 * A picture the app could not find would otherwise reach the engine as a
 * reference to nothing, and the whole export would fail over one broken path.
 */
function replaceMissingImages(
  content: Block[],
  images: Record<string, string>,
  labels: Map<string, string>,
): void {
  for (const item of content) {
    const key = (item as { image?: string }).image
    if (key !== undefined && images[key] === undefined) {
      delete (item as { image?: string }).image
      delete (item as { width?: number }).width
      Object.assign(item, {
        text: 'imagem não encontrada: ' + (labels.get(key) ?? key),
        color: PALETTE.faint,
        italics: true,
        fontSize: 9,
      })
    }
    const nested = (item as { stack?: Block[] }).stack
    if (Array.isArray(nested)) replaceMissingImages(nested, images, labels)
  }
}

const STYLES: Record<string, Block> = {
  title: { fontSize: 22, bold: true, margin: [0, 0, 0, 18], color: PALETTE.text },
  h1: { fontSize: 17, bold: true, margin: [0, 16, 0, 8] },
  h2: { fontSize: 14.5, bold: true, margin: [0, 14, 0, 7] },
  h3: { fontSize: 12.5, bold: true, margin: [0, 12, 0, 6] },
  h4: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
  h5: { fontSize: 10.5, bold: true, margin: [0, 9, 0, 5] },
  h6: { fontSize: 10, bold: true, color: PALETTE.dim, margin: [0, 9, 0, 5] },
}

interface PdfMake {
  addFontContainer: (container: unknown) => void
  /** In this version `getBlob` returns a promise rather than taking a callback. */
  createPdf: (definition: Block) => { getBlob: () => Promise<Blob> }
}

let engine: PdfMake | null = null

async function load(): Promise<PdfMake> {
  if (engine) return engine
  // Loaded on demand: the engine and its fonts are most of a megabyte, and most
  // sessions never export anything.
  const [core, roboto, courier] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/fonts/Roboto'),
    import('pdfmake/build/standard-fonts/Courier'),
  ])
  const pdfMake = ((core as { default?: PdfMake }).default ?? core) as PdfMake
  pdfMake.addFontContainer((roboto as { default?: unknown }).default ?? roboto)
  pdfMake.addFontContainer((courier as { default?: unknown }).default ?? courier)
  engine = pdfMake
  return pdfMake
}

export async function exportPdf(
  title: string,
  text: string,
  source: Source | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const pdfMake = await load()
  const body = stripFrontmatter(text)
  const context: Context = { text: body, images: new Map(), labels: new Map() }
  const content = blocks(parser.parse(body).topNode, context)
  const images = await resolveImages(context.images, source)
  replaceMissingImages(content, images, context.labels)

  const definition: Block = {
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.35, color: PALETTE.text },
    styles: STYLES,
    images,
    content: [{ text: title, style: 'title' }, ...content],
    footer: (current: number, total: number) => ({
      text: current + ' de ' + total,
      alignment: 'center',
      fontSize: 8,
      color: PALETTE.faint,
      margin: [0, 14, 0, 0],
    }),
  }

  const blob = await pdfMake.createPdf(definition).getBlob()
  return new Uint8Array(await blob.arrayBuffer())
}
