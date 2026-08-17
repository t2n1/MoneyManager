import { describe, expect, it } from 'vitest'
import { dueSoonCount, SOON_DAYS, todoBadge, todoSource } from './todoView'
import { NOTIFICATION_META, NOTIFICATION_TYPES, type AppNotification } from '../notifications/types'

const n = (p: Partial<AppNotification> = {}): AppNotification => ({
  key: 'k',
  kind: 'action',
  type: 'budget-over',
  severity: 'medium',
  title: 'Vượt trần',
  to: '/budget',
  ...p,
})

const TODAY = '2026-08-17'

describe('todoBadge — có ngày', () => {
  it('đếm ngày còn lại', () => {
    expect(todoBadge(n({ onISO: '2026-08-21' }), TODAY)).toEqual({ text: '4 NGÀY', urgent: true })
  })

  it('hôm nay và quá hạn nói bằng CHỮ, không phải số 0 hay số âm', () => {
    expect(todoBadge(n({ onISO: TODAY }), TODAY)).toEqual({ text: 'HÔM NAY', urgent: true })
    expect(todoBadge(n({ onISO: '2026-08-10' }), TODAY)).toEqual({ text: 'QUÁ HẠN', urgent: true })
  })

  it('gấp đúng bằng ngưỡng một tuần', () => {
    expect(todoBadge(n({ onISO: '2026-08-24' }), TODAY).urgent).toBe(true) // +7
    expect(todoBadge(n({ onISO: '2026-08-25' }), TODAY).urgent).toBe(false) // +8
  })
})

describe('todoBadge — không có ngày', () => {
  it('rơi về nhãn loại', () => {
    expect(todoBadge(n({ type: 'budget-over' }), TODAY)).toEqual({
      text: 'HẠN MỨC',
      urgent: false,
    })
    expect(todoBadge(n({ type: 'data-uncategorized' }), TODAY).text).toBe('PHÂN LOẠI')
  })

  // Thiếu một nhãn thì ô đó rỗng trên màn — bắt ở test, không để người dùng thấy.
  it('MỌI loại đều có nhãn, và nhãn là chữ in hoa ngắn', () => {
    for (const t of NOTIFICATION_TYPES) {
      const b = NOTIFICATION_META[t].badge
      expect(b, t).toBeTruthy()
      expect(b, `${t}: nhãn phải in hoa`).toBe(b.toUpperCase())
      expect(b.length, `${t}: nhãn dài quá, nó là nhãn không phải câu`).toBeLessThanOrEqual(12)
    }
  })
})

// Nút ngữ cảnh của 22a. Ở cùng file với `source`/`badge` vì cả ba là cùng một bảng
// NOTIFICATION_META, và cùng một loại lỗi: thiếu một dòng thì màn hình có một ô rỗng.
describe('NOTIFICATION_META.cta', () => {
  it('MỌI việc-cần-làm đều nói được bước kế tiếp', () => {
    for (const t of NOTIFICATION_TYPES) {
      const m = NOTIFICATION_META[t]
      if (m.kind !== 'action') continue
      expect(m.cta, `${t}: việc cần làm mà không có nút thì nó là tin để biết`).toBeTruthy()
    }
  })

  it('là chữ trên NÚT nên phải ngắn, và không phải câu', () => {
    for (const t of NOTIFICATION_TYPES) {
      const cta = NOTIFICATION_META[t].cta
      if (!cta) continue
      expect(cta.length, `${t}: nút dài quá`).toBeLessThanOrEqual(20)
      expect(cta, `${t}: nút không kết thúc bằng dấu chấm`).not.toMatch(/\.$/)
    }
  })

  // Tin thuần-để-biết KHÔNG được có nút chỉ vì "cho đủ": 22a cố ý bỏ trắng ở hai tin
  // không có việc gì làm. Ràng buộc này ngăn lần sửa sau lấp hết ô trống cho đều mắt.
  it('tin chốt sao kê và tin chạm mốc không có nút', () => {
    expect(NOTIFICATION_META['card-statement-day'].cta).toBeUndefined()
    expect(NOTIFICATION_META['savings-milestone'].cta).toBeUndefined()
  })
})

describe('todoSource', () => {
  it('trả về màn đã sinh ra việc', () => {
    expect(todoSource(n({ type: 'account-shortfall' }))).toBe('Tài sản · thẻ tín dụng')
    expect(todoSource(n({ type: 'trend-level-shift' }))).toBe('Báo cáo · Dài hạn')
  })

  it('MỌI loại đều có nguồn', () => {
    for (const t of NOTIFICATION_TYPES) expect(NOTIFICATION_META[t].source, t).toBeTruthy()
  })
})

describe('dueSoonCount', () => {
  it('chỉ đếm việc CÓ ngày và trong vòng một tuần', () => {
    const items = [
      n({ onISO: '2026-08-18' }), // +1
      n({ onISO: '2026-08-24' }), // +7
      n({ onISO: '2026-08-30' }), // +13
      n({}), // không ngày
    ]
    expect(dueSoonCount(items, TODAY)).toBe(2)
  })

  it('việc quá hạn vẫn tính là có hạn', () => {
    expect(dueSoonCount([n({ onISO: '2026-08-01' })], TODAY)).toBe(1)
  })

  it('danh sách rỗng → 0', () => {
    expect(dueSoonCount([], TODAY)).toBe(0)
  })

  it('ngưỡng dùng CHUNG với todoBadge', () => {
    expect(SOON_DAYS).toBe(7)
  })
})
