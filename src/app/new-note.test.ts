import { describe, expect, it } from 'vitest'
import { noteHome } from './new-note'

const folder = { id: 'base' }
const other = { id: 'outra' }

const inFolder = { id: 'base:notas/a.md', baseId: 'base', path: 'notas/a.md' }
const atRoot = { id: 'base:a.md', baseId: 'base', path: 'a.md' }
// A file opened on its own: its base is the file, and its path is empty.
const loose = { id: 'C:\\Users\\m\\README.md:', baseId: 'C:\\Users\\m\\README.md', path: '' }

describe('noteHome', () => {
  it('puts the note beside the open file', () => {
    expect(noteHome([folder], [inFolder], inFolder.id)).toEqual({ baseId: 'base', parent: 'notas' })
  })

  it('puts it at the root when the open file is at the root', () => {
    expect(noteHome([folder], [atRoot], atRoot.id)).toEqual({ baseId: 'base', parent: '' })
  })

  it('does not try to create inside a loose file, which is not a folder', () => {
    // The bug: the loose file's base is the file itself, so the note was being
    // asked for inside it.
    expect(noteHome([folder], [loose], loose.id)).toEqual({ baseId: 'base', parent: '' })
  })

  it('answers nothing when no folder is open at all', () => {
    expect(noteHome([], [loose], loose.id)).toBeNull()
    expect(noteHome([], [], null)).toBeNull()
  })

  it('uses the folder of the tab in front, not just the first folder', () => {
    const tab = { id: 'outra:b.md', baseId: 'outra', path: 'b.md' }
    expect(noteHome([folder, other], [tab], tab.id)).toEqual({ baseId: 'outra', parent: '' })
  })

  it('falls back to the first folder when nothing is in front', () => {
    expect(noteHome([folder, other], [], null)).toEqual({ baseId: 'base', parent: '' })
  })
})
