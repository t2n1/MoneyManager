import { describe, expect, it } from 'vitest'
import { fxAfterCurrencyChange, isFxValid } from './fxField'

describe('fxAfterCurrencyChange', () => {
  // Ca lỗi thật: hiển thị JPY, sự kiện "Hỗ trợ bố mẹ" đang là VND với fx 0,0057, người
  // dùng đổi ô chọn tiền sang USD. Trước khi có luật này ô fx giữ nguyên 0,0057 — giờ
  // nó có nghĩa "$1 = ¥0,0057" và ₫60.000.000 bị đọc thành $600.000,00. Đổi giữa HAI
  // TIỀN NGOẠI TỆ là đúng ca mà effect cũ (dep là boolean `showFx`) không hề chạy.
  it('đổi giữa hai tiền đều khác tiền hiển thị: XOÁ tỷ giá cũ', () => {
    expect(fxAfterCurrencyChange('USD', 'JPY')).toBe('')
  })

  it('đổi sang đúng tiền hiển thị: tỷ giá là 1 và đó là giá trị ĐÚNG', () => {
    expect(fxAfterCurrencyChange('JPY', 'JPY')).toBe('1')
  })

  it('đổi từ tiền hiển thị sang ngoại tệ: cũng xoá, không để lại số 1 hợp lệ mà sai', () => {
    // Đây là ca effect cũ làm ĐÚNG một nửa: nó đặt '1' khi vào "cùng tiền", nhưng khi
    // RA khỏi "cùng tiền" thì để nguyên 1 — một tỷ giá 1:1 giữa hai tiền khác nhau,
    // tức đúng con số mà banner phải đi bắt.
    expect(fxAfterCurrencyChange('VND', 'JPY')).toBe('')
  })

  // Cặp hai phép thử dưới đây là điểm nối: giá trị trả về ở trên phải CHẶN được nút Lưu,
  // không chỉ trông rỗng trên màn hình.
  it('giá trị trả về khi lệch tiền làm ô tỷ giá KHÔNG hợp lệ (chặn Lưu)', () => {
    expect(isFxValid(fxAfterCurrencyChange('USD', 'JPY'))).toBe(false)
  })

  it('giá trị trả về khi trùng tiền vẫn hợp lệ (không chặn Lưu oan)', () => {
    expect(isFxValid(fxAfterCurrencyChange('JPY', 'JPY'))).toBe(true)
  })
})

describe('isFxValid', () => {
  it('ô rỗng không hợp lệ', () => {
    expect(isFxValid('')).toBe(false)
    expect(isFxValid('   ')).toBe(false)
  })

  it('0 và số âm không hợp lệ (khớp check fx_to_display > 0 của DB)', () => {
    expect(isFxValid('0')).toBe(false)
    expect(isFxValid('-1')).toBe(false)
  })

  it('không phải số thì không hợp lệ', () => {
    expect(isFxValid('abc')).toBe(false)
    expect(isFxValid('Infinity')).toBe(false)
  })

  it('tỷ giá rất nhỏ vẫn hợp lệ — ₫1 ≈ ¥0,0057 là ca thường gặp nhất của user này', () => {
    expect(isFxValid('0.0057')).toBe(true)
    expect(isFxValid('172')).toBe(true)
  })
})
