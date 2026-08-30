import { describe, expect, it } from 'vitest'
import { impliedRate, nextCounterAmount } from './crossPayment'

/**
 * Trả nợ xuyên tệ: khoản nợ ghi bằng ¥, tiền về lại là ₫ vào ví Việt Nam.
 * Một lần trả khi đó mang HAI số — số xoá nợ (tệ nợ) và số thật vào ví (tệ ví) —
 * và tỷ giá giữa chúng là tỷ giá HAI BÊN THOẢ THUẬN, không phải tỷ giá thị trường.
 * Hai hàm dưới đây chỉ phục vụ việc GỢI Ý và HIỂN THỊ; số người dùng gõ là sự thật.
 */

describe('nextCounterAmount — goi y so doi ung, KHONG dap len so da go tay', () => {
  // base JPY, rates.VND = 166 → 1 ¥ = 166 ₫
  const RATES = { VND: 166 }

  it('chua go tay thi suy tu ty gia thi truong', () => {
    expect(
      nextCounterAmount({
        current: 0,
        touched: false,
        source: 100_000,
        from: 'JPY',
        to: 'VND',
        base: 'JPY',
        rates: RATES,
      }),
    ).toBe(16_600_000)
  })

  it('da go tay roi thi GIU NGUYEN — hai ben thoa thuan ty gia khac thi truong', () => {
    // Ca that: no 100.000 ¥, hai ben chot tra 15 trieu ₫ (≈150 ₫/¥, khong phai 166).
    // Doi so tien no mot nhip khong duoc phep xoa mat con so da chot.
    expect(
      nextCounterAmount({
        current: 15_000_000,
        touched: true,
        source: 100_000,
        from: 'JPY',
        to: 'VND',
        base: 'JPY',
        rates: RATES,
      }),
    ).toBe(15_000_000)
  })

  it('thieu ty gia thi GIU NGUYEN so hien tai, khong xoa ve 0', () => {
    // Quy uoc toan repo: thieu rate thi loai ra, khong bia — va o day "khong bia"
    // nghia la khong tu y dat lai o ve 0 giua luc nguoi dung dang nhap.
    expect(
      nextCounterAmount({
        current: 15_000_000,
        touched: false,
        source: 100_000,
        from: 'JPY',
        to: 'VND',
        base: 'JPY',
        rates: {},
      }),
    ).toBe(15_000_000)
  })

  it('chua nhap so nguon thi giu nguyen', () => {
    expect(
      nextCounterAmount({
        current: 15_000_000,
        touched: false,
        source: 0,
        from: 'JPY',
        to: 'VND',
        base: 'JPY',
        rates: RATES,
      }),
    ).toBe(15_000_000)
  })

  it('cung loai tien thi so doi ung chinh la so nguon', () => {
    expect(
      nextCounterAmount({
        current: 0,
        touched: false,
        source: 30_000,
        from: 'JPY',
        to: 'JPY',
        base: 'JPY',
        rates: RATES,
      }),
    ).toBe(30_000)
  })

  it('suy duoc ca khi vi la base con no la te khac', () => {
    // Nguoc chieu: no ghi ₫, tra vao vi ¥.
    expect(
      nextCounterAmount({
        current: 0,
        touched: false,
        source: 16_600_000,
        from: 'VND',
        to: 'JPY',
        base: 'JPY',
        rates: RATES,
      }),
    ).toBe(100_000)
  })
})

describe('impliedRate — ty gia NGAM cua lan tra, de nguoi dung tu kiem', () => {
  it('doc ra ty gia tu chinh hai so nguoi dung go', () => {
    // 100.000 ¥ xoa bang 15.000.000 ₫ → 150 ₫ moi yen.
    expect(impliedRate(100_000, 'JPY', 15_000_000, 'VND')).toBe(150)
  })

  it('dung MAJOR units — te co so le khong lam lech ty gia', () => {
    // $100 (= 10.000 minor, decimals 2) doi 15.000 ₫ → 150 ₫/$, khong phai 1,5.
    expect(impliedRate(10_000, 'USD', 15_000, 'VND')).toBe(150)
  })

  it('chua du hai so thi khong co ty gia nao de noi', () => {
    expect(impliedRate(0, 'JPY', 15_000_000, 'VND')).toBeNull()
    expect(impliedRate(100_000, 'JPY', 0, 'VND')).toBeNull()
  })

  it('cung loai tien thi khong co ty gia ngam', () => {
    expect(impliedRate(30_000, 'JPY', 30_000, 'JPY')).toBeNull()
  })
})
