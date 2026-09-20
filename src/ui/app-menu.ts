/**
 * The menu the operating system draws: the bar at the top on a Mac, the bar in
 * the window on Windows and Linux.
 *
 * The shape of the menu is a plain description, so that what it offers can be
 * checked without a desktop around it. Turning that description into the
 * system's own objects happens at the bottom of this file, and only there.
 */

import type { Recents } from '~/app/recents'
import { SHORTCUTS, accelerator, type ShortcutId } from './shortcuts'

/** What the editor does, as opposed to what the app around it does. */
export type EditorCommandId =
  | 'undo'
  | 'redo'
  | 'find'
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'strike'
  | 'highlight'
  | 'task'

export type CommandId =
  | ShortcutId
  | EditorCommandId
  | { tab: number }
  | { recentFile: number }
  | { recentBase: number }

export type MenuNode =
  | { kind: 'item'; label: string; command: CommandId; accelerator?: string; enabled?: boolean }
  | { kind: 'native'; label: string; item: 'Cut' | 'Copy' | 'Paste' | 'SelectAll' | 'Minimize' | 'CloseWindow' | 'Quit' | 'Fullscreen' | 'Hide' | 'HideOthers' | 'ShowAll' | 'Services' | 'About' }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenuNode[] }

const KEYS = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, accelerator(shortcut)]))

function item(label: string, command: ShortcutId, enabled = true): MenuNode {
  return { kind: 'item', label, command, accelerator: KEYS.get(command), enabled }
}

function editorItem(
  label: string,
  command: EditorCommandId,
  key: string,
  enabled: boolean,
): MenuNode {
  return { kind: 'item', label, command, accelerator: key, enabled }
}

export interface MenuInput {
  recents: Recents
  /** With nothing open, the things that act on a document are greyed out. */
  hasDocument: boolean
  apple: boolean
}

const RECENTS_SHOWN = 10

