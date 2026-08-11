import { describe, expect, it } from 'vitest'
import { describeError } from './errorToast'

// Lưới an toàn lỗi chỉ đáng tồn tại nếu câu nó hiện ra NÓI ĐƯỢC điều gì. Ca quan trọng
// nhất không phải `new Error(...)` — mà là lỗi của Supabase: object thường, không phải
// instance của Error. Bản đầu dùng `error instanceof Error ? … : String(error)` nên hiện
// đúng chữ "Lưu không được: [object Object]" trên app đang chạy.
describe('describeError', () => {
  it('lấy message của Error', () => {
    expect(describeError(new Error('mất mạng'))).toBe('mất mạng')
  })

  it('lỗi Supabase (PostgrestError) — object thường, KHÔNG phải Error', () => {
    // Đây là hình dạng thật supabase-js ném ra qua `if (error) throw error`.
    const loi = {
      message: 'duplicate key value violates unique constraint',
      details: null,
      hint: null,
      code: '23505',
    }
    expect(describeError(loi)).toBe('duplicate key value violates unique constraint')
  })

  it('không message thì lùi về details, rồi tới mã lỗi', () => {
    expect(describeError({ details: 'Key (user_id)=(…) already exists.' })).toBe(
      'Key (user_id)=(…) already exists.',
    )
    expect(describeError({ code: '23503' })).toBe('mã lỗi 23503')
  })

  it('message rỗng/trắng không được coi là có', () => {
    expect(describeError({ message: '   ', code: '42501' })).toBe('mã lỗi 42501')
    expect(describeError(Object.assign(new Error(''), { code: 'PGRST301' }))).toBe(
      'mã lỗi PGRST301',
    )
  })

  it('chuỗi thì dùng luôn', () => {
    expect(describeError('offline')).toBe('offline')
  })

  it('TUYỆT ĐỐI không để [object Object] lên màn hình', () => {
    // Đổi describeError về `error instanceof Error ? error.message : String(error)` là
    // ba dòng dưới đây đỏ.
    for (const x of [{}, { hint: 'chỉ có hint' }, Object.create(null), { code: 123 }]) {
      const s = describeError(x)
      expect(s).not.toContain('[object Object]')
      expect(s).toBe('lỗi không rõ')
    }
  })

  it('null/undefined cũng ra câu đọc được', () => {
    expect(describeError(null)).toBe('null')
    expect(describeError(undefined)).toBe('undefined')
  })
})
