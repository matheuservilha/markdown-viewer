/**
 * Editor styling. Every colour comes from a CSS variable, which is what makes a
 * new theme a list of variables instead of a code change.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { footnoteTag, highlightTag, wikilinkTag } from './dialect'

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--font-size)',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'var(--line-height)',
    overflow: 'auto',

    // The bar is always given room, so the column of text does not jump
    // sideways when a document grows past one screen.
    scrollbarGutter: 'stable',
    overscrollBehavior: 'contain',
  },
  '.cm-content': {
    maxWidth: 'var(--measure)',
    padding: '32px 0 40vh',
    margin: '0 auto',
    caretColor: 'var(--accent)',
  },
  '.cm-line': { padding: '0 20px' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused, &': { boxShadow: 'none' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '2px solid var(--accent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    background: 'var(--selection)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-gutters': { display: 'none' },
  '.cm-panels': {
    border: '0',
    background: 'var(--surface-2)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-ui)',
    fontSize: '12px',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border-subtle)' },
  '.cm-textfield': {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
  },
  '.cm-button': {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-1)',
    backgroundImage: 'none',
    color: 'var(--text-secondary)',
  },
  '.cm-searchMatch': {
    borderRadius: '3px',
    background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    background: 'color-mix(in srgb, var(--accent) 45%, transparent)',
  },

  // CodeMirror puts a zero-width <img> on each side of a replaced range so the
  // caret has somewhere to land. By default the image is 1em tall and aligned to
  // text-top, and on a heading, where the line box is tighter than the font box,
  // that pushes the line one pixel taller the moment the syntax is hidden. A
  // zero-height box on the baseline cannot grow the line box in any font.
  '.cm-widgetBuffer': { height: '0', verticalAlign: 'baseline' },

  // The file name, at the top of the page and in the shape of a title.
  '.cm-md-title': {
    margin: '0 20px 1em',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
    fontSize: '1.74em',
    fontWeight: '640',
    letterSpacing: '-0.025em',
    lineHeight: '1.2',
  },
  // The name can be typed into. It says so only when asked, by the pointer or
  // the keyboard: a title that looks like a text field all the time stops
  // looking like a title.
  '.cm-md-title-name': {
    outline: 'none',
    borderRadius: 'var(--radius-sm)',
    transition: 'box-shadow 120ms var(--ease), background-color 120ms var(--ease)',
  },
  '.cm-md-title.is-editable .cm-md-title-name': { cursor: 'text' },
  '.cm-md-title.is-editable .cm-md-title-name:hover': {
    boxShadow: '0 0 0 4px var(--surface-hover)',
    backgroundColor: 'var(--surface-hover)',
  },
  '.cm-md-title.is-editable .cm-md-title-name:focus': {
    boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  },
  '.cm-md-title[data-pending] .cm-md-title-name': { opacity: '0.6' },
  // The extension is part of the name on disk but not of what is typed, so it
  // is set apart: another face, smaller, quieter, and out of reach of the
  // cursor and the selection.
  '.cm-md-title-ext': {
    marginLeft: '0.18em',
    color: 'var(--text-tertiary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.46em',
    fontWeight: '450',
    letterSpacing: '0',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  '.cm-md-title-refused': {
    display: 'none',
    marginTop: '6px',
    color: 'var(--tone-red)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
    fontWeight: '450',
    letterSpacing: '0',
    lineHeight: '1.4',
  },
  '.cm-md-title[data-refused] .cm-md-title-refused': { display: 'block' },

  // Headings. Each line keeps its own line-height so that revealing the '#'
  // never changes the height of the line.
  '.cm-md-heading': {
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-heading)',
    fontWeight: '620',
  },
  '.cm-md-h1': {
    fontSize: '1.5em',
    letterSpacing: '-0.02em',
    lineHeight: '1.3',
    paddingTop: '0.8em',
  },
  '.cm-md-h2': {
    fontSize: '1.28em',
    letterSpacing: '-0.015em',
    lineHeight: '1.35',
    paddingTop: '0.7em',
  },
  '.cm-md-h3': { fontSize: '1.12em', lineHeight: '1.4', paddingTop: '0.5em' },
  '.cm-md-h4': { fontSize: '1em', paddingTop: '0.4em' },
  '.cm-md-h5': { fontSize: '0.94em' },
  '.cm-md-h6': { fontSize: '0.88em', color: 'var(--text-tertiary)' },

  // Quote.
  '.cm-md-quote': {
    borderLeft: '2px solid var(--border-emphasis)',
    paddingLeft: '18px',
    color: 'var(--text-tertiary)',
  },

  // Code block. The ends are rounded, which needs the first and last lines
  // marked, and the fence stays visible as a dim hairline of text.
  '.cm-md-code': {
    background: 'var(--code-bg)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.84em',
    lineHeight: '1.65',
  },
  '.cm-md-code.is-first': {
    marginTop: '0.5em',
    paddingTop: '0.5em',
    borderTopLeftRadius: 'var(--radius-md)',
    borderTopRightRadius: 'var(--radius-md)',
  },
  '.cm-md-code.is-last': {
    marginBottom: '0.9em',
    paddingBottom: '0.6em',
    borderBottomLeftRadius: 'var(--radius-md)',
    borderBottomRightRadius: 'var(--radius-md)',
  },

  '.cm-md-bullet': { color: 'var(--accent)' },
  '.cm-md-task': {
    margin: '0 0.3em 0 0',
    accentColor: 'var(--accent)',
    verticalAlign: '-0.12em',
  },
  '.cm-md-rule': {
    display: 'inline-block',
    width: '100%',
    borderTop: '1px solid var(--border-default)',
    verticalAlign: 'middle',
  },

  // The file name, front matter and everything else sit inside the same column,
  // so blocks use the same 20px side inset as the text lines.
  '.cm-md-frontmatter': {
    margin: '0 20px 1.6em',
    padding: '12px 14px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--surface-1)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.76em',
    lineHeight: '1.5',
    cursor: 'default',
  },
  '.cm-md-prop': {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: 'minmax(5rem, 8rem) 1fr',
    padding: '3px 0',
  },
  '.cm-md-prop-key': { color: 'var(--text-disabled)' },
  '.cm-md-prop-values': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    color: 'var(--text-secondary)',
  },
  '.cm-md-chip': {
    padding: '1px 8px',
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--accent) 13%, transparent)',
    color: 'var(--accent-text)',
    fontSize: '0.94em',
    fontWeight: '500',
  },

  // Callouts. The type class only sets one variable, and the box below reads
  // it, so a new type is one entry in the palette.
  '.cm-md-callout': {
    paddingLeft: '18px',
    borderLeft: '2px solid var(--callout-color)',
    background: 'color-mix(in srgb, var(--callout-color) 8%, transparent)',
    color: 'var(--text-secondary)',
    fontStyle: 'normal',
  },
  '.cm-md-callout.is-first': {
    marginTop: '0.8em',
    paddingTop: '0.5em',
    borderTopRightRadius: 'var(--radius-md)',
    color: 'var(--callout-color)',
    fontWeight: '600',
  },
  '.cm-md-callout.is-last': {
    marginBottom: '0.9em',
    paddingBottom: '0.6em',
    borderBottomRightRadius: 'var(--radius-md)',
  },
  '.cm-md-callout-icon': {
    display: 'inline-block',
    width: '15px',
    height: '15px',
    marginRight: '0.45em',
    color: 'var(--callout-color)',
    verticalAlign: '-0.16em',
  },
  '.cm-md-callout-note': { '--callout-color': 'var(--tone-blue)' },
  '.cm-md-callout-abstract': { '--callout-color': 'var(--tone-teal)' },
  '.cm-md-callout-tip': { '--callout-color': 'var(--tone-green)' },
  '.cm-md-callout-success': { '--callout-color': 'var(--tone-green)' },
  '.cm-md-callout-question': { '--callout-color': 'var(--tone-yellow)' },
  '.cm-md-callout-important': { '--callout-color': 'var(--tone-purple)' },
  '.cm-md-callout-warning': { '--callout-color': 'var(--tone-orange)' },
  '.cm-md-callout-caution': { '--callout-color': 'var(--tone-red)' },
  '.cm-md-callout-failure': { '--callout-color': 'var(--tone-red)' },
  '.cm-md-callout-bug': { '--callout-color': 'var(--tone-red)' },
  '.cm-md-callout-example': { '--callout-color': 'var(--tone-purple)' },
  '.cm-md-callout-quote': { '--callout-color': 'var(--border-emphasis)' },

  // Images, drawn where they are written.
  '.cm-md-image': {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '100%',
    lineHeight: '0',
    verticalAlign: 'top',
  },
  '.cm-md-image img': {
    maxWidth: '100%',
    borderRadius: 'var(--radius-md)',
    background: 'var(--surface-1)',
  },
  '.cm-md-image.is-missing::after': {
    display: 'block',
    padding: '10px 14px',
    border: '1px dashed var(--border-emphasis)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-disabled)',
    content: '"imagem não encontrada"',
    fontFamily: 'var(--font-ui)',
    fontSize: '11px',
    lineHeight: '1.2',
  },
  '.cm-md-image-handle': {
    position: 'absolute',
    right: '-3px',
    bottom: '6px',
    width: '12px',
    height: '28px',
    borderRadius: '999px',
    background: 'var(--accent)',
    cursor: 'ew-resize',
    opacity: '0',
    transition: 'opacity 140ms ease',
  },
  '.cm-md-image:hover .cm-md-image-handle': { opacity: '0.85' },

  // Footnote definitions, kept apart from the prose.
  '.cm-md-footnote-def': {
    paddingLeft: '18px',
    borderLeft: '2px solid var(--border-subtle)',
    color: 'var(--text-tertiary)',
    fontSize: '0.92em',
  },
  '.cm-md-footnote-def.is-first': { marginTop: '0.5em' },

  // Tables, drawn as a grid and edited inside it.
  '.cm-md-table-wrap': {
    position: 'relative',
    margin: '0.2em 20px 1.4em',
    paddingTop: '9px',
    overflowX: 'auto',
    fontFamily: 'var(--font-ui)',
  },
  '.cm-md-table-wrap.is-raw': {
    padding: '10px 14px',
    border: '1px dashed var(--border-emphasis)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-tertiary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82em',
    whiteSpace: 'pre',
  },
  '.cm-md-table': {
    // Natural column widths, but never narrower than the column of text.
    width: 'auto',
    minWidth: 'calc(100% - 9px)',
    marginLeft: '9px',
    borderCollapse: 'separate',
    borderSpacing: '0',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.8em',
  },
  '.cm-md-cell': {
    position: 'relative',
    padding: '0',
    borderBottom: '1px solid var(--border-subtle)',
    verticalAlign: 'top',
  },
  '.cm-md-cell + .cm-md-cell': { borderLeft: '1px solid var(--border-subtle)' },
  '.cm-md-table tbody tr:last-child .cm-md-cell': { borderBottom: '0' },
  '.cm-md-table th.cm-md-cell': {
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    fontWeight: '580',
  },
  '.cm-md-table td.cm-md-cell': { color: 'var(--text-secondary)' },

  '.cm-md-cell-text': {
    minWidth: '3.5em',
    minHeight: '1.2em',
    padding: '7px 12px',
    outline: 'none',

    // The editor breaks long words to keep prose inside the column. A table
    // cell that does the same reads as a typo.
    overflowWrap: 'normal',
    wordBreak: 'normal',
  },
  '.cm-md-cell-text:focus': {
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--accent)',
  },

  // The handles: thin bars on the edge of the table, the way a spreadsheet
  // does it. Only the ones belonging to the cell under the pointer light up:
  // lighting all of them at once draws a continuous track that reads as a
  // scrollbar. They are always in the layout and only ever change colour, so
  // nothing on the page moves when the pointer arrives.
  '.cm-md-col-handle, .cm-md-row-handle': {
    position: 'absolute',
    background: 'transparent',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'background 90ms ease',
  },
  '.cm-md-col-handle': { top: '-6px', left: '0', right: '0', height: '4px' },
  '.cm-md-row-handle': { left: '-6px', top: '0', bottom: '0', width: '4px' },
  '.cm-md-col-handle.is-shown, .cm-md-row-handle.is-shown': {
    background: 'var(--border-emphasis)',
  },
  '.cm-md-col-handle:hover, .cm-md-row-handle:hover': { background: 'var(--accent)' },

  // Markdown drawn inside a cell. The editor's own colours come from the
  // syntax tree of the document, which does not reach into a widget.
  '.cm-md-cell-text code': {
    padding: '0.1em 0.35em',
    borderRadius: '4px',
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
  },
  '.cm-md-cell-text strong': { color: 'var(--text-primary)', fontWeight: '620' },
  '.cm-md-cell-text em': { fontStyle: 'italic' },
  '.cm-md-cell-text del': { textDecoration: 'line-through', color: 'var(--text-tertiary)' },
  '.cm-md-cell-text mark': {
    padding: '0.05em 0.2em',
    borderRadius: '3px',
    background: 'color-mix(in srgb, var(--accent) 28%, transparent)',
    color: 'inherit',
  },
  '.cm-md-cell-text a, .cm-md-cell-text .wikilink': {
    color: 'var(--accent-text)',
    textDecoration: 'none',
  },
  '.cm-md-cell-text .footnote': { color: 'var(--accent-text)', fontSize: '0.75em' },
})

export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.strong, color: 'var(--text-primary)', fontWeight: '620' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, color: 'var(--text-disabled)', textDecoration: 'line-through' },
    {
      tag: highlightTag,
      background: 'color-mix(in srgb, var(--tone-yellow) 26%, transparent)',
      borderRadius: '3px',
      color: 'var(--text-primary)',
    },
    { tag: [t.link, t.url, wikilinkTag], color: 'var(--accent-text)' },
    {
      tag: footnoteTag,
      color: 'var(--accent-text)',
      fontSize: '0.75em',
      verticalAlign: 'super',
    },
    {
      tag: t.monospace,
      padding: '0.1em 0.3em',
      borderRadius: '4px',
      background: 'var(--code-bg)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.86em',
    },
    { tag: t.processingInstruction, color: 'var(--syntax-mark)' },
    { tag: t.keyword, color: 'var(--syntax-keyword)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
    { tag: t.comment, color: 'var(--text-disabled)', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null], color: 'var(--syntax-number)' },
    {
      tag: [t.function(t.variableName), t.definition(t.variableName)],
      color: 'var(--syntax-function)',
    },
    { tag: t.typeName, color: 'var(--syntax-type)' },
  ]),
)