export function menuPlan({ recents, hasDocument, apple }: MenuInput): MenuNode[] {
  const files = recents.files.slice(0, RECENTS_SHOWN)
  const bases = recents.bases.slice(0, RECENTS_SHOWN)

  const recentItems: MenuNode[] = [
    ...files.map((file, index): MenuNode => ({
      kind: 'item',
      label: file.name,
      command: { recentFile: index },
    })),
    ...(files.length > 0 && bases.length > 0 ? [{ kind: 'separator' as const }] : []),
    ...bases.map((base, index): MenuNode => ({
      kind: 'item',
      label: base.name,
      command: { recentBase: index },
    })),
  ]

  const application: MenuNode[] = apple
    ? [
        {
          kind: 'submenu',
          label: 'markdown-viewer',
          items: [
            { kind: 'native', label: 'Sobre', item: 'About' },
            { kind: 'separator' },
            item('Ajustes', 'settings'),
            { kind: 'separator' },
            { kind: 'native', label: 'Serviços', item: 'Services' },
            { kind: 'separator' },
            { kind: 'native', label: 'Ocultar', item: 'Hide' },
            { kind: 'native', label: 'Ocultar outros', item: 'HideOthers' },
            { kind: 'native', label: 'Mostrar tudo', item: 'ShowAll' },
            { kind: 'separator' },
            { kind: 'native', label: 'Sair', item: 'Quit' },
          ],
        },
      ]
    : []

  return [
    ...application,
    {
      kind: 'submenu',
      label: 'Arquivo',
      items: [
        item('Nova nota', 'newFile'),
        { kind: 'separator' },
        item('Abrir arquivo', 'openFile'),
        item('Abrir pasta', 'openBase'),
        {
          kind: 'submenu',
          label: 'Abrir recentes',
          items:
            recentItems.length > 0
              ? recentItems
              : [{ kind: 'item', label: 'Nada ainda', command: 'openFile', enabled: false }],
        },
        { kind: 'separator' },
        item('Salvar', 'save', hasDocument),
        item('Imprimir', 'print', hasDocument),
        { kind: 'separator' },
        item('Fechar aba', 'closeTab', hasDocument),
        item('Reabrir aba fechada', 'reopenTab'),
        ...(apple
          ? [{ kind: 'native' as const, label: 'Fechar janela', item: 'CloseWindow' as const }]
          : [
              { kind: 'separator' as const },
              item('Ajustes', 'settings'),
              { kind: 'native' as const, label: 'Sair', item: 'Quit' as const },
            ]),
      ],
    },
    {
      kind: 'submenu',
      label: 'Editar',
      items: [
        editorItem('Desfazer', 'undo', 'CmdOrCtrl+Z', hasDocument),
        editorItem('Refazer', 'redo', 'CmdOrCtrl+Shift+Z', hasDocument),
        { kind: 'separator' },
        { kind: 'native', label: 'Recortar', item: 'Cut' },
        { kind: 'native', label: 'Copiar', item: 'Copy' },
        { kind: 'native', label: 'Colar', item: 'Paste' },
        { kind: 'native', label: 'Selecionar tudo', item: 'SelectAll' },
        { kind: 'separator' },
        editorItem('Buscar no documento', 'find', 'CmdOrCtrl+F', hasDocument),
      ],
    },
    {
      kind: 'submenu',
      label: 'Formatar',
      items: [
        editorItem('Negrito', 'bold', 'CmdOrCtrl+B', hasDocument),
        editorItem('Itálico', 'italic', 'CmdOrCtrl+I', hasDocument),
        editorItem('Código', 'code', 'CmdOrCtrl+E', hasDocument),
        editorItem('Link', 'link', 'CmdOrCtrl+K', hasDocument),
        { kind: 'separator' },
        editorItem('Tachado', 'strike', 'CmdOrCtrl+Shift+X', hasDocument),
        editorItem('Marca-texto', 'highlight', 'CmdOrCtrl+Shift+H', hasDocument),
        { kind: 'separator' },
        editorItem('Tarefa', 'task', 'CmdOrCtrl+Enter', hasDocument),
      ],
    },
    {
      kind: 'submenu',
      label: 'Ver',
      items: [
        item('Barra lateral', 'toggleSidebar'),
        item('Painel de sumário', 'toggleInfo'),
        { kind: 'separator' },
        item('Aumentar a interface', 'zoomIn'),
        item('Diminuir a interface', 'zoomOut'),
        item('Tamanho padrão', 'zoomReset'),
        { kind: 'separator' },
        { kind: 'native', label: 'Tela cheia', item: 'Fullscreen' },
      ],
    },
    {
      kind: 'submenu',
      label: 'Janela',
      items: [
        { kind: 'native', label: 'Minimizar', item: 'Minimize' },
        { kind: 'separator' },
        item('Aba anterior', 'previousTab', hasDocument),
        item('Próxima aba', 'nextTab', hasDocument),
      ],
    },
  ]
}

/**
 * Hands the description to the system.
 *
 * Returns the way to undo it, which matters in development, where the module
 * is replaced while the app keeps running and would otherwise stack menus.
 */
export async function installAppMenu(
  plan: MenuNode[],
  run: (command: CommandId) => void,
): Promise<void> {
  const { Menu, MenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu')

  // The identifier travels to the system and comes back as a string, so the
  // command of each item is kept here rather than parsed out of it again.
  const actions = new Map<string, CommandId>()
  let next = 0

  const build = async (nodes: MenuNode[]): Promise<object[]> => {
    const built: object[] = []
    for (const node of nodes) {
      if (node.kind === 'separator') {
        built.push(await PredefinedMenuItem.new({ item: 'Separator' }))
        continue
      }
      if (node.kind === 'native') {
        // "About" is the one predefined item that carries something with it.
        const native = node.item === 'About' ? { About: null } : node.item
        built.push(await PredefinedMenuItem.new({ item: native, text: node.label }))
        continue
      }
      if (node.kind === 'submenu') {
        built.push(
          await Submenu.new({ text: node.label, items: (await build(node.items)) as never }),
        )
        continue
      }
      const id = 'cmd-' + next++
      actions.set(id, node.command)
      built.push(
        await MenuItem.new({
          id,
          text: node.label,
          enabled: node.enabled ?? true,
          accelerator: node.accelerator,
          action: (chosen: string) => {
            const command = actions.get(chosen)
            if (command !== undefined) run(command)
          },
        }),
      )
    }
    return built
  }

  const menu = await Menu.new({ items: (await build(plan)) as never })
  await menu.setAsAppMenu()
}
