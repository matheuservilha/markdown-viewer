import { describe, expect, it } from 'vitest'
import { decode, encode } from './text'

const bytes = (text: string) => new TextEncoder().encode(text)
/**
 * Reads the bytes and writes them back untouched. The comparison is on bytes and
 * not on a decoded string, because TextDecoder eats a leading BOM and would hide
 * exactly the bug this is here to catch.
 */
const roundTrip = (text: string) => {
  const original = bytes(text)
  const { text: decoded, shape } = decode(original)
  return { written: [...encode(decoded, shape)], original: [...original] }
}

const survives = (text: string) => {
  const { written, original } = roundTrip(text)
  expect(written).toEqual(original)
}

describe('decode', () => {
  it('normalises CRLF to LF and remembers it', () => {
    const { text, shape } = decode(bytes('a\r\nb\r\n'))
    expect(text).toBe('a\nb\n')
    expect(shape.eol).toBe('\r\n')
  })

  it('keeps LF when the file uses it', () => {
    expect(decode(bytes('a\nb\n')).shape.eol).toBe('\n')
  })

  it('follows the majority in a mixed file', () => {
    expect(decode(bytes('a\r\nb\r\nc\n')).shape.eol).toBe('\r\n')
  })

  it('strips a BOM and remembers it', () => {
    const { text, shape } = decode(bytes('﻿título'))
    expect(text).toBe('título')
    expect(shape.bom).toBe(true)
  })

  it('flags bytes that are not UTF-8 instead of throwing', () => {
    const { shape } = decode(new Uint8Array([0xff, 0xfe, 0x41]))
    expect(shape.lossy).toBe(true)
    expect(shape.encoding).toBe('windows-1252')
  })
})

describe('encode', () => {
  it('gives back the same bytes for a CRLF file', () => {
    survives('linha um\r\nlinha dois\r\n')
  })

  it('gives back the same bytes for a file with a BOM', () => {
    survives('﻿# título\n')
  })

  it('keeps a missing trailing newline missing', () => {
    survives('sem quebra no fim')
  })

  it('keeps a trailing blank line', () => {
    survives('com quebra no fim\n\n')
  })

  it('does not turn LF into CRLF on a file that had none', () => {
    survives('a\nb\n')
  })
})
