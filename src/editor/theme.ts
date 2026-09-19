/**
 * Editor styling. Every colour comes from a CSS variable, which is what makes a
 * new theme a list of variables instead of a code change.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { highlightTag, wikilinkTag } from './dialect'

export const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--font-size)',
    height: '100%',
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
    caretColor: 'var(--accent)',
    padding: '3rem 0 40vh',
    maxWidth: 'var(--measure)',
    margin: '0 auto',
  },
  '.cm-line': { padding: '0 1rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },

  // CodeMirror puts a zero-width <img> on each side of a replaced range so the
  // caret has somewhere to land. By default the image is 1em tall and aligned to
  // text-top, and on a heading, where the line box is tighter than the font box,
  // that pushes the line one pixel taller the moment the syntax is hidden. A
  // zero-height box on the baseline cannot grow the line box in any font.
  '.cm-widgetBuffer': { height: '0', verticalAlign: 'baseline' },
  '.cm-gutters': { display: 'none' },

  // Headings. The line keeps its own line-height so that revealing the '#'
  // never changes the height of the line.
  '.cm-md-heading': { fontFamily: 'var(--font-heading)', fontWeight: '650', color: 'var(--heading)' },
  '.cm-md-h1': { fontSize: '1.8em', lineHeight: '1.3', paddingTop: '0.6em' },
  '.cm-md-h2': { fontSize: '1.5em', lineHeight: '1.3', paddingTop: '0.5em' },
  '.cm-md-h3': { fontSize: '1.28em', lineHeight: '1.35' },
  '.cm-md-h4': { fontSize: '1.13em', lineHeight: '1.4' },
  '.cm-md-h5': { fontSize: '1em' },
  '.cm-md-h6': { fontSize: '0.92em', color: 'var(--text-dim)' },

  '.cm-md-quote': {
    borderLeft: '3px solid var(--quote-bar)',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  },
  // The file name, at the top of the page and in the shape of a title.
  '.cm-md-title': {
    margin: '0 1rem 0.9em',
    fontFamily: 'var(--font-heading)',
    fontSize: '2.1em',
    fontWeight: '700',
    lineHeight: '1.15',
    color: 'var(--heading)',
  },

  // Tables, drawn as a grid while the cursor is elsewhere.
  '.cm-md-table-wrap': { margin: '0.3em 1rem 1.3em', overflowX: 'auto' },
  '.cm-md-table': {
    borderCollapse: 'collapse',

    // Natural column widths, but never narrower than the column of text.
    width: 'auto',
    minWidth: '100%',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.85em',
  },
  '.cm-md-table th, .cm-md-table td': {
    padding: '5px 10px',
    border: '1px solid var(--border)',
    verticalAlign: 'top',

    // The editor breaks long words to keep prose inside the column. A table
    // cell that does the same reads as a typo.
    overflowWrap: 'normal',
    wordBreak: 'normal',
  },
  '.cm-md-table thead th': {
    background: 'var(--bg-sunken)',
    fontWeight: '650',
    color: 'var(--text-strong)',
  },
  '.cm-md-table tbody tr:nth-child(even)': {
    background: 'color-mix(in srgb, var(--text) 3%, transparent)',
  },

  // Front matter, drawn as a block of properties.
  '.cm-md-frontmatter': {
    margin: '0 1rem 1.6em',
    padding: '0.6rem 0.85rem',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-sunken)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.78em',
    lineHeight: '1.5',
    cursor: 'default',
  },
  '.cm-md-prop': {
    display: 'grid',
    gridTemplateColumns: 'minmax(5rem, 9rem) 1fr',
    gap: '0.5rem',
    padding: '2px 0',
  },
  '.cm-md-prop-key': { color: 'var(--text-faint)' },
  '.cm-md-prop-values': { display: 'flex', flexWrap: 'wrap', gap: '4px', color: 'var(--text)' },
  '.cm-md-chip': {
    padding: '1px 7px',
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
    color: 'var(--text)',
  },

  // Callouts. The type class only sets two variables, and the box below reads
  // them, so a new type is one entry in the palette.
  '.cm-md-callout': {
    backgroundColor: 'color-mix(in srgb, var(--callout-color) 10%, transparent)',
    borderLeft: '3px solid var(--callout-color)',
    paddingLeft: '0.85rem',
    fontStyle: 'normal',
    color: 'var(--text)',
  },
  '.cm-md-callout.is-first': {
    marginTop: '0.7em',
    paddingTop: '0.35em',
    borderTopRightRadius: 'var(--radius)',
    fontWeight: '650',
    color: 'var(--callout-color)',
  },
  '.cm-md-callout.is-last': {
    marginBottom: '0.7em',
    paddingBottom: '0.45em',
    borderBottomRightRadius: 'var(--radius)',
  },
  '.cm-md-callout-icon': {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    marginRight: '0.4em',
    verticalAlign: '-0.18em',
    color: 'var(--callout-color)',
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
  '.cm-md-callout-quote': { '--callout-color': 'var(--text-faint)' },

  '.cm-md-code': {
    backgroundColor: 'var(--code-bg)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.92em',
  },
  '.cm-md-bullet': { color: 'var(--accent)' },
  '.cm-md-task': { accentColor: 'var(--accent)', margin: '0 0.15em 0 0', verticalAlign: '-0.1em' },
  '.cm-md-rule': {
    display: 'inline-block',
    width: '100%',
    borderTop: '1px solid var(--border)',
    verticalAlign: 'middle',
  },
})

export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.strong, fontWeight: '650', color: 'var(--text-strong)' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-dim)' },
    { tag: highlightTag, backgroundColor: 'var(--highlight-bg)', borderRadius: '2px' },
    { tag: [t.link, t.url, wikilinkTag], color: 'var(--link)' },
    { tag: t.monospace, fontFamily: 'var(--font-mono)', backgroundColor: 'var(--code-bg)' },
    { tag: t.processingInstruction, color: 'var(--syntax-mark)' },
    { tag: t.keyword, color: 'var(--syntax-keyword)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--syntax-string)' },
    { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null], color: 'var(--syntax-number)' },
    { tag: [t.function(t.variableName), t.definition(t.variableName)], color: 'var(--syntax-function)' },
    { tag: t.typeName, color: 'var(--syntax-type)' },
  ]),
)
