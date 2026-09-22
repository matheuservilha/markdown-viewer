import { describe, expect, it } from 'vitest'
import { baseName, nativeBaseName, withoutExtension } from './fs'

describe('nativeBaseName', () => {
  it('cuts a Windows path at its backslashes', () => {
    expect(nativeBaseName('C:\\Users\\mathe\\Downloads\\jev-test\\README.md')).toBe('README.md')
  })

  it('cuts a Unix path at its slashes', () => {
    expect(nativeBaseName('/Users/reasset/Downloads/nota.md')).toBe('nota.md')
  })

  it('takes the last separator when a path carries both', () => {
    expect(nativeBaseName('C:\\Users\\mathe/Downloads\\nota.md')).toBe('nota.md')
  })

  it('a bare name is already its own name', () => {
    expect(nativeBaseName('nota.md')).toBe('nota.md')
  })

  it('a path ending in a separator still has a name', () => {
    expect(nativeBaseName('C:\\Users\\mathe\\Downloads\\')).toBe('Downloads')
    expect(nativeBaseName('/Users/reasset/Downloads/')).toBe('Downloads')
  })
})

describe('baseName', () => {
  it('keeps a backslash, which is a legal character in a name on macOS', () => {
    // The reason the two functions are not one: inside a base every path is
    // joined with '/', so a backslash here belongs to the name itself.
    expect(baseName('notas/a\\b.md')).toBe('a\\b.md')
  })
})

describe('withoutExtension', () => {
  it('drops the extension', () => {
    expect(withoutExtension('README.md')).toBe('README')
  })

  it('drops only the last one', () => {
    expect(withoutExtension('notas.tar.gz')).toBe('notas.tar')
  })

  it('leaves a name that has none', () => {
    expect(withoutExtension('LICENSE')).toBe('LICENSE')
  })

  it('leaves a dotfile whole, because the dot starts the name', () => {
    expect(withoutExtension('.gitignore')).toBe('.gitignore')
  })
})
