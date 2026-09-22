import { describe, expect, it } from 'vitest'
import { restoreMayChooseActive } from './session'

describe('restoreMayChooseActive', () => {
  it('chooses when nothing is in front yet', () => {
    expect(restoreMayChooseActive(null, [])).toBe(true)
  })

  it('chooses when the tab in front is one it opened', () => {
    expect(restoreMayChooseActive('a', ['a', 'b'])).toBe(true)
  })

  it('stands back when the system opened a file while it was reading', () => {
    // The double clicked file is not among the restored tabs, so it is newer
    // than anything the session remembers.
    expect(restoreMayChooseActive('/Users/m/Downloads/nota.md', ['a', 'b'])).toBe(false)
  })

  it('stands back when it restored nothing and a file arrived', () => {
    expect(restoreMayChooseActive('nova', [])).toBe(false)
  })
})
