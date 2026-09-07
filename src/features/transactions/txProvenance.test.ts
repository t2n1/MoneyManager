import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import {
  EDIT_TOLERANCE_MS,
  formatStamp,
  provenanceLine,
  txProvenance,
} from './txProvenance'

/** Mốc giờ MÁY (không phải UTC) — để test không đổi kết quả theo múi giờ máy chạy. */
const luc = (y: number, m: number, d: number, h = 12, min = 0, s = 0) =>
  new Date(y, m - 1, d, h, min, s).toISOString()

const tx = (over: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id: 't1',
    user_id: 'u1',
    type: 'expense',
    amount: 1_200,
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-09-07',
    note: 'Cơm trưa',
    created_at: luc(2026, 9, 7, 14, 32),
    updated_at: luc(2026, 9, 7, 14, 32),
    ...over,
  }) as TransactionRow

describe('formatStamp — giờ máy, không phải UTC', () => {
  it('dựng từ giờ máy thì đọc ra đúng giờ đó', () => {
    expect(formatStamp(new Date(2026, 8, 7, 14, 32))).toBe('2026/09/07 14:32')
  })

  it('đệm số 0 cho tháng, ngày, giờ, phút một chữ số', () => {
    expect(formatStamp(new Date(2026, 0, 5, 9, 7))).toBe('2026/01/05 09:07')
  })

  it('ngày hỏng trả chuỗi rỗng, không trả "Invalid Date"', () => {
    expect(formatStamp(new Date('méo'))).toBe('')
  })
})

describe('txProvenance — đã sửa hay chưa', () => {
  it('hai mốc bằng nhau = chưa sửa', () => {
    expect(txProvenance(tx()).editedStamp).toBeNull()
  })

  it('lệch dưới ngưỡng vẫn là CHƯA sửa — đó là lượt ghi tự động ngay sau khi tạo', () => {
    const t = tx({ updated_at: luc(2026, 9, 7, 14, 32, 1) })
    expect(EDIT_TOLERANCE_MS).toBe(2_000)
    expect(txProvenance(t).editedStamp).toBeNull()
  })

  it('lệch trên ngưỡng thì báo mốc sửa', () => {
    const t = tx({ updated_at: luc(2026, 9, 7, 15, 10) })
    expect(txProvenance(t).editedStamp).toBe('2026/09/07 15:10')
  })

  it('updated_at hỏng thì coi như chưa sửa, không nổ', () => {
    expect(txProvenance(tx({ updated_at: 'méo' })).editedStamp).toBeNull()
  })

  it('created_at hỏng thì mọi thứ rỗng và KHÔNG bịa ra số ngày muộn', () => {
    const p = txProvenance(tx({ created_at: 'méo', occurred_on: '2020-01-01' }))
    expect(p.createdStamp).toBe('')
    expect(p.lateDays).toBe(0)
  })
})

describe('txProvenance — từ đâu ra', () => {
  it('mặc định là nhập tay', () => {
    expect(txProvenance(tx()).origin).toBe('nhap-tay')
  })

  it('có rule định kỳ thì là định kỳ', () => {
    expect(txProvenance(tx({ recurring_rule_id: 'r1' })).origin).toBe('dinh-ky')
  })

  it('có lệnh cổ phiếu thì là cổ phiếu', () => {
    expect(txProvenance(tx({ stock_trade_id: 's1' })).origin).toBe('co-phieu')
  })

  it('định kỳ THẮNG cổ phiếu khi có cả hai — rule là thứ người dùng sửa được', () => {
    const t = tx({ recurring_rule_id: 'r1', stock_trade_id: 's1' })
    expect(txProvenance(t).origin).toBe('dinh-ky')
  })
})

describe('txProvenance — ghi muộn bao lâu', () => {
  it('ghi trong ngày = 0', () => {
    expect(txProvenance(tx()).lateDays).toBe(0)
  })

  it('đếm theo NGÀY MÁY, không theo UTC', () => {
    // Việc xảy ra 1/9, ghi vào tối 10/9 giờ máy → đúng 9 ngày ở mọi múi giờ.
    const t = tx({ occurred_on: '2026-09-01', created_at: luc(2026, 9, 10, 23, 30) })
    expect(txProvenance(t).lateDays).toBe(9)
  })

  it('ghi TRƯỚC ngày xảy ra (khoản đặt lịch) không ra số âm', () => {
    const t = tx({ occurred_on: '2026-09-20', created_at: luc(2026, 9, 7) })
    expect(txProvenance(t).lateDays).toBe(0)
  })
})

describe('provenanceLine', () => {
  it('không có mốc tạo thì trả rỗng — nơi gọi khỏi dựng ô trống', () => {
    expect(provenanceLine(txProvenance(tx({ created_at: 'méo' })))).toBe('')
  })

  it('khoản mới nhập tay: nói rõ CHƯA SỬA, không im lặng', () => {
    expect(provenanceLine(txProvenance(tx()))).toBe('Ghi lúc 2026/09/07 14:32 · chưa sửa lần nào')
  })

  it('khoản đã sửa', () => {
    const t = tx({ updated_at: luc(2026, 9, 8, 9, 5) })
    expect(provenanceLine(txProvenance(t))).toBe(
      'Ghi lúc 2026/09/07 14:32 · sửa lúc 2026/09/08 09:05',
    )
  })

  it('ghi muộn thì chèn thêm khoảng cách', () => {
    const t = tx({ occurred_on: '2026-08-29' })
    expect(provenanceLine(txProvenance(t))).toBe(
      'Ghi lúc 2026/09/07 14:32 · sau 9 ngày · chưa sửa lần nào',
    )
  })

  it('muộn ĐÚNG MỘT ngày thì im — ghi hôm sau là chuyện thường', () => {
    const t = tx({ occurred_on: '2026-09-06' })
    expect(provenanceLine(txProvenance(t))).not.toContain('ngày')
  })

  it('khoản định kỳ nói rõ do quy tắc sinh, không phải mình quên ghi', () => {
    const t = tx({ recurring_rule_id: 'r1' })
    expect(provenanceLine(txProvenance(t))).toBe(
      'Quy tắc định kỳ sinh lúc 2026/09/07 14:32 · chưa sửa lần nào',
    )
  })

  it('dòng MÁY SINH không bao giờ nói "sau N ngày" — đó là lúc bù kỳ, không phải quên ghi', () => {
    // Ca thật trong dữ liệu demo: lượt bù kỳ sinh một kỳ lương của 2024 vào hôm nay.
    const t = tx({ recurring_rule_id: 'r1', occurred_on: '2024-09-25' })
    expect(txProvenance(t).lateDays).toBeGreaterThan(700)
    expect(provenanceLine(txProvenance(t))).not.toContain('sau')
  })

  it('khoản từ lệnh cổ phiếu', () => {
    const t = tx({ stock_trade_id: 's1' })
    expect(provenanceLine(txProvenance(t))).toContain('Lệnh cổ phiếu sinh lúc')
  })
})
