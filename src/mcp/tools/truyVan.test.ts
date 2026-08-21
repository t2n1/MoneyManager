import { describe, expect, it } from 'vitest'
import { truyVan } from './truyVan'
import type { DuLieu } from '../basket'
import type { AccountRow, CategoryRow, TransactionRow } from '../../types/database.types'

const acc = (id: string, name: string, currency: 'JPY' | 'VND' | 'USD' = 'JPY'): AccountRow =>
  ({
    id, user_id: 'u1', name, type: 'cash', currency, initial_balance: 0,
    asset_group: null, is_hidden: false, include_in_totals: true,
  }) as unknown as AccountRow

const cat = (id: string, name: string, p: Partial<CategoryRow> = {}): CategoryRow => ({
  id, user_id: 'u1', name, type: 'expense', icon: '', parent_id: null, sort_order: 0,
  is_archived: false, created_at: '', need_level: null, cost_type: null, kind: 'expense', ...p,
})

const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: 't1', user_id: 'u1', type: 'expense', amount: 1000, to_amount: null,
  category_id: null, account_id: 'a1', to_account_id: null, recurring_rule_id: null,
  occurred_on: '2026-07-10', note: '',
  created_at: '2026-07-10T02:00:00.000Z', updated_at: '2026-07-10T02:00:00.000Z', ...p,
})

const du = (p: Partial<DuLieu> = {}): DuLieu => ({
  txs: [], accounts: [acc('a1', 'Tiền mặt')], categories: [], tags: [], txTags: [],
  budgets: [], fx: [], base: 'JPY', monthStartDay: 1, tz: 'Asia/Tokyo', ...p,
})

const THANG_7 = { tu_thang: '2026-07', den_thang: '2026-07' }

describe('truyVan — đo lường', () => {
  it('tong_tien xẻ theo danh mục, trả TÊN chứ không phải id, sắp giảm dần', () => {
    const r = truyVan(
      { do_luong: 'tong_tien', xe_theo: ['danh_muc'], khoang: THANG_7 },
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Đi lại')],
        txs: [
          tx({ id: '1', category_id: 'c1', amount: 3000 }),
          tx({ id: '2', category_id: 'c2', amount: 5000 }),
          tx({ id: '3', category_id: 'c1', amount: 1000 }),
        ],
      }),
    )
    expect(r.dong).toEqual([
      { khoa: ['Đi lại'], tien: { don_vi: 'JPY', so: 5000, hien: '¥5,000' }, so_lan: 1 },
      { khoa: ['Ăn ngoài'], tien: { don_vi: 'JPY', so: 4000, hien: '¥4,000' }, so_lan: 2 },
    ])
  })

  it('so_lan trả `so`, không trả `tien`', () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: ['danh_muc'], khoang: THANG_7 },
      du({
        categories: [cat('c1', 'Ăn ngoài')],
        txs: [tx({ id: '1', category_id: 'c1' }), tx({ id: '2', category_id: 'c1' })],
      }),
    )
    expect(r.dong).toEqual([{ khoa: ['Ăn ngoài'], so: 2, so_lan: 2 }])
  })

  it('trung_binh_moi_lan = tổng / số lần, làm tròn về số nguyên minor units', () => {
    const r = truyVan(
      { do_luong: 'trung_binh_moi_lan', xe_theo: [], khoang: THANG_7 },
      du({ txs: [tx({ id: '1', amount: 1000 }), tx({ id: '2', amount: 1001 })] }),
    )
    expect(r.dong[0].tien?.so).toBe(1001)
  })

  it('hoàn tiền (is_refund) trừ ra khỏi tổng chi, không cộng vào', () => {
    const r = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], khoang: THANG_7 },
      du({ txs: [tx({ id: '1', amount: 5000 }), tx({ id: '2', amount: 2000, is_refund: true })] }),
    )
    expect(r.dong[0].tien?.so).toBe(3000)
  })

  it('do_tre_ghi: số ngày trung bình từ lúc tiền đi tới lúc gõ vào', () => {
    const r = truyVan(
      { do_luong: 'do_tre_ghi', xe_theo: [], khoang: THANG_7 },
      du({
        txs: [
          tx({ id: '1', occurred_on: '2026-07-10', created_at: '2026-07-10T02:00:00.000Z' }),
          tx({ id: '2', occurred_on: '2026-07-10', created_at: '2026-07-14T02:00:00.000Z' }),
        ],
      }),
    )
    expect(r.dong[0].so).toBe(2)
  })
})

