import { describe, expect, it } from 'vitest'
import {
  PIN_COLORS,
  addPin,
  findPin,
  freeColor,
  isPinned,
  pinTitle,
  recolourPin,
  removePin,
  renamePin,
  reorderPins,
  repointPin,
  togglePin,
  type Pin,
} from './pinned'

function target(id: string, name = id + '.md') {
  return { id, baseId: '/notas', path: id + '.md', name }
}

describe('addPin', () => {
  it('puts the note at the end of the list', () => {
    const pins = addPin(addPin([], target('a')), target('b'))
    expect(pins.map((pin) => pin.id)).toEqual(['a', 'b'])
  })

  it('does nothing at all when the note is already there', () => {
    const once = addPin([], target('a'))
    expect(addPin(once, target('a'))).toEqual(once)
  })

  it('keeps the full path of a file pinned from outside every folder', () => {
    const [pin] = addPin([], { ...target('a'), label: '/tmp/a.md' })
    expect(pin?.label).toBe('/tmp/a.md')
  })

  it('leaves the label off when there is none, rather than storing undefined', () => {
    const [pin] = addPin([], target('a'))
    expect('label' in (pin as Pin)).toBe(false)
  })
})

describe('togglePin', () => {
  it('pins what is not pinned and unpins what is', () => {
    const on = togglePin([], target('a'))
    expect(isPinned(on, 'a')).toBe(true)
    expect(isPinned(togglePin(on, target('a')), 'a')).toBe(false)
  })
})

describe('removePin', () => {
  it('leaves the others alone', () => {
    const pins = addPin(addPin([], target('a')), target('b'))
    expect(removePin(pins, 'a').map((pin) => pin.id)).toEqual(['b'])
  })
})

describe('freeColor', () => {
  it('hands out every colour before repeating one', () => {
    let pins: Pin[] = []
    for (let n = 0; n < PIN_COLORS.length; n++) pins = addPin(pins, target('n' + n))
    expect(new Set(pins.map((pin) => pin.color)).size).toBe(PIN_COLORS.length)
  })

  it('goes back to the least used colour once they have all been used', () => {
    const pins = PIN_COLORS.map((color, index): Pin => ({
      id: String(index),
      baseId: '/n',
      path: 'p',
      name: 'n',
      color,
      at: 0,
    })).slice(1)
    expect(freeColor(pins)).toBe(PIN_COLORS[0])
  })
})

describe('reorderPins', () => {
  const pins = ['a', 'b', 'c'].reduce<Pin[]>((all, id) => addPin(all, target(id)), [])

  it('puts the list in the order it was given', () => {
    expect(reorderPins(pins, ['c', 'a', 'b']).map((pin) => pin.id)).toEqual(['c', 'a', 'b'])
  })

  it('ignores ids the list has never heard of', () => {
    expect(reorderPins(pins, ['c', 'zz', 'a', 'b']).map((pin) => pin.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps a pin the order forgot instead of dropping it', () => {
    expect(reorderPins(pins, ['c', 'a']).map((pin) => pin.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('renamePin and recolourPin', () => {
  const pins = addPin([], target('a'))

  it('renames only the one asked for', () => {
    expect(findPin(renamePin(pins, 'a', 'outro.md'), 'a')?.name).toBe('outro.md')
  })

  it('leaves the list alone when the id is unknown', () => {
    expect(renamePin(pins, 'zz', 'x')).toEqual(pins)
  })

  it('changes the colour', () => {
    expect(findPin(recolourPin(pins, 'a', 'coral'), 'a')?.color).toBe('coral')
  })
})

describe('repointPin', () => {
  const pins = addPin(addPin([], target('a')), target('b'))

  it('moves the note to its new address and keeps colour and place', () => {
    const moved = repointPin(pins, 'a', target('c', 'c.md'))
    expect(moved.map((pin) => pin.id)).toEqual(['c', 'b'])
    expect(moved[0]?.color).toBe(pins[0]?.color)
    expect(moved[0]?.name).toBe('c.md')
  })

  it('takes the full path of a loose file, and drops one that no longer applies', () => {
    const loose = repointPin(pins, 'a', { ...target('/x/n.md'), label: '/x/n.md' })
    expect(loose[0]?.label).toBe('/x/n.md')
    expect(repointPin(loose, '/x/n.md', target('d'))[0]).not.toHaveProperty('label')
  })
})

describe('pinTitle', () => {
  it('drops the extension', () => {
    expect(pinTitle({ ...target('a'), color: 'coral', at: 0 })).toBe('a')
  })

  it('keeps a name that is nothing but an extension', () => {
    const pin: Pin = { ...target('a'), name: '.gitignore', color: 'coral', at: 0 }
    expect(pinTitle(pin)).toBe('.gitignore')
  })
})
