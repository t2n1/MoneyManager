// Giao diện Nicole: chữ trên nền hồng phải đọc được. Tự tính tỷ lệ tương phản WCAG từ
// khối `.nicole { … }` trong index.css — cùng cách tokenContrast.test.ts làm với `.dark`,
// để ai đổi một sắc hồng sau này thì test kêu thay vì im lặng trượt AA.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')

const block = (() => {
  const start = css.indexOf('.nicole {')
  if (start < 0) throw new Error('index.css khong con khoi `.nicole {` — sua test truoc')
  return css.slice(start, css.indexOf('\n}', start))
})()

function token(name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`--${name} khong khai bang hex trong khoi .nicole`)
  return m[1]
}

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

const SURFACES = ['surface', 'surface-page', 'surface-chrome', 'surface-sunken']
const TEXT = ['fg-primary', 'fg-secondary', 'fg-muted', 'fg-accent', 'money-in', 'money-out', 'fg-warn']

describe('giao dien Nicole — tuong phan', () => {
  for (const fg of TEXT) {
    it(`--${fg} dat 4,5:1 tren ca bon nac nen`, () => {
      for (const bg of SURFACES) expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('chu tren nut hong va chu tren nen trang thai dat 4,5:1', () => {
    expect(ratio(token('fg-on-accent'), token('accent'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('fg-accent-on-track'), token('surface-sunken'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('fg-on-track'), token('surface-sunken'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('accent-muted-fg'), token('accent-muted-bg'))).toBeGreaterThanOrEqual(4.5)
    for (const k of ['good', 'warn', 'bad'])
      expect(ratio(token(`state-${k}-fg`), token(`state-${k}-bg`))).toBeGreaterThanOrEqual(4.5)
  })

  it('moi lat donut dat 3:1 tren the (WCAG 1.4.11)', () => {
    for (let i = 1; i <= 5; i++) expect(ratio(token(`chart-slice-${i}`), token('surface'))).toBeGreaterThanOrEqual(3)
  })
})