describe('truyVan — chiều xẻ', () => {
  it('ngay_le_nhat chia ba: ngày lễ / cuối tuần / ngày thường', () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: ['ngay_le_nhat'], khoang: THANG_7, sap_xep: 'ten' },
      du({
        txs: [
          // 2026-07-20 là Ngày của Biển (thứ Hai), 2026-07-19 là Chủ Nhật, 2026-07-21 thứ Ba.
          tx({ id: '1', occurred_on: '2026-07-20' }),
          tx({ id: '2', occurred_on: '2026-07-19' }),
          tx({ id: '3', occurred_on: '2026-07-21' }),
        ],
      }),
    )
    expect(r.dong.map((d) => d.khoa[0]).sort()).toEqual(['cuối tuần', 'ngày lễ', 'ngày thường'])
  })

  it('gio_nhap đọc giờ theo múi giờ của user, không theo UTC', () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: ['gio_nhap'], khoang: THANG_7 },
      // 23:00 UTC = 08:00 hôm sau ở Tokyo → phải vào khung sáng, không phải khung đêm.
      du({ txs: [tx({ id: '1', created_at: '2026-07-09T23:00:00.000Z' })] }),
    )
    expect(r.dong[0].khoa[0]).toBe('sáng 6–11')
  })

  it('nhan: một giao dịch nhiều nhãn thì vào nhiều nhóm, và có ghi chú nói rõ', () => {
    const r = truyVan(
      { do_luong: 'tong_tien', xe_theo: ['nhan'], khoang: THANG_7 },
      du({
        txs: [tx({ id: '1', amount: 1000 })],
        tags: [
          { id: 'g1', user_id: 'u1', name: 'Công tác', color: 'red', sort_order: 0 } as never,
          { id: 'g2', user_id: 'u1', name: 'Hoàn được', color: 'blue', sort_order: 1 } as never,
        ],
        txTags: [
          { transaction_id: '1', tag_id: 'g1', user_id: 'u1' },
          { transaction_id: '1', tag_id: 'g2', user_id: 'u1' },
        ],
      }),
    )
    expect(r.dong).toHaveLength(2)
    expect(r.ghi_chu.join(' ')).toMatch(/nhiều nhãn/)
  })

  it('hai chiều thì khoá có hai phần tử', () => {
    const r = truyVan(
      {
        do_luong: 'tong_tien',
        xe_theo: ['thang', 'danh_muc'],
        khoang: { tu_thang: '2026-06', den_thang: '2026-07' },
      },
      du({
        categories: [cat('c1', 'Ăn ngoài')],
        txs: [
          tx({ id: '1', category_id: 'c1', occurred_on: '2026-06-10' }),
          tx({ id: '2', category_id: 'c1', occurred_on: '2026-07-10' }),
        ],
      }),
    )
    expect(r.dong.map((d) => d.khoa)).toEqual([['2026-06', 'Ăn ngoài'], ['2026-07', 'Ăn ngoài']])
  })

  it('tuan dùng tuần ISO, tuần bắt đầu thứ Hai', () => {
    const r = truyVan(
      {
        do_luong: 'so_lan',
        xe_theo: ['tuan'],
        khoang: { tu_ngay: '2026-07-05', den_ngay: '2026-07-06' },
        sap_xep: 'ten',
      },
      // 2026-07-05 là Chủ Nhật (cuối tuần ISO trước), 2026-07-06 là thứ Hai (tuần sau).
      du({ txs: [tx({ id: '1', occurred_on: '2026-07-05' }), tx({ id: '2', occurred_on: '2026-07-06' })] }),
    )
    expect(r.dong).toHaveLength(2)
    expect(r.dong[0].khoa[0] < r.dong[1].khoa[0]).toBe(true)
  })

  it('lọc theo need_level đọc từ DANH MỤC, không từ giao dịch', () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: [], loc: { need_level: ['essential'] }, khoang: THANG_7 },
      du({
        categories: [cat('c1', 'Tiền nhà', { need_level: 'essential' }), cat('c2', 'Cà phê')],
        txs: [tx({ id: '1', category_id: 'c1' }), tx({ id: '2', category_id: 'c2' })],
      }),
    )
    expect(r.dong[0].so).toBe(1)
  })

  it('quá 2 chiều thì ném lỗi nói rõ vì sao', () => {
    expect(() =>
      truyVan(
        { do_luong: 'tong_tien', xe_theo: ['thang', 'danh_muc', 'nhan'], khoang: THANG_7 },
        du(),
      ),
    ).toThrow(/tối đa 2 chiều/)
  })
})

