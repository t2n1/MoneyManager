import { describe, expect, it } from 'vitest'
import { addSaved, countLabel, removeSaved, type SavedEntry } from './savedRound'

const e = (id: string, amount = 3_480): SavedEntry =>
  ({ id, label: 'Cơm ngoài', icon: '🍜', amount, currency: 'JPY' })

describe('savedRound', () => {
  it('moi nhat len DAU — nguoi dung nhin thay khoan vua ghi truoc', () => {
    const r = addSaved(addSaved([], e('a')), e('b'))
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('hoan tac rut dung khoan do ra', () => {
    const r = removeSaved(addSaved(addSaved([], e('a')), e('b')), 'a')
    expect(r.map((x) => x.id)).toEqual(['b'])
  })

  it('hoan tac mot id khong co thi khong doi gi, khong nem', () => {
    const r = addSaved([], e('a'))
    expect(removeSaved(r, 'mat-tieu')).toHaveLength(1)
  })

  it('dem: chua ghi gi thi null — khong bay "0 khoan luot nay"', () => {
    expect(countLabel([])).toBeNull()
  })

  it('dem dung so, tieng Viet khong chia so nhieu', () => {
    expect(countLabel(addSaved([], e('a')))).toBe('1 khoản lượt này')
    expect(countLabel(addSaved(addSaved([], e('a')), e('b')))).toBe('2 khoản lượt này')
  })

  it('cat danh sach o 5 khoan — bay het mot ngay ghi thi day man', () => {
    let r: SavedEntry[] = []
    for (let i = 0; i < 8; i++) r = addSaved(r, e(`x${i}`))
    expect(r).toHaveLength(5)
    expect(r[0].id).toBe('x7')
  })

  it('nhung so DEM thi khong bi cat — da ghi 8 thi noi 8', () => {
    let r: SavedEntry[] = []
    let n = 0
    for (let i = 0; i < 8; i++) { r = addSaved(r, e(`x${i}`)); n++ }
    // Danh sach cat con 5 nhung so dem phai la 8 → dem KHONG duoc lay r.length.
    expect(countLabel(r, n)).toBe('8 khoản lượt này')
  })
})
