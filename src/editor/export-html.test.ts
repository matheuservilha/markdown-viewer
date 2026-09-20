import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './export-html'

const html = (markdown: string) => renderMarkdown(markdown, null)

describe('renderMarkdown', () => {
  it('turns headings into heading tags', async () => {
    expect(await html('# Título\n')).toContain('<h1>Título</h1>')
    expect(await html('### Terceiro\n')).toContain('<h3>Terceiro</h3>')
  })

  it('keeps emphasis without its markers', async () => {
    const out = await html('Um **forte** e um *fraco*.\n')
    expect(out).toContain('<strong>forte</strong>')
    expect(out).toContain('<em>fraco</em>')
    expect(out).not.toContain('**')
  })

  it('carries the marks the dialect adds', async () => {
    expect(await html('Isto é ==marcado==.\n')).toContain('<mark>marcado</mark>')
    expect(await html('Isto é ~~riscado~~.\n')).toContain('<del>riscado</del>')
  })

  it('writes a list, and a task as a checkbox', async () => {
    const out = await html('- um\n- [x] feito\n')
    expect(out).toContain('<ul>')
    expect(out).toContain('<span class="task is-done">')
  })

  it('keeps a code block as text, with its language', async () => {
    const out = await html('```ts\nconst a = 1 < 2\n```\n')
    expect(out).toContain('<pre><code class="language-ts">')
    expect(out).toContain('const a = 1 &lt; 2')
  })

  it('draws a callout apart from an ordinary quote', async () => {
    expect(await html('> [!tip] Dica\n> corpo\n')).toContain('class="callout callout-tip"')
    expect(await html('> só uma citação\n')).toContain('<blockquote>')
  })

  it('builds a table with a header row', async () => {
    const out = await html('| A | B |\n|---|---|\n| 1 | 2 |\n')
    expect(out).toContain('<table>')
    expect(out).toContain('<th>A</th>')
    expect(out).toContain('<td>1</td>')
  })

  it('keeps a link and shows only the text of a wiki link', async () => {
    expect(await html('[texto](https://exemplo.com)\n')).toContain(
      '<a href="https://exemplo.com">texto</a>',
    )
    expect(await html('[[alvo|apelido]]\n')).toContain('<span class="wikilink">apelido</span>')
  })

  it('leaves the front matter out', async () => {
    const out = await html('---\ntags:\n  - um\n---\n\n# Depois\n')
    expect(out).not.toContain('tags')
    expect(out).toContain('<h1>Depois</h1>')
  })

  it('keeps the HTML people actually write in notes', async () => {
    expect(await html('Uma quebra<br>forçada.\n')).toContain('<br>')
  })

  it('shows script as text instead of letting it run', async () => {
    const out = await html('Um <script>alert(1)</script> no meio do texto.\n')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('drops event handlers and javascript urls', async () => {
    expect(await html('<span onclick="alert(1)">oi</span>\n')).not.toContain('onclick')
    expect(await html('<a href="javascript:alert(1)">oi</a>\n')).not.toContain('javascript:')
  })

  it('keeps the width written on an image', async () => {
    expect(await html('![alt|320](foto.png)\n')).toContain('width="320"')
  })
})