describe('truyVan — loại giao dịch và bộ lọc', () => {
  it('mặc định chỉ tính CHI, không lẫn thu', () => {
    const r = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], khoang: THANG_7 },
      du({ txs: [tx({ id: '1', amount: 1000 }), tx({ id: '2', type: 'income', amount: 90_000 })] }),
    )
    expect(r.dong[0].tien?.so).toBe(1000)
    expect(r.pham_vi.loc_da_ap).toContain('chỉ tính khoản CHI')
  })

  // Ranh giới này PHẢI khớp `sumIncomeExpense` (aggregate.ts:307): hàm đó bỏ HẲN
  // `type = 'transfer'` (chuyển giữa hai tài khoản của chính mình — tiền không rời tay),
  // còn `transfer` của nó chỉ gồm giao dịch CHI thuộc danh mục `kind = 'transfer'`.
  // Kế hoạch ban đầu gộp cả hai vào 'chuyen'; làm vậy thì parity.test.ts (Task 6) đỏ, vì
  // tab Báo cáo của app không bao giờ cộng khoản chuyển nội bộ vào tầng "chuyển tài sản".
  it("loai = 'chuyen' chỉ tính danh mục kind transfer, KHÔNG tính chuyển giữa hai tài khoản", () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: [], loai: 'chuyen', khoang: THANG_7 },
      du({
        categories: [cat('c-gui', 'Gửi về VN', { kind: 'transfer' })],
        txs: [
          tx({ id: '1', type: 'transfer' }),
          tx({ id: '2', category_id: 'c-gui' }),
          tx({ id: '3', amount: 500 }),
        ],
      }),
    )
    expect(r.dong[0].so).toBe(1)
    expect(r.ghi_chu.join(' ')).toMatch(/giữa hai tài khoản/)
  })

  it('lọc theo TÊN danh mục, không phân biệt hoa thường', () => {
    const r = truyVan(
      { do_luong: 'so_lan', xe_theo: [], loc: { danh_muc: ['ăn NGOÀI'] }, khoang: THANG_7 },
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Đi lại')],
        txs: [tx({ id: '1', category_id: 'c1' }), tx({ id: '2', category_id: 'c2' })],
      }),
    )
    expect(r.dong[0].so).toBe(1)
  })

  it('tên lọc không khớp gì thì ném lỗi kèm danh sách tên có thật', () => {
    expect(() =>
      truyVan(
        { do_luong: 'so_lan', xe_theo: [], loc: { danh_muc: ['Ăn ngòai'] }, khoang: THANG_7 },
        du({ categories: [cat('c1', 'Ăn ngoài')] }),
      ),
    ).toThrow(/Ăn ngoài/)
  })
})

describe('truyVan — thiếu tỷ giá', () => {
  it('loại khoản không quy đổi được, bật cờ, đếm số khoản bị loại — KHÔNG coi 1:1', () => {
    const r = truyVan(
      { do_luong: 'tong_tien', xe_theo: [], khoang: THANG_7 },
      du({
        accounts: [acc('a1', 'Tiền mặt', 'JPY'), acc('a2', 'Ví VN', 'VND')],
        txs: [tx({ id: '1', amount: 1000 }), tx({ id: '2', account_id: 'a2', amount: 500_000 })],
        fx: [], // không có tỷ giá nào
      }),
    )
    expect(r.dong[0].tien?.so).toBe(1000)
    expect(r.thieu_ty_gia).toBe(true)
    expect(r.so_khoan_bi_loai).toBe(1)
  })
})

describe('truyVan — khoảng rỗng', () => {
  it('không có giao dịch thì trả rỗng kèm ghi chú, KHÔNG trả 0 đồng', () => {
    const r = truyVan({ do_luong: 'tong_tien', xe_theo: [], khoang: THANG_7 }, du())
    expect(r.dong).toEqual([])
    expect(r.ghi_chu.join(' ')).toMatch(/chưa có giao dịch/i)
  })
})
