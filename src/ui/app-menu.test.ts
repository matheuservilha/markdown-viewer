import { describe, expect, it } from 'vitest'
import { menuPlan, type MenuNode } from './app-menu'
import type { Recents } from '~/app/recents'

const vazio: Recents = { files: [], bases: [] }

const cheio: Recents = {
  files: [
    { baseId: '/a', path: 'um.md', name: 'um.md', at: 3 },
    { baseId: '/a', path: 'dois.md', name: 'dois.md', at: 2 },
  ],
  bases: [{ id: '/notas', name: 'notas', label: '/notas', at: 1 }],
}

const plan = (recents: Recents, hasDocument = true, apple = true) =>
  menuPlan({ recents, hasDocument, apple })

const submenu = (nodes: MenuNode[], label: string): MenuNode[] => {
  for (const node of nodes) {
    if (node.kind === 'submenu' && node.label === label) return node.items
    if (node.kind === 'submenu') {
      const deeper = submenu(node.items, label)
      if (deeper.length > 0) return deeper
    }
  }
  return []
}

const named = (nodes: MenuNode[]) => nodes.filter((node) => node.kind !== 'separator')
const labels = (nodes: MenuNode[]) => named(nodes).map((node) => node.label)
const byLabel = (nodes: MenuNode[], label: string) =>
  named(nodes).find((node) => node.label === label)

describe('o menu do sistema', () => {
  it('tem os menus de sempre', () => {
    expect(labels(plan(vazio))).toEqual([
      'markdown-viewer',
      'Arquivo',
      'Editar',
      'Formatar',
      'Ver',
      'Janela',
    ])
  })

  it('fora do Mac não tem o menu do aplicativo', () => {
    const fora = labels(plan(vazio, true, false))
    expect(fora).not.toContain('markdown-viewer')
    expect(fora[0]).toBe('Arquivo')
    // Sair e Ajustes moram no menu Arquivo quando não há menu do aplicativo.
    expect(labels(submenu(plan(vazio, true, false), 'Arquivo'))).toContain('Sair')
    expect(labels(submenu(plan(vazio, true, false), 'Arquivo'))).toContain('Ajustes')
  })

  it('Arquivo traz abrir arquivo, pasta e recentes', () => {
    expect(labels(submenu(plan(vazio), 'Arquivo'))).toEqual([
      'Nova nota',
      'Abrir arquivo',
      'Abrir pasta',
      'Abrir recentes',
      'Salvar',
      'Fixar na barra de notas',
      'Imprimir',
      'Fechar aba',
      'Reabrir aba fechada',
      'Fechar janela',
    ])
  })

  it('os recentes viram arquivos e pastas, nessa ordem', () => {
    const itens = submenu(plan(cheio), 'Abrir recentes')
    expect(labels(itens)).toEqual(['um.md', 'dois.md', 'notas'])
    expect(itens[0]).toMatchObject({ command: { recentFile: 0 } })
    expect(itens.at(-1)).toMatchObject({ command: { recentBase: 0 } })
  })

  it('sem histórico, o submenu diz isso e não clica', () => {
    const itens = submenu(plan(vazio), 'Abrir recentes')
    expect(labels(itens)).toEqual(['Nada ainda'])
    expect(itens[0]).toMatchObject({ enabled: false })
  })

  it('sem documento aberto, o que age sobre ele fica apagado', () => {
    const arquivo = submenu(plan(vazio, false), 'Arquivo')
    const salvar = byLabel(arquivo, 'Salvar')
    expect(salvar).toMatchObject({ enabled: false })
    const abrir = byLabel(arquivo, 'Abrir pasta')
    expect(abrir).toMatchObject({ enabled: true })
  })

  it('desfazer e refazer são do editor, não do sistema', () => {
    const editar = submenu(plan(vazio), 'Editar')
    expect(byLabel(editar, 'Desfazer')).toMatchObject({
      kind: 'item',
      command: 'undo',
      accelerator: 'CmdOrCtrl+Z',
    })
    // Copiar e colar precisam ser nativos para alcançar a área de transferência.
    expect(byLabel(editar, 'Colar')).toMatchObject({ kind: 'native' })
  })

  it('a tecla do menu vem da mesma tabela do teclado', () => {
    const arquivo = submenu(plan(vazio), 'Arquivo')
    expect(byLabel(arquivo, 'Salvar')).toMatchObject({
      accelerator: 'CmdOrCtrl+S',
    })
    expect(byLabel(arquivo, 'Abrir arquivo')).toMatchObject({
      accelerator: 'CmdOrCtrl+Shift+O',
    })
  })
})
