/**
 * Draws the app icon: the brand mark, at 1024px, as a PNG.
 *
 * It is generated rather than committed as a binary so the mark can be changed
 * by editing numbers instead of by opening a drawing program. Feed the result
 * to `npx tauri icon` to produce every size the platforms want.
 *
 * Usage: node scripts/make-icon.mjs [saída.png]
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 1024
const SAMPLES = 4 // supersampling, which is what gives the edges their smoothness

const ACCENT = [255, 101, 63]
const INK = [255, 255, 255]

/** The mark, in the same 24 unit box the interface draws it in. */
const RADIUS = 6
const STROKE = 1.9
const POINTS = [
  [7.4, 16.6],
  [7.4, 7.9],
  [11.9, 13.4],
  [16.1, 7.9],
  [16.6, 16.6],
]

const scale = (SIZE * SAMPLES) / 24

function insideRoundedSquare(x, y) {
  const inset = 1.4 * scale
  const radius = RADIUS * scale
  const min = inset
  const max = SIZE * SAMPLES - inset
  if (x < min || y < min || x > max || y > max) return false

  const cx = Math.min(Math.max(x, min + radius), max - radius)
  const cy = Math.min(Math.max(y, min + radius), max - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

/** Distance from a point to a segment, which is how the stroke gets its width. */
function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function onStroke(x, y) {
  const half = (STROKE / 2) * scale
  for (let index = 0; index < POINTS.length - 1; index++) {
    const from = POINTS[index].map((value) => value * scale)
    const to = POINTS[index + 1].map((value) => value * scale)
    if (distanceToSegment(x, y, from, to) <= half) return true
  }
  return false
}

function render() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let square = 0
      let ink = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x * SAMPLES + sx + 0.5
          const py = y * SAMPLES + sy + 0.5
          if (!insideRoundedSquare(px, py)) continue
          square++
          if (onStroke(px, py)) ink++
        }
      }

      const total = SAMPLES * SAMPLES
      const alpha = square / total
      const inkShare = square === 0 ? 0 : ink / square
      const offset = (y * SIZE + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(
          ACCENT[channel] * (1 - inkShare) + INK[channel] * inkShare,
        )
      }
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }

  return pixels
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

let table
function crc32(buffer) {
  if (!table) {
    table = new Int32Array(256)
    for (let index = 0; index < 256; index++) {
      let value = index
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      table[index] = value
    }
  }
  let crc = -1
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return crc ^ -1
}

function toPng(pixels) {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // truecolour with alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const target = process.argv[2] ?? 'icon.png'
writeFileSync(target, toPng(render()))
console.log('icon written to ' + target + ' (' + SIZE + 'x' + SIZE + ')')
