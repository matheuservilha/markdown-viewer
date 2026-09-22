import { describe, expect, it } from 'vitest'
import { difference } from './EditorPane'

function apply(from: string, to: string): string {
  const change = difference(from, to)
  return from.slice(0, change.from) + change.insert + from.slice(change.to)
}

describe('difference', () => {
  it('replaces only what changed, so a cursor elsewhere stays put', () => {
    expect(difference('abc def', 'abc Xdef')).toEqual({ from: 4, to: 4, insert: 'X' })
    expect(difference('abc def', 'abc df')).toEqual({ from: 5, to: 6, insert: '' })
  })

  it('turns one text into the other in every case', () => {
    const pairs: [string, string][] = [
      ['', 'novo'],
      ['velho', ''],
      ['aaa', 'aaaa'],
      ['aaaa', 'aa'],
      ['# Título\n\ncorpo', '# Título\n\ncorpo novo\n'],
      ['igual', 'igual'],
    ]
    for (const [from, to] of pairs) expect(apply(from, to)).toBe(to)
  })
})
