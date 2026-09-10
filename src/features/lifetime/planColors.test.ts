// Phát hiện review cuối nhánh 2026-09-09, Finding 6 (ba bản chép đã lệch độ mờ) và
// Finding 7 (bảng chọn màu và dải chặng nói hai điều về cùng một chặng chưa chọn màu).
import { describe, expect, it } from 'vitest'
import {
  EVENT_ANCHOR_OPACITY,
  EVENT_SPAN_OPACITY,
  EVENT_TINT_OPACITY,
  PHASE_FALLBACK_KEYS,
  eventTint,
  phaseColorKey,
} from './planColors'
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

  // Ba loại dấu, ba độ dày, nên ba độ mờ — và cả ba phải LẬT CÙNG LÚC theo `enabled`. Bản
  // 2026-09-10 thêm hai cặp sau; chúng nằm trong CÙNG một hàm đúng để không chỗ vẽ nào tự
  // đoán lấy một con số thứ tư — đó là cách ba bản chép cũ đã lệch nhau (Finding 6).
  it('ba cặp độ mờ — nét mảnh · khối · neo — cùng lật theo một trạng thái bật/tắt', () => {
    const on = eventTint('indigo', 'expense', true)
    const off = eventTint('indigo', 'expense', false)
    expect([on.opacity, on.spanOpacity, on.anchorOpacity]).toEqual([0.45, 0.22, 1])
    expect([off.opacity, off.spanOpacity, off.anchorOpacity]).toEqual([0.2, 0.1, 0.35])
    expect(EVENT_SPAN_OPACITY).toEqual({ on: 0.22, off: 0.1 })
    expect(EVENT_ANCHOR_OPACITY).toEqual({ on: 1, off: 0.35 })
  })

  // Từ 2026-09-10 cái ghim TÔ ĐẶC màu của mốc, nên icon bên trong là mực ĐỤC NGƯỢC ra và
  // phải đọc được trên CẢ hai loại nền. Nền `TAG_HEX` là hex cố định (không lật theo
  // Sáng/Tối) → một mực gần-đen đúng cho cả bảy màu. Nền `--money-in`/`--money-out` thì
  // LẬT (Sáng: green-800/red-700, nền TỐI; Tối: #5ce08a/#ff7a76, nền SÁNG) → mực phải lật
  // theo, và `--surface-chrome` là token duy nhất lật đúng chiều. Số đo tương phản của cả
  // bảy màu ghi ở `planColors.ts`. Đây là chỗ dễ bị "sửa cho gọn" thành một mực duy nhất,
  // nên khoá lại bằng phép thử.
  it('mực của icon: gần-đen khi mốc có màu riêng, token LẬT theo chế độ khi tô theo Thu/Chi', () => {
    for (const k of TAG_COLOR_KEYS) {
      expect(eventTint(k, 'expense').ink).toBe('var(--color-gray-950)')
    }
    expect(eventTint('mau-khong-co-that', 'expense').ink).toBe('var(--color-gray-950)')
    expect(eventTint('', 'income').ink).toBe('var(--surface-chrome)')
    expect(eventTint('', 'expense').ink).toBe('var(--surface-chrome)')
    expect(eventTint(undefined, 'expense').ink).toBe('var(--surface-chrome)')
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
