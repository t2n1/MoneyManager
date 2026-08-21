import { describe, expect, it } from 'vitest'
import { lichSuTyGia } from './lichSuTyGia'
import type { DuLieu } from '../basket'
import type { FxHistoryRow } from '../../types/database.types'

const fx = (
  on_date: string,
  rates: Record<string, number>,
  base: 'JPY' | 'USD' = 'JPY',
): FxHistoryRow => ({ user_id: 'u1', on_date, base, rates })

const du = (p: Partial<DuLieu> = {}): DuLieu => ({
  txs: [], accounts: [], categories: [], tags: [], txTags: [], budgets: [], fx: [],
  base: 'JPY', monthStartDay: 1, tz: 'Asia/Tokyo', ...p,
})

describe('lichSuTyGia', () => {
  it('trả các dòng trong khoảng, sắp theo ngày tăng dần', () => {
    const r = lichSuTyGia(
      { tu_ngay: '2026-08-01', den_ngay: '2026-08-03' },
      du({ fx: [fx('2026-08-03', { VND: 176 }), fx('2026-08-01', { VND: 175 })] }),
    )
    expect(r.dong).toEqual([
      { ngay: '2026-08-01', ty_gia: { VND: 175 } },
      { ngay: '2026-08-03', ty_gia: { VND: 176 } },
    ])
  })

  it('den_ngay là mốc ĐÓNG — dòng đúng ngày đó vẫn được lấy', () => {
    const r = lichSuTyGia(
      { tu_ngay: '2026-08-01', den_ngay: '2026-08-01' },
      du({ fx: [fx('2026-08-01', { VND: 175 })] }),
    )
    expect(r.dong).toHaveLength(1)
  })

  it('bỏ dòng khác base của user', () => {
    const r = lichSuTyGia(
      { tu_ngay: '2026-08-01', den_ngay: '2026-08-02' },
      du({ fx: [fx('2026-08-01', { VND: 175 }), fx('2026-08-02', { VND: 26_000 }, 'USD')] }),
    )
    expect(r.dong).toEqual([{ ngay: '2026-08-01', ty_gia: { VND: 175 } }])
  })

  it('nói rõ CHIỀU của tỷ giá — đây là chỗ dễ đọc ngược nhất', () => {
    const r = lichSuTyGia(
      { tu_ngay: '2026-08-01', den_ngay: '2026-08-01' },
      du({ fx: [fx('2026-08-01', { VND: 175 })] }),
    )
    expect(r.chieu).toBe('1 JPY đổi được bao nhiêu đơn vị đồng tiền kia')
  })

  it('nhắc lại phạm vi đã áp (spec mục C.3) — kể cả khi rỗng', () => {
    const r = lichSuTyGia(
      { tu_ngay: '2026-08-01', den_ngay: '2026-08-05' },
      du({ fx: [fx('2026-08-01', { VND: 175 })] }),
    )
    expect(r.pham_vi).toEqual({ tu_ngay: '2026-08-01', den_ngay: '2026-08-05', so_dong: 1 })
  })

  it('rỗng thì nói rõ bảng chỉ tích từ cuối tháng 7/2026', () => {
    const r = lichSuTyGia({ tu_ngay: '2026-01-01', den_ngay: '2026-01-31' }, du())
    expect(r.dong).toEqual([])
    expect(r.ghi_chu.join(' ')).toMatch(/tháng 7\/2026/)
  })
})
