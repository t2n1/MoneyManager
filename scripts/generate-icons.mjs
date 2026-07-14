// Sinh icon PWA (PNG) thuần Node — không cần thư viện đồ họa.
// Vẽ: nền xanh lá bo góc + quyển sổ trắng có các dòng kẻ.
// Chạy: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const GREEN = [22, 163, 74, 255] // #16a34a (theme color)
const WHITE = [255, 255, 255, 255]
const LINE = [187, 247, 208, 255] // green-200 — dòng kẻ trong sổ

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixelAt) {
  // Raw RGBA, mỗi scanline có filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y)
      const o = row + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Icon: nền xanh (bo góc nếu !fullBleed) + sổ trắng có dòng kẻ. */
function makeIcon(size, { fullBleed = false } = {}) {
  const radius = fullBleed ? 0 : Math.round(size * 0.2)
  // Sổ chiếm vùng giữa; với maskable (fullBleed) thu nhỏ vào safe zone
  const scale = fullBleed ? 0.62 : 0.72
  const bw = size * scale * 0.78 // rộng sổ
  const bh = size * scale // cao sổ
  const bx = (size - bw) / 2
  const by = (size - bh) / 2
  const cr = size * 0.04 // bo góc sổ
  const spineW = size * 0.05

  const inRoundedRect = (x, y, rx, ry, w, h, r) => {
    if (x < rx || x >= rx + w || y < ry || y >= ry + h) return false
    const cx = Math.max(rx + r, Math.min(x, rx + w - r))
    const cy = Math.max(ry + r, Math.min(y, ry + h - r))
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2 || (x >= rx + r && x < rx + w - r) || (y >= ry + r && y < ry + h - r)
  }

  return encodePng(size, (x, y) => {
    // nền
    if (!inRoundedRect(x, y, 0, 0, size, size, radius)) return [0, 0, 0, 0]
    // quyển sổ
    if (inRoundedRect(x, y, bx, by, bw, bh, cr)) {
      // gáy sổ bên trái
      if (x < bx + spineW) return GREEN
      // các dòng kẻ ngang
      const lineH = size * 0.035
      const gap = bh / 5
      for (let i = 1; i <= 3; i++) {
        const ly = by + gap * i + gap * 0.3
        if (y >= ly && y < ly + lineH && x > bx + spineW + bw * 0.12 && x < bx + bw * 0.85) {
          return LINE
        }
      }
      return WHITE
    }
    return GREEN
  })
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', makeIcon(192))
writeFileSync('public/icon-512.png', makeIcon(512))
writeFileSync('public/icon-maskable-512.png', makeIcon(512, { fullBleed: true }))
console.log('Đã sinh public/icon-192.png, icon-512.png, icon-maskable-512.png')
