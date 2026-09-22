import { describe, expect, it } from 'vitest'
import { DRAFT_BASE, isDraft, nextDraftName } from './drafts'

describe('nextDraftName', () => {
  it('the first one is just the plain name', () => {
    expect(nextDraftName([])).toBe('Sem título')
  })

  it('the second one is numbered', () => {
    expect(nextDraftName(['Sem título'])).toBe('Sem título 2')
  })

  it('counts past the ones already taken', () => {
    expect(nextDraftName(['Sem título', 'Sem título 2', 'Sem título 3'])).toBe('Sem título 4')
  })

  it('fills a gap rather than always climbing', () => {
    expect(nextDraftName(['Sem título', 'Sem título 3'])).toBe('Sem título 2')
  })

  it('pays no attention to names that are not drafts', () => {
    expect(nextDraftName(['reuniao.md', 'Sem título'])).toBe('Sem título 2')
  })
})

describe('isDraft', () => {
  it('a draft tab is one whose base is the draft base', () => {
    expect(isDraft({ baseId: DRAFT_BASE })).toBe(true)
  })

  it('a file is not, wherever it lives', () => {
    expect(isDraft({ baseId: 'base' })).toBe(false)
    expect(isDraft({ baseId: '/Users/m/nota.md' })).toBe(false)
  })
})
