/**
 * The keyboard.
 *
 * The bindings live in one table so that what the settings window lists and
 * what the app actually answers to cannot drift apart: both read this.
 */

export type ShortcutId =
  | 'save'
  | 'newFile'
  | 'openBase'
  | 'openFile'
  | 'closeTab'
  | 'reopenTab'
  | 'nextTab'
  | 'previousTab'
  | 'toggleSidebar'
  | 'toggleInfo'
  | 'settings'
  | 'print'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

export interface Shortcut {
  id: ShortcutId
  label: string
  /** The key as the event reports it, in lower case. */
  key: string
  /** Command on a Mac, Control everywhere else. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** Control even on a Mac, for the bindings that are Control there too. */
  control?: boolean
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'save', label: 'Salvar', key: 's', mod: true },
  { id: 'newFile', label: 'Nova nota', key: 'n', mod: true },
  { id: 'openBase', label: 'Abrir pasta', key: 'o', mod: true },
  { id: 'openFile', label: 'Abrir arquivo', key: 'o', mod: true, shift: true },
  { id: 'closeTab', label: 'Fechar aba', key: 'w', mod: true },
  { id: 'reopenTab', label: 'Reabrir aba fechada', key: 't', mod: true, shift: true },
  { id: 'nextTab', label: 'Próxima aba', key: ']', mod: true, shift: true },
  { id: 'previousTab', label: 'Aba anterior', key: '[', mod: true, shift: true },
  { id: 'toggleSidebar', label: 'Barra lateral', key: '\\', mod: true },
  { id: 'toggleInfo', label: 'Painel de sumário', key: '\\', mod: true, shift: true },
  { id: 'settings', label: 'Ajustes', key: ',', mod: true },
  { id: 'print', label: 'Imprimir', key: 'p', mod: true },
  { id: 'zoomIn', label: 'Aumentar a interface', key: '=', mod: true },
  { id: 'zoomOut', label: 'Diminuir a interface', key: '-', mod: true },
  { id: 'zoomReset', label: 'Tamanho padrão', key: '0', mod: true },
]

const APPLE = /Mac|iPhone|iPad/

export function onApple(platform = globalThis.navigator?.platform ?? ''): boolean {
  return APPLE.test(platform)
}

/** `⌘⇧O` on a Mac, `Ctrl+Shift+O` elsewhere. */
export function keyCap(shortcut: Shortcut, apple = onApple()): string {
  const CAPS: Record<string, string> = { '=': '+', ' ': 'Espaço' }
  const key = CAPS[shortcut.key] ?? shortcut.key.toUpperCase()
  if (apple) {
    return (
      (shortcut.control ? '⌃' : '') +
      (shortcut.alt ? '⌥' : '') +
      (shortcut.shift ? '⇧' : '') +
      (shortcut.mod ? '⌘' : '') +
      key
    )
  }
  const parts = []
  if (shortcut.mod || shortcut.control) parts.push('Ctrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')
  return [...parts, key].join('+')
}

/**
 * The same binding written the way the native menu wants it, so that what the
 * menu shows and what the app answers to come from one place.
 */
export function accelerator(shortcut: Shortcut): string {
  const parts = []
  if (shortcut.control) parts.push('Ctrl')
  if (shortcut.mod) parts.push('CmdOrCtrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')
  const NAMES: Record<string, string> = { '=': 'Plus', ',': 'Comma', '\\': 'Backslash' }
  parts.push(NAMES[shortcut.key] ?? shortcut.key.toUpperCase())
  return parts.join('+')
}

interface Pressed {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Which shortcut a key press is, if any.
 *
 * A digit with the command key held goes to the tab of that number, which is
 * how every browser and editor behaves, so it is answered here too.
 */
export function matchShortcut(
  event: Pressed,
  apple = onApple(),
): ShortcutId | { tab: number } | null {
  const mod = apple ? event.metaKey : event.ctrlKey
  if (!mod && !event.ctrlKey) return null

  if (mod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
    return { tab: Number(event.key) }
  }

  // `⇧=` is reported as `+`, and the numeric keypad reports `Add`. Both mean
  // the same request: make it bigger.
  const key = event.key.toLowerCase()
  const normalised = key === '+' || key === 'add' ? '=' : key

  for (const shortcut of SHORTCUTS) {
    if (shortcut.key !== normalised) continue
    if ((shortcut.mod ?? false) !== mod) continue
    if ((shortcut.control ?? false) !== (apple ? event.ctrlKey : false)) continue
    // `⌘+` arrives with shift held, so the zoom is not fussy about it.
    if (shortcut.id !== 'zoomIn' && (shortcut.shift ?? false) !== event.shiftKey) continue
    if ((shortcut.alt ?? false) !== event.altKey) continue
    return shortcut.id
  }
  return null
}

export interface EditorBinding {
  label: string
  keys: string
}

/**
 * The bindings that belong to the editor rather than to the app. They are
 * declared in `editorExtensions`, and repeated here only to be listed: the
 * list is for reading, the keymap is what answers.
 */
export const EDITOR_BINDINGS: EditorBinding[] = [
  { label: 'Negrito', keys: 'B' },
  { label: 'Itálico', keys: 'I' },
  { label: 'Código', keys: 'E' },
  { label: 'Link', keys: 'K' },
  { label: 'Tachado', keys: '⇧X' },
  { label: 'Marca-texto', keys: '⇧H' },
  { label: 'Tarefa', keys: '⏎' },
  { label: 'Desfazer', keys: 'Z' },
  { label: 'Refazer', keys: '⇧Z' },
  { label: 'Buscar no documento', keys: 'F' },
]

/** The editor bindings, written the way this machine writes them. */
export function editorCap(binding: EditorBinding, apple = onApple()): string {
  if (apple) return binding.keys.replace(/^⇧/, '⇧⌘').replace(/^(?!⇧)/, '⌘')
  return 'Ctrl+' + binding.keys.replace('⇧', 'Shift+').replace('⏎', 'Enter')
}
