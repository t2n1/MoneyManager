import { describe, expect, it } from 'vitest'
import { rangeSpan, spanLabel } from './assetsRange'

const TODAY = '2026-08-24'

describe('rangeSpan', () => {
  it('cắt đúng số tháng đã bấm — bấm "3 th" thì đọc "3 tháng"', () => {
    const s = rangeSpan('3m', TODAY)
    expect(s.startISO).toBe('2026-05-24')
    expect(s.months).toBe(3)
    expect(spanLabel(s)).toBe('05-2026 → 08-2026 · 3 tháng')
  })

  it('"Từ đầu" là KHÔNG CÓ MỐC ĐẦU, không phải một ngày cụ thể', () => {
    // Đây là ca đã dựng ra được và làm bản đầu sai: sổ chưa có ảnh chụp ròng nào (chúng
    // chỉ ghi từ lần đầu mở chế độ này) trong khi sổ giao dịch đã dài hai năm. Kẹp mốc
    // đầu về "ảnh chụp sớm nhất" lúc đó cắt đúng MỘT ngày, và cột "Δ từ đầu" của cả năm
    // nhóm in ra "—" trong khi dữ liệu thì có sẵn.
    const s = rangeSpan('all', TODAY)
    expect(s.startISO).toBeNull()
    expect(s.months).toBeNull()
    expect(spanLabel(s)).toBe('toàn bộ lịch sử đang có')
  })

  it('cửa sổ 12 tháng lùi đúng 12 tháng, không đoán theo 30 ngày', () => {
    expect(rangeSpan('12m', TODAY).startISO).toBe('2025-08-24')
  })

  it('kẹp ngày cuối tháng: 31/3 lùi 1 tháng ra 28/2, không tràn sang 3/3', () => {
    expect(rangeSpan('1m', '2026-03-31').startISO).toBe('2026-02-28')
  })
})
