// Phát hiện review cuối nhánh 2026-09-09, Finding 6 (ba bản chép đã lệch độ mờ) và
// Finding 7 (bảng chọn màu và dải chặng nói hai điều về cùng một chặng chưa chọn màu).
import { describe, expect, it } from 'vitest'
import { EVENT_TINT_OPACITY, PHASE_FALLBACK_KEYS, eventTint, phaseColorKey } from './planColors'
import { TAG_COLOR_KEYS, TAG_HEX } from '../tags/colors'

describe('eventTint', () => {
  it('khoá màu riêng của mốc THẮNG màu theo Thu/Chi (migration 0067)', () => {
    expect(eventTint('indigo', 'expense').color).toBe(TAG_HEX.indigo)
    expect(eventTint('indigo', 'income').color).toBe(TAG_HEX.indigo)
  })

  it('chưa chọn màu thì tô theo Thu/Chi bằng TOKEN của app, không phải một sắc mới', () => {
    expect(eventTint('', 'income').color).toBe('var(--money-in)')
    expect(eventTint('', 'expense').color).toBe('var(--money-out)')
    expect(eventTint(undefined, 'expense').color).toBe('var(--money-out)')
  })

  it('khoá lạ rơi về `gray` (qua `tagColor`), không ném lỗi và không trả chuỗi rỗng', () => {
    expect(eventTint('mau-khong-co-that', 'expense').color).toBe(TAG_HEX.gray)
  })

  it('trả về HEX từ bảng màu, không bao giờ trả về chính khoá — chỗ vẽ bơm thẳng vào stroke', () => {
    for (const k of TAG_COLOR_KEYS) {
      expect(eventTint(k, 'expense').color).toBe(TAG_HEX[k])
      expect(eventTint(k, 'expense').color).not.toBe(k)
    }
  })

  it('đúng MỘT cặp độ mờ cho cả ba chỗ vẽ — bật 0,45 · tắt 0,2 (migration 0063)', () => {
    expect(eventTint('indigo', 'expense', true).opacity).toBe(0.45)
    expect(eventTint('indigo', 'expense', undefined).opacity).toBe(0.45)
    expect(eventTint('indigo', 'expense', false).opacity).toBe(0.2)
    expect(EVENT_TINT_OPACITY).toEqual({ on: 0.45, off: 0.2 })
  })

  it('chỉ `enabled === false` là TẮT — mốc thiếu trường đó (bản đã lưu trước 0063) vẫn là bật', () => {
    expect(eventTint('', 'expense').opacity).toBe(EVENT_TINT_OPACITY.on)
  })
})

describe('phaseColorKey', () => {
  it('khoá màu riêng của chặng thắng, bất kể thứ hạng', () => {
    expect(phaseColorKey('indigo', 0)).toBe('indigo')
    expect(phaseColorKey('indigo', 5)).toBe('indigo')
  })

  it('chưa chọn màu thì xoay theo THỨ TỰ chặng, không phải xám đều', () => {
    const n = PHASE_FALLBACK_KEYS.length
    expect(phaseColorKey('', 0)).toBe(PHASE_FALLBACK_KEYS[0])
    expect(phaseColorKey('', 1)).toBe(PHASE_FALLBACK_KEYS[1])
    // Vòng lại đúng chu kỳ — chặng thứ n cùng màu chặng đầu.
    expect(phaseColorKey('', n)).toBe(PHASE_FALLBACK_KEYS[0])
    expect(phaseColorKey('', n + 2)).toBe(PHASE_FALLBACK_KEYS[2])
  })

  it('`gray` KHÔNG nằm trong dải rơi về — nó là màu của "không màu"', () => {
    expect(PHASE_FALLBACK_KEYS).not.toContain('gray')
    expect(PHASE_FALLBACK_KEYS).toHaveLength(TAG_COLOR_KEYS.length - 1)
  })

  it('thứ hạng ÂM (chặng không có trong bảng thứ hạng) vẫn trả một khoá thật', () => {
    expect(PHASE_FALLBACK_KEYS).toContain(phaseColorKey('', -1))
    expect(PHASE_FALLBACK_KEYS).toContain(phaseColorKey('', -7))
  })

  it('khoá lạ rơi về `gray`, cùng luật với eventTint', () => {
    expect(phaseColorKey('mau-khong-co-that', 3)).toBe('gray')
  })
})
