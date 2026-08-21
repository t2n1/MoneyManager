import { describe, expect, it } from 'vitest'
import { thoiQuenGhiChep } from './thoiQuenGhiChep'
import type { DuLieu } from '../basket'
import type { AccountRow, CategoryRow, TransactionRow } from '../../types/database.types'

const acc: AccountRow = {
  id: 'a1', user_id: 'u1', name: 'Tiền mặt', type: 'cash', currency: 'JPY',
  initial_balance: 0, asset_group: null, is_hidden: false, include_in_totals: true,
} as unknown as AccountRow

const cat = (id: string, name: string): CategoryRow => ({
  id, user_id: 'u1', name, type: 'expense', icon: '', parent_id: null, sort_order: 0,
  is_archived: false, created_at: '', need_level: null, cost_type: null, kind: 'expense',
})

const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: 't1', user_id: 'u1', type: 'expense', amount: 1000, to_amount: null,
  category_id: null, account_id: 'a1', to_account_id: null, recurring_rule_id: null,
  occurred_on: '2026-07-10', note: '',
  created_at: '2026-07-10T02:00:00.000Z', updated_at: '2026-07-10T02:00:00.000Z', ...p,
})

const du = (p: Partial<DuLieu> = {}): DuLieu => ({
  txs: [], accounts: [acc], categories: [], tags: [], txTags: [], budgets: [], fx: [],
  base: 'JPY', monthStartDay: 1, tz: 'Asia/Tokyo', ...p,
})

const THANG_7 = { khoang: { tu_thang: '2026-07', den_thang: '2026-07' } }

describe('thoiQuenGhiChep', () => {
  it('chia độ trễ thành bốn nhóm', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        txs: [
          tx({ id: '1', occurred_on: '2026-07-10', created_at: '2026-07-10T02:00:00.000Z' }),
          tx({ id: '2', occurred_on: '2026-07-10', created_at: '2026-07-11T02:00:00.000Z' }),
          tx({ id: '3', occurred_on: '2026-07-10', created_at: '2026-07-15T02:00:00.000Z' }),
          tx({ id: '4', occurred_on: '2026-07-01', created_at: '2026-07-20T02:00:00.000Z' }),
        ],
      }),
    )
    expect(r.do_tre).toEqual([
      { nhom: 'ghi ngay', so_lan: 1 },
      { nhom: '1–2 ngày', so_lan: 1 },
      { nhom: '3–7 ngày', so_lan: 1 },
      { nhom: 'hơn một tuần', so_lan: 1 },
    ])
  })

  it('giờ nhập tính theo múi giờ user, không theo UTC', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({ txs: [tx({ id: '1', created_at: '2026-07-09T23:00:00.000Z' })] }),
    )
    expect(r.gio_nhap.find((g) => g.so_lan > 0)?.khung).toBe('sáng 6–11')
  })

  it('xếp danh mục ghi muộn nhất lên đầu, kèm số lần', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Tiền nhà')],
        txs: [
          tx({ id: '1', category_id: 'c1', occurred_on: '2026-07-02', created_at: '2026-07-02T02:00:00.000Z' }),
          tx({ id: '2', category_id: 'c2', occurred_on: '2026-07-02', created_at: '2026-07-12T02:00:00.000Z' }),
        ],
      }),
    )
    expect(r.danh_muc_ghi_muon_nhat[0]).toEqual({
      ten: 'Tiền nhà', tre_trung_binh_ngay: 10, so_lan: 1,
    })
  })

  it('độ trễ ÂM (ghi trước khi tiền đi) giữ nguyên dấu, không kẹp về 0', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        categories: [cat('c1', 'Vé tàu')],
        txs: [tx({ id: '1', category_id: 'c1', occurred_on: '2026-07-20', created_at: '2026-07-10T02:00:00.000Z' })],
      }),
    )
    expect(r.danh_muc_ghi_muon_nhat[0].tre_trung_binh_ngay).toBe(-10)
    expect(r.ghi_chu.join(' ')).toMatch(/ghi trước/i)
  })

  it('rỗng thì nói chưa có dữ liệu, không trả toàn số 0 như thể đã đo', () => {
    const r = thoiQuenGhiChep(THANG_7, du())
    expect(r.do_tre).toEqual([])
    expect(r.ghi_chu.join(' ')).toMatch(/chưa có giao dịch/i)
  })
})
