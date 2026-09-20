/**
 * Markdown to a standalone HTML file.
 *
 * It walks the same syntax tree the editor draws from, and not a second
 * Markdown library, so what is exported cannot disagree with what was on
 * screen. Images travel inside the file as data URIs, which is what makes the
 * result something you can send to somebody.
 */

import { markdown } from '@codemirror/lang-markdown'
import type { SyntaxNode } from '@lezer/common'
import { dialect } from './dialect'
import { parseCallout } from './callouts'
import { mimeOf, parseImage, resolveImage, type Source } from './images'

const parser = markdown({ extensions: dialect }).language.parser

/** Images are collected while walking and resolved afterwards, in one pass. */
interface Context {
  text: string
  images: string[]
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (character) => ESCAPES[character]!)
}

function children(node: SyntaxNode, context: Context, skip?: Set<string>): string {
  let out = ''
  let pos = node.from
  for (let child = node.firstChild; child; child = child.nextSibling) {
    out += escape(context.text.slice(pos, child.from))
    out += skip?.has(child.name) ? '' : render(child, context)
    pos = child.to
  }
  return out + escape(context.text.slice(pos, node.to))
}

const HEADING_MARKS = new Set(['HeaderMark'])
const LIST_MARKS = new Set(['ListMark'])
const LINK_PARTS = new Set(['LinkMark', 'URL', 'LinkTitle'])

function imagePlaceholder(context: Context, src: string): string {
  const index = context.images.indexOf(src)
  return '__IMAGE_' + (index < 0 ? context.images.push(src) - 1 : index) + '__'
}

function renderImage(node: SyntaxNode, context: Context): string {
  const spec = parseImage(context.text.slice(node.from, node.to))
  if (!spec) return escape(context.text.slice(node.from, node.to))
  const width = spec.width ? ' width="' + spec.width + '"' : ''
  return (
    '<img src="' +
    imagePlaceholder(context, spec.src) +
    '" alt="' +
    escape(spec.label) +
    '"' +
    width +
    '>'
  )
}

function renderTable(node: SyntaxNode, context: Context): string {
  let out = '<table>'
  let head = true
  for (let row = node.firstChild; row; row = row.nextSibling) {
    if (row.name === 'TableDelimiter') continue
    const cellTag = head && row.name === 'TableHeader' ? 'th' : 'td'
    out += '<tr>'
    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== 'TableCell') continue
      out += '<' + cellTag + '>' + children(cell, context) + '</' + cellTag + '>'
    }
    out += '</tr>'
    head = false
  }
  return out + '</table>'
}

/** Renders a piece of Markdown on its own, sharing the image list. */
function renderFragment(text: string, context: Context): string {
  return render(parser.parse(text).topNode, { text, images: context.images })
}

const QUOTE_PREFIX = /^\s{0,3}>\s?/
const CALLOUT_MARKER = /^\[!\w+\][+-]?\s*/

/**
 * A quote is rendered from its text with the `>` taken off, rather than from
 * its nodes. The markers sit inside the paragraphs of a multi-line quote, and
 * `[!tip]` is parsed as a link reference, so cleaning the HTML afterwards
 * fights the parser instead of using it.
 */
function renderQuote(node: SyntaxNode, context: Context): string {
  const raw = context.text.slice(node.from, node.to)
  const callout = parseCallout(raw.split('\n')[0] ?? '')
  const lines = raw.split('\n').map((line) => line.replace(QUOTE_PREFIX, ''))

  if (!callout) {
    return '<blockquote>' + renderFragment(lines.join('\n'), context) + '</blockquote>'
  }

  const title = (lines[0] ?? '').replace(CALLOUT_MARKER, '')
  const body = lines.slice(1).join('\n').trim()

  return (
    '<div class="callout callout-' +
    callout.type +
    '">' +
    (title === ''
      ? ''
      : renderFragment(title, context).replace(/^<p>/, '<p class="callout-title">')) +
    (body === '' ? '' : renderFragment(body, context)) +
    '</div>'
  )
}

