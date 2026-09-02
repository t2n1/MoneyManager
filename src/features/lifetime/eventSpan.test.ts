import { describe, expect, it } from 'vitest'
import { eventSpan } from './eventSpan'

describe('eventSpan', () => {
  // Lỗi thật trên app 2026-09-02: mốc "Chi phí cưới 2029 → 2030 · ¥3,000,000" tính ¥3M
  // cho MỖI năm, tức cưới tốn ¥6M, mà hàng mốc không có chữ nào nói ra điều đó.
  it('mốc kéo hai năm → số năm và tổng', () => {
    expect(eventSpan(2029, 2030, 3_000_000)).toEqual({ kind: 'multi', years: 2, totalMinor: 6_000_000 })
  })

  it('mốc một năm → null, không có gì để cộng', () => {
    expect(eventSpan(2029, 2029, 3_000_000)).toBeNull()
  })

  it('năm kết thúc trước năm bắt đầu (đang gõ dở) → null, không ra số năm âm', () => {
    expect(eventSpan(2029, 2027, 3_000_000)).toBeNull()
  })

  it('không có năm kết thúc → chạy hết đời, không có tổng hữu hạn', () => {
    expect(eventSpan(2029, null, 1_100_000)).toEqual({ kind: 'open' })
  })
})
