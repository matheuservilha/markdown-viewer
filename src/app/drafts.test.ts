import { describe, expect, it } from 'vitest'
import { DRAFT_BASE, isDraft, nextDraftName, noteTitle } from './drafts'

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

describe('noteTitle', () => {
  it('takes the first line that has anything on it', () => {
    expect(noteTitle('\n\n  Comprar pão\nmais coisas', 'Sem título')).toBe('Comprar pão')
  })

  it('takes the heading marks off', () => {
    expect(noteTitle('## Reunião de quinta', 'Sem título')).toBe('Reunião de quinta')
  })

  it('takes the bullet and the checkbox off', () => {
    expect(noteTitle('- [ ] ligar para o cartório', 'Sem título')).toBe('ligar para o cartório')
  })

  it('takes the quote mark off', () => {
    expect(noteTitle('> citação', 'Sem título')).toBe('citação')
  })

  it('keeps the name it was born with when there is nothing written yet', () => {
    expect(noteTitle('   \n\n  ', 'Sem título 3')).toBe('Sem título 3')
  })

  it('does not let one very long line become the name of the note', () => {
    expect(noteTitle('x'.repeat(200), 'Sem título')).toHaveLength(60)
  })
})
