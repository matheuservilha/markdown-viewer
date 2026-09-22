import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap, rectangularSelection } from '@codemirror/view'
import {
  insertLink,
  toggleBold,
  toggleCode,
  toggleHighlight,
  toggleItalic,
  toggleStrike,
  toggleTask,
} from './commands'
import { dialect } from './dialect'
import { documentSource } from './images'
import { frontmatterBlock } from './frontmatter'
import { seamlessMarkdown } from './seamless'
import { tableBlocks } from './tables'
import { documentTitle, titleCompartment, type Rename } from './title'
import { editorTheme, markdownHighlight } from './theme'

/**
 * Read-only is the one setting that is editor state rather than paint, so it
 * lives in a compartment and is swapped in place instead of rebuilding.
 */
export const readOnlyCompartment = new Compartment()

export function readOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}

export interface EditorOptions {
  /** Shown as the heading of the page. It is the file name, not document text. */
  title: string
  /** Which file this is, so an image beside it can be found. */
  baseId: string
  path: string
  /** A `.txt` file opens as plain text, with no Markdown parsing at all. */
  plainText: boolean
  readOnly: boolean
  onSave: () => void
  /** A draft, whose title gets the `.md` it will be saved with. */
  draft?: boolean
  /** Renames the note from its title. Without it the title is only read. */
  rename?: Rename | null
}

export function editorExtensions({
  title,
  baseId,
  path,
  plainText,
  readOnly,
  onSave,
  draft = false,
  rename = null,
}: EditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    rectangularSelection(),
    indentOnInput(),
    bracketMatching(),
    search({ top: true }),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    readOnlyCompartment.of(readOnlyExtension(readOnly)),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (onSave(), true) },
      { key: 'Mod-Enter', preventDefault: true, run: toggleTask },
      { key: 'Mod-b', preventDefault: true, run: toggleBold },
      { key: 'Mod-i', preventDefault: true, run: toggleItalic },
      { key: 'Mod-k', preventDefault: true, run: insertLink },
      { key: 'Mod-e', preventDefault: true, run: toggleCode },
      { key: 'Shift-Mod-x', preventDefault: true, run: toggleStrike },
      { key: 'Shift-Mod-h', preventDefault: true, run: toggleHighlight },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    editorTheme,
    titleCompartment.of(documentTitle(title, draft, readOnly ? null : rename)),
    documentSource.of({ baseId, path }),
    ...(plainText
      ? [EditorView.theme({ '.cm-content': { fontFamily: 'var(--font-mono)' } })]
      : [
          markdown({ extensions: dialect, codeLanguages: languages }),
          markdownHighlight,
          frontmatterBlock,
          tableBlocks,
          seamlessMarkdown,
        ]),
  ]
}
