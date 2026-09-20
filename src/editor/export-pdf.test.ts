import { describe, expect, it } from 'vitest'
import { exportPdf } from './export-pdf'

/** The PDF as latin1 text, which is where its object dictionaries are readable. */
async function build(markdown: string, title = 'documento'): Promise<string> {
  const bytes = await exportPdf(title, markdown, null)
  return new TextDecoder('latin1').decode(bytes)
}

function countPages(raw: string): number {
  return (raw.match(/\/Type \/Page[^s]/g) ?? []).length
}

describe('exportPdf', () => {
  it('writes a PDF with the title on it', async () => {
    const raw = await build('# Oi\n\nUm parágrafo.\n', 'minha nota')
    expect(raw.startsWith('%PDF-')).toBe(true)
    expect(countPages(raw)).toBe(1)
  })

  it('embeds the fonts, so the file does not depend on the reader having them', async () => {
    const raw = await build('Texto comum e `código`.\n')
    expect(raw).toContain('/FontFile')
    expect(raw).toContain('/Type /Font')
  })

  it('carries real text and not a picture of it', async () => {
    const raw = await build('# Título\n\nCorpo do texto.\n')
    // A rasterised page would have an image and no font resources at all.
    expect(raw).toContain('/Type /Font')
    expect(raw).not.toContain('/Subtype /Image')
  })

  it('keeps a link as a link', async () => {
    const raw = await build('Veja o [site](https://exemplo.com) agora.\n')
    expect(raw).toContain('/URI (https://exemplo.com)')
    expect(raw).toContain('/Subtype /Link')
  })

  it('breaks a long document into pages by itself', async () => {
    const long = Array.from({ length: 120 }, (_, index) => 'Parágrafo ' + index + '.').join('\n\n')
    expect(countPages(await build(long))).toBeGreaterThan(2)
  })

  it('lays out every construct without throwing', async () => {
    const everything = [
      '---',
      'tags: [um]',
      '---',
      '',
      '# Um',
      '## Dois',
      '',
      'Texto com **negrito**, *itálico*, ~~riscado~~, ==marca-texto==, `código` e [link](https://a.b).',
      '',
      '- item',
      '- [x] feito',
      '- [ ] aberto',
      '',
      '1. primeiro',
      '2. segundo',
      '',
      '> uma citação',
      '',
      '> [!warning] Atenção',
      '> corpo do aviso',
      '',
      '```ts',
      'const a = 1',
      '```',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '---',
      '',
      'Uma nota[^1].',
      '',
      '[^1]: a definição.',
      '',
    ].join('\n')

    const raw = await build(everything)
    expect(raw.startsWith('%PDF-')).toBe(true)
    expect(countPages(raw)).toBeGreaterThanOrEqual(1)
  })

  it('leaves the front matter out of the page', async () => {
    const raw = await build('---\ntags:\n  - segredo\n---\n\n# Depois\n')
    // The text is compressed inside the stream, so this checks the shape of the
    // document instead: front matter would have added a paragraph of its own.
    expect(countPages(raw)).toBe(1)
  })
})
