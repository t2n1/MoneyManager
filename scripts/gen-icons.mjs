// Vẽ logo "Sổ Gạo" (giống public/favicon.svg) bằng toán hình học thuần rồi
// tự đóng gói PNG (zlib có sẵn trong Node) — không cần thư viện ngoài.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const GREEN = [0x00, 0x82, 0x36]
const WHITE = [0xff, 0xff, 0xff]
const SPINE = [0xb9, 0xf8, 0xcf]
const AMBER = [0xfb, 0xbf, 0x24]

function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r))
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r))
  const dx = x - cx, dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inEllipseRot(x, y, cx, cy, rx, ry, angDeg, px, py) {
  // xoay điểm quanh pivot (px,py) theo -góc rồi thử ellipse trục thẳng
  const a = (-angDeg * Math.PI) / 180
  const dx = x - px, dy = y - py
  const ux = px + dx * Math.cos(a) - dy * Math.sin(a)
  const uy = py + dx * Math.sin(a) + dy * Math.cos(a)
  const ex = (ux - cx) / rx, ey = (uy - cy) / ry
  return ex * ex + ey * ey <= 1
}

function inRibbon(x, y) {
  // đa giác: (322,100)(362,100)(362,178)(342,160)(322,178)
  if (x < 322 || x > 362 || y < 100 || y > 178) return false
  // phần khuyết hình chữ V ở đáy: dưới hai đường chéo từ (322,178)/(362,178) tới (342,160)
  const dip = 160 + (18 / 20) * Math.abs(x - 342) // biên dưới của dải
  return y <= dip
}

// Trả màu logic tại toạ độ 512-space (chưa scale)
function colorAt(x, y) {
  if (
    inEllipseRot(x, y, 283, 250, 23, 52, -36, 283, 350) ||
    inEllipseRot(x, y, 283, 250, 23, 52, 36, 283, 350) ||
    inEllipseRot(x, y, 283, 240, 24, 55, 0, 283, 240)
  ) {
    // hạt gạo chỉ vẽ khi nằm trên bìa sổ
    if (inRoundRect(x, y, 132, 100, 248, 312, 36)) return GREEN
  }
  if (inRibbon(x, y)) return AMBER
  if (x >= 176 && x <= 186 && y >= 100 && y <= 412 && inRoundRect(x, y, 132, 100, 248, 312, 36)) return SPINE
  if (inRoundRect(x, y, 132, 100, 248, 312, 36)) return WHITE
  if (inRoundRect(x, y, 0, 0, 512, 512, 120)) return GREEN
  return null // trong suốt (ngoài góc bo)
}

function render(size, pad, opaqueBg) {
  const S = 4 // supersampling 4x4
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const k = (512 - 2 * pad) / 512 // scale khi có lề (icon maskable)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = ((x + (sx + 0.5) / S) * 512) / size
          const fy = ((y + (sy + 0.5) / S) * 512) / size
          const lx = (fx - pad) / k
          const ly = (fy - pad) / k
          let c = lx >= 0 && lx <= 512 && ly >= 0 && ly <= 512 ? colorAt(lx, ly) : null
          if (!c && opaqueBg) c = GREEN
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255 }
        }
      }
      const n = S * S
      const off = y * (size * 4 + 1) + 1 + x * 4
      const alpha = a / n
      // premultiply-tránh viền đen: chia lại theo alpha khi alpha > 0
      raw[off] = alpha > 0 ? Math.round(r / (a / 255)) : 0
      raw[off + 1] = alpha > 0 ? Math.round(g / (a / 255)) : 0
      raw[off + 2] = alpha > 0 ? Math.round(b / (a / 255)) : 0
      raw[off + 3] = Math.round(alpha)
    }
  }
  return raw
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = process.argv[2]
writeFileSync(`${out}/icon-192.png`, png(192, render(192, 0, false)))
writeFileSync(`${out}/icon-512.png`, png(512, render(512, 0, false)))
writeFileSync(`${out}/icon-maskable-512.png`, png(512, render(512, 51.2, true)))
console.log('OK: icon-192, icon-512, icon-maskable-512')
