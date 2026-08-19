import { describe, expect, it } from 'vitest'
import { panelBox, ROW_H } from './accountPickerBox'

const PHONE = { width: 375, height: 812 }
const rect = (top: number, height = 44, left = 12, width = 351) => ({
  top, bottom: top + height, left, width,
})

describe('panelBox: panel luon nam trong man', () => {
  // Day la bat bien duy nhat quan trong. Truoc khi sua, panel dat maxHeight 70vh cung
  // (568px o man 812px) nen no tran xuong duoi mep man va may tai khoan cuoi khong bam
  // duoc — panel la `position: fixed`, trang Nhap khong cuon, khong co cach nao toi.
  it.each([1, 3, 7, 12, 30])('%i tai khoan, nut o giua man -> khong tran day', (n) => {
    const r = rect(348)
    const p = panelBox(r, PHONE, n)
    expect(p.drop).toBe('down')
    expect(r.bottom + 4 + p.maxH).toBeLessThanOrEqual(PHONE.height)
  })

  it('nut o giua, danh sach dai -> bung xuong, cao dung bang cho con lai', () => {
    const r = rect(348)
    const p = panelBox(r, PHONE, 7)
    // cho duoi = 812 - 392 = 420, tru le 12 -> 408
    expect(p.maxH).toBe(408)
    // noi dung 7 dong + 96 = 432 > 408, tuc listbox PHAI cuon — dung y do.
    expect(7 * ROW_H + 96).toBeGreaterThan(p.maxH)
  })

  it('nut sat day -> bung LEN, va cung khong tran dinh', () => {
    const r = rect(700)
    const p = panelBox(r, PHONE, 12)
    expect(p.drop).toBe('up')
    expect(p.maxH).toBeLessThanOrEqual(r.top - 12)
  })

  it('it tai khoan -> cao theo noi dung, khong an het man', () => {
    const p = panelBox(rect(100), PHONE, 2)
    expect(p.maxH).toBe(2 * ROW_H + 96)
  })

  it('cho ngat qua -> ve san 160 va chiu cuon, khong ve 0', () => {
    // Nut cao sat day den muc duoi chi con ~30px, ma tren cung it hon.
    const p = panelBox({ top: 8, bottom: 782, left: 12, width: 351 }, PHONE, 12)
    expect(p.maxH).toBe(160)
  })

  it('khong bao gio cao hon 70vh', () => {
    const p = panelBox(rect(4, 10), { width: 375, height: 1200 }, 99)
    expect(p.maxH).toBeLessThanOrEqual(1200 * 0.7)
  })
})

describe('panelBox: be ngang va vi tri ngang', () => {
  it('man hep (<480) -> dung gan het be ngang, le 12 moi ben', () => {
    const p = panelBox(rect(300), PHONE, 5)
    expect(p.width).toBe(375 - 24)
    expect(p.left).toBe(12)
  })

  it('man rong -> it nhat 320, khong hep hon nut', () => {
    const wide = { width: 1280, height: 900 }
    expect(panelBox(rect(300, 44, 40, 180), wide, 5).width).toBe(320)
    expect(panelBox(rect(300, 44, 40, 500), wide, 5).width).toBe(500)
  })

  it('nut sat mep phai -> keo left vao cho khoi tran phai', () => {
    const wide = { width: 1280, height: 900 }
    const p = panelBox(rect(300, 44, 1100, 150), wide, 5)
    expect(p.left + p.width).toBeLessThanOrEqual(1280 - 12)
  })
})
