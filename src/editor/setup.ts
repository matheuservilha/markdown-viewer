import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap, rectangularSelection } from '@codemirror/view'
import { toggleTask } from './commands'
import { dialect } from './dialect'
import { frontmatterBlock } from './frontmatter'
import { seamlessMarkdown } from './seamless'
import { tableBlocks } from './tables'
import { documentTitle } from './title'
import { editorTheme, markdownHighlight } from './theme'

export interface EditorOptions {
  /** Shown as the heading of the page. It is the file name, not document text. */
  title: string
  /** A `.txt` file opens as plain text, with no Markdown parsing at all. */
  plainText: boolean
  readOnly: boolean
  onSave: () => void
}

export function editorExtensions({ title, plainText, readOnly, onSave }: EditorOptions): Extension[] {
  return [
    history(),
    drawSelection(),
    rectangularSelection(),
    indentOnInput(),
    bracketMatching(),
    search({ top: true }),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (onSave(), true) },
      { key: 'Mod-Enter', preventDefault: true, run: toggleTask },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    editorTheme,
    documentTitle(title),
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