function render(node: SyntaxNode, context: Context): string {
  const name = node.name
  const raw = () => context.text.slice(node.from, node.to)

  if (/^ATXHeading[1-6]$/.test(name) || /^SetextHeading[12]$/.test(name)) {
    const level = name.slice(-1)
    return '<h' + level + '>' + children(node, context, HEADING_MARKS).trim() + '</h' + level + '>'
  }

  switch (name) {
    case 'Paragraph':
      return '<p>' + children(node, context) + '</p>'
    case 'Blockquote':
      return renderQuote(node, context)
    case 'BulletList':
      return '<ul>' + children(node, context) + '</ul>'
    case 'OrderedList':
      return '<ol>' + children(node, context) + '</ol>'
    case 'ListItem':
      return '<li>' + children(node, context, LIST_MARKS).trim() + '</li>'
    case 'TaskMarker':
      // Drawn as a character rather than a form control: an <input> rasterises
      // badly into a PDF, and most printers drop its tick altogether.
      return /\[[xX]\]/.test(raw())
        ? '<span class="task is-done">✓</span>'
        : '<span class="task"></span>'
    case 'FencedCode':
    case 'CodeBlock': {
      const lines = raw().split('\n')
      const fenced = name === 'FencedCode'
      const language = fenced ? (lines[0] ?? '').replace(/^[`~]+/, '').trim() : ''
      const body = fenced ? lines.slice(1, -1).join('\n') : lines.join('\n')
      const tag = language ? '<code class="language-' + escape(language) + '">' : '<code>'
      return '<pre>' + tag + escape(body) + '</code></pre>'
    }
    case 'QuoteMark':
      // Reached only through a nested quote, where the outer one has already
      // taken its own markers off.
      return ''
    case 'HorizontalRule':
      return '<hr>'
    case 'Table':
      return renderTable(node, context)
    case 'Emphasis':
      return '<em>' + children(node, context, new Set(['EmphasisMark'])) + '</em>'
    case 'StrongEmphasis':
      return '<strong>' + children(node, context, new Set(['EmphasisMark'])) + '</strong>'
    case 'Strikethrough':
      return '<del>' + children(node, context, new Set(['StrikethroughMark'])) + '</del>'
    case 'Highlight':
      return '<mark>' + children(node, context, new Set(['HighlightMark'])) + '</mark>'
    case 'InlineCode':
      return '<code>' + children(node, context, new Set(['CodeMark'])) + '</code>'
    case 'Image':
    case 'Embed':
      return renderImage(node, context)
    case 'Link': {
      const url = node.getChild('URL')
      const href = url ? context.text.slice(url.from, url.to) : ''
      return '<a href="' + escape(href) + '">' + children(node, context, LINK_PARTS) + '</a>'
    }
    case 'Wikilink': {
      const label = node.getChild('WikilinkText')
      return (
        '<span class="wikilink">' +
        escape(label ? context.text.slice(label.from, label.to) : '') +
        '</span>'
      )
    }
    case 'FootnoteRef': {
      const label = node.getChild('FootnoteLabel')
      const id = label ? context.text.slice(label.from, label.to) : ''
      return '<sup class="footnote">' + escape(id) + '</sup>'
    }
    case 'HTMLBlock':
    case 'HTMLTag':
      // Markdown lets people write HTML, and plenty of notes use <br> or
      // <details>. What cannot travel in a file meant to be sent to somebody
      // is script: that is shown as text instead of run.
      return sanitize(raw())
    case 'Escape':
      return escape(raw().slice(1))
    case 'Document':
      return children(node, context)
    default:
      return children(node, context)
  }
}

/** Tags that would execute, or fetch, rather than describe. */
const FORBIDDEN = /<\/?\s*(script|iframe|object|embed|form|base|meta|link)\b[^>]*>/gi
const EVENT_ATTRIBUTE = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const SCRIPT_URL = /\b(href|src)\s*=\s*("|')?\s*javascript:[^"'\s>]*/gi

function sanitize(html: string): string {
  return html
    .replace(FORBIDDEN, (tag) => escape(tag))
    .replace(EVENT_ATTRIBUTE, '')
    .replace(SCRIPT_URL, '$1="#"')
}

const FENCE = /^-{3,}\s*$/

/** Front matter is not prose and is left out of the exported document. */
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

/** Anything larger than this stays a link rather than bloating the file. */
const MAX_EMBEDDED_BYTES = 4 * 1024 * 1024

async function embedImages(
  html: string,
  sources: string[],
  source: Source | null,
): Promise<string> {
  let out = html
  for (const [index, src] of sources.entries()) {
    let replacement = escape(src)
    if (source) {
      const url = await resolveImage(source, src)
      if (url?.startsWith('blob:')) {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
        if (bytes.length <= MAX_EMBEDDED_BYTES) {
          replacement = 'data:' + mimeOf(src) + ';base64,' + bytesToBase64(bytes)
        }
      } else if (url) {
        replacement = escape(url)
      }
    }
    out = out.split('__IMAGE_' + index + '__').join(replacement)
  }
  return out
}

export async function renderMarkdown(text: string, source: Source | null): Promise<string> {
  const body = stripFrontmatter(text)
  const context: Context = { text: body, images: [] }
  const html = render(parser.parse(body).topNode, context)
  return embedImages(html, context.images, source)
}

export interface ExportOptions {
  /**
   * `auto` follows the reader's system. `light` pins the page to the light
   * palette, which is what a PDF needs: paper is white everywhere.
   */
  theme?: 'auto' | 'light'
}

export async function exportDocument(
  title: string,
  text: string,
  source: Source | null,
  options: ExportOptions = {},
): Promise<string> {
  const body = await renderMarkdown(text, source)
  const style = options.theme === 'light' ? STYLE.replace(DARK_BLOCK, '') : STYLE
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${style}</style>
</head>
<body>
<article>
<h1 class="doc-title">${escape(title)}</h1>
${body}
</article>
</body>
</html>
`
}

const DARK_BLOCK = `@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14141d; --text: #eceaf2; --dim: #a4a1b4; --faint: #7a7788;
    --accent: #ff8461; --border: #2b2a3b; --code-bg: #1c1b28;
    --blue: #7f9fe0; --teal: #5fbfbd; --green: #7fc08f; --yellow: #ddc06a;
    --orange: #e09a5f; --red: #e08080; --purple: #b39ae8; --faint-tone: #7a7788;
    --blue-soft: #1d2434; --teal-soft: #152826; --green-soft: #17271b;
    --yellow-soft: #2a2417; --orange-soft: #2b2016; --red-soft: #2c1b1a;
    --purple-soft: #241d33; --faint-soft: #1f1e2a; --mark: #4a3f1c;
  }
}`

const STYLE = `
:root {
  --bg: #ffffff; --text: #16151d; --dim: #56545f; --faint: #85828f;
  --accent: #c2410c; --border: #e3e3ea; --code-bg: #f4f4f8;
  --blue: #2f6ab8; --teal: #17797a; --green: #2c7a46; --yellow: #8a6a15;
  --orange: #ab6318; --red: #b3382f; --purple: #6b3fa0; --faint-tone: #85828f;
  --blue-soft: #eaf1fb; --teal-soft: #e3f3f3; --green-soft: #e6f4ea;
  --yellow-soft: #f8f1dd; --orange-soft: #fbeee1; --red-soft: #fbe9e7;
  --purple-soft: #f0e9fa; --faint-soft: #f2f2f6; --mark: #fdeeb8;
}
${DARK_BLOCK}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  font-size: 16px; line-height: 1.7;
}
article { max-width: 46rem; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; letter-spacing: -0.02em; font-weight: 620; }
.doc-title { font-size: 2rem; margin-bottom: 2rem; }
h1 { font-size: 1.6rem; margin-top: 2.2rem; }
h2 { font-size: 1.35rem; margin-top: 2rem; }
h3 { font-size: 1.15rem; margin-top: 1.6rem; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1.1rem; }
a { color: var(--accent); }
.wikilink { color: var(--accent); }
mark { background: var(--mark); color: inherit; }
del { color: var(--faint); }
code {
  padding: 0.1em 0.3em; border-radius: 4px; background: var(--code-bg);
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; font-size: 0.86em;
}
pre { padding: 0.9rem 1.1rem; border-radius: 10px; background: var(--code-bg); overflow-x: auto; }
pre code { padding: 0; background: none; font-size: 0.82em; line-height: 1.6; }
blockquote {
  padding-left: 1.1rem; border-left: 2px solid var(--border);
  color: var(--dim); font-style: italic;
}
.callout {
  padding: 0.7rem 1.1rem; border-left: 2px solid var(--tone, var(--blue));
  border-radius: 0 8px 8px 0; margin: 0 0 1.1rem;
  background: var(--tone-soft, var(--blue-soft));
}
.callout-title { font-weight: 620; color: var(--tone, var(--blue)); }
.callout > :last-child { margin-bottom: 0; }
.callout-note { --tone: var(--blue); --tone-soft: var(--blue-soft); }
.callout-abstract { --tone: var(--teal); --tone-soft: var(--teal-soft); }
.callout-tip, .callout-success { --tone: var(--green); --tone-soft: var(--green-soft); }
.callout-question { --tone: var(--yellow); --tone-soft: var(--yellow-soft); }
.callout-important, .callout-example { --tone: var(--purple); --tone-soft: var(--purple-soft); }
.callout-warning { --tone: var(--orange); --tone-soft: var(--orange-soft); }
.callout-caution, .callout-failure, .callout-bug { --tone: var(--red); --tone-soft: var(--red-soft); }
.callout-quote { --tone: var(--faint-tone); --tone-soft: var(--faint-soft); }
table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
th, td { padding: 0.45rem 0.7rem; border: 1px solid var(--border); text-align: left; vertical-align: top; }
th { background: var(--code-bg); font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 8px; }
hr { height: 1px; border: 0; background: var(--border); margin: 2rem 0; }
sup.footnote { color: var(--accent); font-size: 0.75em; }
li > p { margin: 0; }
li { margin-bottom: 0.2rem; }
li:has(> .task) { list-style: none; margin-left: -1.1rem; }
.task {
  display: inline-block; width: 0.95em; height: 0.95em; margin-right: 0.45em;
  border: 1.5px solid var(--faint-tone); border-radius: 3px;
  font-size: 0.8em; line-height: 0.9em; text-align: center; vertical-align: -0.1em;
}
.task.is-done { border-color: var(--accent); background: var(--accent); color: #fff; }
@media print {
  :root { --bg: #fff; --text: #111; }
  article { max-width: none; padding: 0; }
  pre, table, blockquote, .callout, img { break-inside: avoid; }
}
`
