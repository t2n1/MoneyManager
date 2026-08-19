// Task 14: nut Luu luc chua du dieu kien phai doc duoc.
//
// Test nay TU TINH ty le tuong phan WCAG tu token trong index.css, khong tin so
// ghi trong chu thich cua goi. Vi sao: ai sau nay doi bang mau xanh thi test se
// keu ngay thay vi im lang troi theo.
//
// File nam o tests/ chu KHONG o src/ vi doc file bang node:fs — tsconfig cua
// src/ cam API Node (xem tests/contrast.test.ts, cung ly do).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath + duong dan tuyet doi, khong phai duong dan theo cwd: hai file test
// ben canh (entryStructure, designSystem) da lam vay vi test co the duoc chay tu mot
// cwd khac, va duong dan du an co dau cach ("Money Manager") nen `.pathname` tra ve
// da percent-encode -> ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')

/**
 * Chi phan ben trong khoi `.dark { … }`.
 *
 * Ban dau `darkToken` lay hex CUOI CUNG trong ca file va goi do la "gia tri dark".
 * No dung, nhung dung NHO MAY: cap token nay o light duoc khai bang `var(--color-…)`
 * chu khong phai hex, nen khong co hex nao cua khoi light lot vao danh sach. Doi
 * light sang hex mot ngay nao do la test lang le do CAP SAI ma van xanh. Cat dung
 * khoi dark thi khong con cho cho chuyen do.
 */
const darkBlock = (() => {
  const start = css.indexOf('.dark {')
  if (start < 0) throw new Error('index.css khong con khoi `.dark {` — sua test truoc')
  const end = css.indexOf('\n}', start)
  if (end < 0) throw new Error('khoi `.dark {` khong dong bang `}` dau dong')
  return css.slice(start, end)
})()

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

/** Gia tri hex cua token trong khoi dark. Nem neu token do khong khai bang hex o day. */
function darkToken(name: string): string {
  const m = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`--${name} khong khai bang hex trong khoi .dark`)
  return m[1]
}

describe('nut Luu luc chua du dieu kien phai doc duoc', () => {
  it('chu tren nen muted dat AA 4,5:1 — chu nut la 16px semibold, khong phai chu lon', () => {
    const r = ratio(darkToken('accent-muted-fg'), darkToken('accent-muted-bg'))
    expect(r).toBeGreaterThanOrEqual(4.5)
  })

  it('khong con #6b8f78 — no chi 3,55:1', () => {
    // Soat ca file, khong chi khoi dark: gia tri nay khong duoc quay lai o bat ky che do
    // nao. (Ngoai le contrast con lai cua app — phim phep tinh bi khoa 2,32:1 — da ghi
    // ra trong chu thich cua chinh khoi dark; "duoc mien 1.4.3" khac "dat".)
    expect(css).not.toMatch(/--accent-muted-fg:\s*#6b8f78/)
  })

  it('ham ratio dung — kiem bang hai cap da tinh tay', () => {
    expect(ratio('#6b8f78', '#0d3a1d')).toBeCloseTo(3.55, 1)
    expect(ratio('#7fae8e', '#0d3a1d')).toBeCloseTo(5.09, 1)
  })
})
