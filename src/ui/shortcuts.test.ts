import { describe, expect, it } from 'vitest'
import { SHORTCUTS, editorCap, keyCap, matchShortcut } from './shortcuts'

const press = (key: string, held: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>> = {}) => ({
  key,
  metaKey: held.meta ?? false,
  ctrlKey: held.ctrl ?? false,
  shiftKey: held.shift ?? false,
  altKey: held.alt ?? false,
})

describe('reconhecer o atalho', () => {
  it('acha o salvar com a tecla de comando', () => {
    expect(matchShortcut(press('s', { meta: true }), true)).toBe('save')
  })

  it('no Windows a mesma coisa é com Control', () => {
    expect(matchShortcut(press('s', { ctrl: true }), false)).toBe('save')
    expect(matchShortcut(press('s', { meta: true }), false)).toBeNull()
  })

  it('não confunde com a tecla sozinha', () => {
    expect(matchShortcut(press('s'), true)).toBeNull()
  })

  it('separa abrir arquivo de abrir pasta pelo shift', () => {
    expect(matchShortcut(press('o', { meta: true }), true)).toBe('openBase')
    expect(matchShortcut(press('o', { meta: true, shift: true }), true)).toBe('openFile')
  })

  it('o número vai para a aba daquele número', () => {
    expect(matchShortcut(press('3', { meta: true }), true)).toEqual({ tab: 3 })
    expect(matchShortcut(press('0', { meta: true }), true)).toBe('zoomReset')
  })

  it('aceita o mais com shift, que é como o teclado manda', () => {
    expect(matchShortcut(press('+', { meta: true, shift: true }), true)).toBe('zoomIn')
    expect(matchShortcut(press('=', { meta: true }), true)).toBe('zoomIn')
  })

  it('ignora o alt que não foi pedido', () => {
    expect(matchShortcut(press('s', { meta: true, alt: true }), true)).toBeNull()
  })

  it('nenhum atalho está escrito duas vezes', () => {
    const escrito = SHORTCUTS.map((s) => [s.key, s.mod, s.shift, s.alt, s.control].join('|'))
    expect(new Set(escrito).size).toBe(escrito.length)
  })
})

describe('escrever a tecla', () => {
  it('usa os símbolos do Mac', () => {
    expect(keyCap({ id: 'openFile', label: '', key: 'o', mod: true, shift: true }, true)).toBe('⇧⌘O')
  })

  it('e o nome por extenso fora dele', () => {
    expect(keyCap({ id: 'openFile', label: '', key: 'o', mod: true, shift: true }, false)).toBe(
      'Ctrl+Shift+O',
    )
  })

  it('mostra o mais em vez do igual', () => {
    expect(keyCap({ id: 'zoomIn', label: '', key: '=', mod: true }, true)).toBe('⌘+')
  })
})

describe('a lista do editor', () => {
  it('escreve o negrito com a tecla de comando', () => {
    expect(editorCap({ label: 'Negrito', keys: 'B' }, true)).toBe('⌘B')
    expect(editorCap({ label: 'Negrito', keys: 'B' }, false)).toBe('Ctrl+B')
  })

  it('põe o shift antes do comando', () => {
    expect(editorCap({ label: 'Tachado', keys: '⇧X' }, true)).toBe('⇧⌘X')
    expect(editorCap({ label: 'Tachado', keys: '⇧X' }, false)).toBe('Ctrl+Shift+X')
  })
})
