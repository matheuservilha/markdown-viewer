// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isDragRegion } from './window-drag'

function build(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

const at = (selector: string) => document.querySelector(selector)

describe('isDragRegion', () => {
  it('arrasta pela faixa vazia do topo', () => {
    build('<div class="strip" data-drag-window></div>')
    expect(isDragRegion(at('.strip'))).toBe(true)
  })

  it('arrasta por um texto dentro da região, que é o caso que falhava', () => {
    build('<div data-drag-window><span class="nome">markdown-viewer</span></div>')
    expect(isDragRegion(at('.nome'))).toBe(true)
  })

  it('não arrasta por um botão dentro da região', () => {
    build('<div data-drag-window><button class="b">x</button></div>')
    expect(isDragRegion(at('.b'))).toBe(false)
  })

  it('não arrasta por um ícone dentro de um botão', () => {
    build('<div data-drag-window><button><svg class="i"></svg></button></div>')
    expect(isDragRegion(at('.i'))).toBe(false)
  })

  it('não arrasta por uma aba', () => {
    build('<div data-drag-window><div class="t" role="tab">a.md</div></div>')
    expect(isDragRegion(at('.t'))).toBe(false)
  })

  it('não arrasta por um campo de texto', () => {
    build('<div data-drag-window><input class="f" /></div>')
    expect(isDragRegion(at('.f'))).toBe(false)
  })

  it('não arrasta fora de uma região', () => {
    build('<div class="fora">texto</div>')
    expect(isDragRegion(at('.fora'))).toBe(false)
  })

  it('não arrasta pelo editor, mesmo se ele cair dentro de uma região', () => {
    build('<div data-drag-window><div class="cm-editor"><div class="cm-line">x</div></div></div>')
    expect(isDragRegion(at('.cm-line'))).toBe(false)
  })
})
