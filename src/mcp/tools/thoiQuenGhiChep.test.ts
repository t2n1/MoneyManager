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
    // Mỗi danh mục 3 khoản: dưới ngưỡng TOI_THIEU_SO_LAN thì bị loại — xem phép thử ngay dưới.
    const lo = (id: string, cat_id: string, ngayGhi: string) =>
      tx({ id, category_id: cat_id, occurred_on: '2026-07-02', created_at: `${ngayGhi}T02:00:00.000Z` })
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Tiền nhà')],
        txs: [
          lo('1', 'c1', '2026-07-02'), lo('2', 'c1', '2026-07-02'), lo('3', 'c1', '2026-07-02'),
          lo('4', 'c2', '2026-07-12'), lo('5', 'c2', '2026-07-12'), lo('6', 'c2', '2026-07-12'),
        ],
      }),
    )
    expect(r.danh_muc_ghi_muon_nhat[0]).toEqual({
      ten: 'Tiền nhà', tre_trung_binh_ngay: 10, so_lan: 3,
    })
  })

  // Bảng xếp hạng cũ để dòng n = 1 lên đầu. Trên dữ liệu thật, top 5 toàn n = 1–2 —
  // tức Claude sẽ nói "danh mục X hay bị ghi muộn nhất" từ đúng một giao dịch.
  it('loại danh mục quá ít khoản khỏi bảng xếp hạng, và nói là đã loại', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Thuốc')],
        txs: [
          tx({ id: '1', category_id: 'c1', created_at: '2026-07-10T02:00:00.000Z' }),
          tx({ id: '2', category_id: 'c1', created_at: '2026-07-11T02:00:00.000Z' }),
          tx({ id: '3', category_id: 'c1', created_at: '2026-07-12T02:00:00.000Z' }),
          // Chỉ 1 khoản, trễ nhất — đúng dòng sẽ đứng đầu bảng cũ.
          tx({ id: '4', category_id: 'c2', created_at: '2026-07-30T02:00:00.000Z' }),
        ],
      }),
    )
    expect(r.danh_muc_ghi_muon_nhat.map((d) => d.ten)).toEqual(['Ăn ngoài'])
    expect(r.ghi_chu.join(' ')).toMatch(/quá ít khoản/i)
  })

  // ĐÂY là bài quan trọng nhất: sổ này có 9 năm nhập từ Zaim và sao kê Rakuten nhập theo
  // tháng, nên `created_at` của phần lớn khoản là GIỜ CHẠY LỆNH NHẬP, không phải lúc gõ tay.
  // Trên dữ liệu thật tháng 6–7/2026: 184/186 khoản vào nhóm "hơn một tuần" và 180/186 vào
  // đúng một khung giờ chiều — mà tool vẫn trả ghi_chu RỖNG, tức nói như thể đã đo được
  // thói quen. Đó là phát hiện không kiểm chứng được, thứ spec cấm.
  it('nhận ra dữ liệu vào sổ theo LÔ và nói rõ đó là độ trễ nhập khẩu', () => {
    const moc = '2026-07-31T05:30:00.000Z' // một lần nhập, mọi khoản cùng created_at
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        txs: Array.from({ length: 12 }, (_, i) =>
          tx({ id: `t${i}`, occurred_on: '2026-07-02', created_at: moc }),
        ),
      }),
    )
    expect(r.phien_nhap).toEqual({ so_phien: 1, lo_lon_nhat: 12 })
    expect(r.ghi_chu.join(' ')).toMatch(/theo lô/i)
    expect(r.ghi_chu.join(' ')).toMatch(/nhập khẩu/i)
  })

  it('gõ tay rải rác thì KHÔNG báo nhập theo lô', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        txs: Array.from({ length: 12 }, (_, i) =>
          tx({
            id: `t${i}`,
            occurred_on: '2026-07-02',
            // Mỗi khoản một phút khác nhau → 12 phiên, lô lớn nhất = 1.
            created_at: `2026-07-02T0${i < 10 ? '3' : '4'}:${String(i * 5).padStart(2, '0')}:00.000Z`,
          }),
        ),
      }),
    )
    expect(r.phien_nhap.lo_lon_nhat).toBe(1)
    expect(r.ghi_chu.join(' ')).not.toMatch(/theo lô/i)
  })

  it('độ trễ ÂM (ghi trước khi tiền đi) giữ nguyên dấu, không kẹp về 0', () => {
    const r = thoiQuenGhiChep(
      THANG_7,
      du({
        categories: [cat('c1', 'Vé tàu')],
        // Ba khoản để qua ngưỡng TOI_THIEU_SO_LAN; giờ nhập lệch nhau để không bị coi là lô.
        txs: [
          tx({ id: '1', category_id: 'c1', occurred_on: '2026-07-20', created_at: '2026-07-10T02:00:00.000Z' }),
          tx({ id: '2', category_id: 'c1', occurred_on: '2026-07-20', created_at: '2026-07-10T03:00:00.000Z' }),
          tx({ id: '3', category_id: 'c1', occurred_on: '2026-07-20', created_at: '2026-07-10T04:00:00.000Z' }),
        ],
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
