/**
 * Decoding and re-encoding of file bytes.
 *
 * The editor always works on a document with LF endings and no BOM. Everything
 * the original file carried (BOM, CRLF, trailing newline or the lack of one) is
 * kept in `TextShape` and put back byte for byte when the file is saved, so that
 * opening a file and saving it without typing produces an identical file.
 */

export type Eol = '\n' | '\r\n'

export interface TextShape {
  eol: Eol
  bom: boolean
  /** Label of the decoder that produced the text, e.g. 'utf-8'. */
  encoding: string
  /** True when the bytes were not valid UTF-8 and a lossy fallback was used. */
  lossy: boolean
}

export interface DecodedText {
  text: string
  shape: TextShape
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((byte, i) => bytes[i] === byte)
}

/** Counts CRLF against bare LF and picks whichever the file uses more. */
function detectEol(text: string): Eol {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\n') continue
    if (text[i - 1] === '\r') crlf++
    else lf++
  }
  return crlf > lf ? '\r\n' : '\n'
}

export function decode(bytes: Uint8Array): DecodedText {
  const bom = hasUtf8Bom(bytes)
  const body = bom ? bytes.subarray(UTF8_BOM.length) : bytes

  let raw: string
  let lossy = false
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    // Not UTF-8. Fall back to latin-1, which never fails, and flag the file so
    // the interface can warn before the person edits it.
    raw = new TextDecoder('windows-1252').decode(body)
    lossy = true
  }

  const eol = detectEol(raw)
  return {
    text: eol === '\r\n' ? raw.replace(/\r\n/g, '\n') : raw,
    shape: { eol, bom, encoding: lossy ? 'windows-1252' : 'utf-8', lossy },
  }
}

export function encode(text: string, shape: TextShape): Uint8Array<ArrayBuffer> {
  const body = shape.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text
  const encoded = new TextEncoder().encode(body)
  if (!shape.bom) return encoded
  const out = new Uint8Array(UTF8_BOM.length + encoded.length)
  out.set(UTF8_BOM)
  out.set(encoded, UTF8_BOM.length)
  return out
}
