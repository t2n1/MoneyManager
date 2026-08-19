import { describe, expect, it } from 'vitest'
import { categoryAlert } from './categoryAlert'

const base = {
  categoryName: 'Ăn uống', currency: 'JPY' as const,
  cap: 100_000, spent: 107_327, amount: 4_200, myShare: 4_200,
  capBase: 'full' as const,
}

describe('canh bao ve DUNG danh muc vua chon', () => {
  it('chua chon danh muc thi khong canh bao gi', () => {
    expect(categoryAlert({ ...base, categoryName: null })).toBeNull()
  })

  it('dang khong vao tran thi khong canh bao', () => {
    expect(categoryAlert({ ...base, capBase: 'none' })).toBeNull()
  })

  it('chua dat han muc thi khong canh bao', () => {
    expect(categoryAlert({ ...base, cap: null })).toBeNull()
  })

  it('chua vuot thi khong canh bao', () => {
    expect(categoryAlert({ ...base, spent: 50_000, amount: 1_000 })).toBeNull()
  })

  it('da vuot thi noi vuot bao nhieu va cong vao thanh bao nhieu', () => {
    expect(categoryAlert(base))
      .toBe('Ăn uống đã vượt trần ¥7,327. Cộng ¥4,200 thì thành ¥11,527.')
  })

  it('TRA HO cong PHAN MINH CHIU, khong phai tong da tra', () => {
    // Ban dang chay se tinh ca ¥12,400 — sai dung ¥8,200.
    const out = categoryAlert({
      ...base, capBase: 'myShare', amount: 12_400, myShare: 4_200,
    })
    expect(out).toBe('Ăn uống đã vượt trần ¥7,327. Cộng ¥4,200 phần mình chịu thì thành ¥11,527.')
    expect(out).not.toMatch(/12,400/)
  })

  it('chua vuot nhung khoan nay lam vuot thi canh bao truoc', () => {
    expect(categoryAlert({ ...base, spent: 98_000, amount: 4_200, myShare: 4_200 }))
      .toBe('Ăn uống còn ¥2,000 trong trần. Khoản ¥4,200 này làm vượt ¥2,200.')
  })
})
