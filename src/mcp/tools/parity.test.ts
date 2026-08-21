// PHÉP THỬ BẤT BIẾN — cái chốt quan trọng nhất của cả MCP server.
//
// `truyVan` và `baoCaoThang` phải cho ra CÙNG một tổng chi cho cùng một tháng. Lệch nhau
// nghĩa là hai bên đang dùng hai rổ giao dịch khác nhau — đúng loại lỗi mà commit 7dc3834
// đã phải sửa một lần (khối 04 dùng rổ khác khối 01), và là loại lỗi không đọc ra được từ
// một file lẻ.
//
// Cùng tinh thần với phép thử "tổng ròng mọi dòng = phần để lại của khối 01" trong
// features/reports/monthReport.test.ts.
import { describe, expect, it } from 'vitest'
import { truyVan } from './truyVan'
import { baoCaoThang } from './moc'
import type { DuLieu } from '../basket'
import type { AccountRow, CategoryRow, TransactionRow } from '../../types/database.types'

const acc = (id: string, currency: 'JPY' | 'VND'): AccountRow =>
  ({
    id, user_id: 'u1', name: `TK ${id}`, type: 'cash', currency, initial_balance: 0,
    asset_group: null, is_hidden: false, include_in_totals: true,
  }) as unknown as AccountRow

const cat = (id: string, name: string, kind: 'expense' | 'transfer' = 'expense'): CategoryRow => ({
  id, user_id: 'u1', name, type: 'expense', icon: '', parent_id: null, sort_order: 0,
  is_archived: false, created_at: '', need_level: null, cost_type: null, kind,
})

const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: 't', user_id: 'u1', type: 'expense', amount: 1000, to_amount: null,
  category_id: null, account_id: 'a1', to_account_id: null, recurring_rule_id: null,
  occurred_on: '2026-07-10', note: '',
  created_at: '2026-07-10T02:00:00.000Z', updated_at: '2026-07-10T02:00:00.000Z', ...p,
})

/** Sổ có đủ mọi thứ hay làm lệch hai rổ: nợ, loại-khỏi-thống-kê, hoàn tiền, chuyển, thu. */
const SO: DuLieu = {
  accounts: [acc('a1', 'JPY')],
  categories: [cat('c1', 'Ăn ngoài'), cat('c-gui', 'Gửi về VN', 'transfer')],
  tags: [], txTags: [], budgets: [], fx: [],
  base: 'JPY', monthStartDay: 1, tz: 'Asia/Tokyo',
  txs: [
    tx({ id: '1', category_id: 'c1', amount: 42_000 }),
    tx({ id: '2', category_id: 'c1', amount: 8_000, is_refund: true }),
    tx({ id: '3', category_id: 'c-gui', amount: 30_000 }),
    tx({ id: '4', type: 'income', amount: 300_000 }),
    tx({ id: '5', amount: 99_999, is_debt_flow: true }),
    tx({ id: '6', amount: 88_888, exclude_from_stats: true }),
    tx({ id: '7', type: 'transfer', amount: 5_000 }),
    tx({ id: '8', category_id: 'c1', amount: 1_000, occurred_on: '2026-08-01' }),
    tx({ id: '9', category_id: 'c1', amount: 1_000, occurred_on: '2026-06-30' }),
  ],
}

describe('bất biến: truyVan và baoCaoThang dùng CÙNG một rổ', () => {
  it('tổng chi tháng 7 của truyVan = chi của baoCaoThang', () => {
    const moc = baoCaoThang({ thang: '2026-07' }, SO)
    const q = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], loai: 'chi', khoang: { tu_thang: '2026-07', den_thang: '2026-07' } },
      SO,
    )
    expect(q.dong[0].tien?.so).toBe(moc.chi.so)
  })

  it('tổng chuyển tháng 7 khớp nhau', () => {
    const moc = baoCaoThang({ thang: '2026-07' }, SO)
    const q = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], loai: 'chuyen', khoang: { tu_thang: '2026-07', den_thang: '2026-07' } },
      SO,
    )
    expect(q.dong[0].tien?.so).toBe(moc.chuyen.so)
  })

  it('tổng thu tháng 7 khớp nhau', () => {
    const moc = baoCaoThang({ thang: '2026-07' }, SO)
    const q = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], loai: 'thu', khoang: { tu_thang: '2026-07', den_thang: '2026-07' } },
      SO,
    )
    expect(q.dong[0].tien?.so).toBe(moc.thu.so)
  })

  it('xẻ theo danh mục rồi cộng lại vẫn bằng tổng chi (chiều không nhân bản dòng)', () => {
    const moc = baoCaoThang({ thang: '2026-07' }, SO)
    const q = truyVan(
      {
        do_luong: 'tong_tien',
        xe_theo: ['danh_muc'],
        loai: 'chi',
        khoang: { tu_thang: '2026-07', den_thang: '2026-07' },
        gioi_han: 100,
      },
      SO,
    )
    const cong = q.dong.reduce((s, d) => s + (d.tien?.so ?? 0), 0)
    expect(cong).toBe(moc.chi.so)
  })

  it('monthStartDay = 25 thì CẢ HAI cùng đổi khoảng, không chỉ một bên', () => {
    const so25: DuLieu = { ...SO, monthStartDay: 25 }
    const moc = baoCaoThang({ thang: '2026-07' }, so25)
    const q = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], loai: 'chi', khoang: { tu_thang: '2026-07', den_thang: '2026-07' } },
      so25,
    )
    expect(q.pham_vi.tu_ngay).toBe('2026-07-25')
    expect(q.dong[0]?.tien?.so ?? 0).toBe(moc.chi.so)
  })
})
