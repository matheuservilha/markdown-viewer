// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { Dialog } from './Dialog'

let root: Root | null = null

function mount(node: React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.dialog-button')]
const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })

const choices = (onSelect: () => void) => [
  { label: 'Cancelar', onSelect: () => {} },
  { label: 'Fechar sem salvar', destructive: true, onSelect },
  { label: 'Salvar e fechar', primary: true, onSelect },
]

describe('a caixa de pergunta', () => {
  it('mostra a pergunta e as três saídas', () => {
    mount(<Dialog title="Fechar nota.md?" body="Há alterações." choices={choices(() => {})} onCancel={() => {}} />)
    expect(document.querySelector('.dialog-title')?.textContent).toBe('Fechar nota.md?')
    expect(buttons().map((b) => b.textContent)).toEqual([
      'Cancelar',
      'Fechar sem salvar',
      'Salvar e fechar',
    ])
  })

  it('o foco começa na saída sugerida, então o Enter responde', () => {
    mount(<Dialog title="t" choices={choices(() => {})} onCancel={() => {}} />)
    expect(document.activeElement?.textContent).toBe('Salvar e fechar')
  })

  it('Escape cancela', () => {
    const onCancel = vi.fn()
    mount(<Dialog title="t" choices={choices(() => {})} onCancel={onCancel} />)
    press('Escape')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('apertar fora cancela', () => {
    const onCancel = vi.fn()
    mount(<Dialog title="t" choices={choices(() => {})} onCancel={onCancel} />)
    act(() => {
      document.querySelector('.dialog-backdrop')!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      )
    })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('apertar dentro não cancela', () => {
    const onCancel = vi.fn()
    mount(<Dialog title="t" choices={choices(() => {})} onCancel={onCancel} />)
    act(() => {
      document.querySelector('.dialog')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('a escolha chama quem mandou', () => {
    const onSelect = vi.fn()
    mount(<Dialog title="t" choices={choices(onSelect)} onCancel={() => {}} />)
    act(() => buttons()[2]!.click())
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
