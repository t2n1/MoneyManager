// Task 14: nut Luu luc chua du dieu kien phai doc duoc.
//
// Test nay TU TINH ty le tuong phan WCAG tu token trong index.css, khong tin so
// ghi trong chu thich cua goi. Vi sao: ai sau nay doi bang mau xanh thi test se
// keu ngay thay vi im lang troi theo.
//
// File nam o tests/ chu KHONG o src/ vi doc file bang node:fs — tsconfig cua
// src/ cam API Node (xem tests/contrast.test.ts, cung ly do).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8')

/** Ty le tuong phan WCAG 2.1. */
function ratio(fg: string, bg: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const lum = (hex: string) => {
    const [r, g, b] = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

/** Lay gia tri token trong khoi dark (khoi thu hai dinh nghia no). */
function darkToken(name: string): string {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))]
  return all[all.length - 1][1]
}

describe('nut Luu luc chua du dieu kien phai doc duoc', () => {
  it('chu tren nen muted dat AA 4,5:1 — chu nut la 16px semibold, khong phai chu lon', () => {
    const r = ratio(darkToken('accent-muted-fg'), darkToken('accent-muted-bg'))
    expect(r).toBeGreaterThanOrEqual(4.5)
  })

  it('khong con #6b8f78 — no chi 3,55:1', () => {
    // Khong co ngoai le contrast cho control vo hieu.
    expect(css).not.toMatch(/--accent-muted-fg:\s*#6b8f78/)
  })

  it('ham ratio dung — kiem bang hai cap da tinh tay', () => {
    expect(ratio('#6b8f78', '#0d3a1d')).toBeCloseTo(3.55, 1)
    expect(ratio('#7fae8e', '#0d3a1d')).toBeCloseTo(5.09, 1)
  })
})
