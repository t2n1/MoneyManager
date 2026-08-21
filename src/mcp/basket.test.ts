import { describe, expect, it } from 'vitest'
import { dungRo, docThang, khoangNgay, ratesMoiNhat, type DuLieu } from './basket'
import type { FxHistoryRow, TransactionRow } from '../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: p.id ?? 't1',
  user_id: 'u1',
  type: 'expense',
  amount: 1000,
  to_amount: null,
  category_id: null,
  account_id: 'a1',
  to_account_id: null,
  recurring_rule_id: null,
  occurred_on: '2026-07-10',
  note: '',
  created_at: '2026-07-10T02:00:00.000Z',
  updated_at: '2026-07-10T02:00:00.000Z',
  ...p,
})

const du = (p: Partial<DuLieu> = {}): DuLieu => ({
  txs: [],
  accounts: [],
  categories: [],
  tags: [],
  txTags: [],
  budgets: [],
  fx: [],
  base: 'JPY',
  monthStartDay: 1,
  tz: 'Asia/Tokyo',
  ...p,
})

describe('docThang', () => {
  it("'2026-07' → { year: 2026, month: 7 }", () => {
    expect(docThang('2026-07')).toEqual({ year: 2026, month: 7 })
  })

  it('chuỗi sai dạng thì ném lỗi nói rõ dạng đúng', () => {
    expect(() => docThang('7/2026')).toThrow(/YYYY-MM/)
  })
})

describe('khoangNgay', () => {
  it('theo tháng, monthStartDay = 1: mốc cuối là ngày đầu tháng sau (mốc mở)', () => {
    expect(khoangNgay({ tu_thang: '2026-07', den_thang: '2026-07' }, 1)).toEqual({
      tu: '2026-07-01',
      den: '2026-08-01',
    })
  })

  it('tôn trọng monthStartDay = 25 chứ không tự cắt đầu tháng', () => {
    expect(khoangNgay({ tu_thang: '2026-07', den_thang: '2026-07' }, 25)).toEqual({
      tu: '2026-07-25',
      den: '2026-08-25',
    })
  })

  it('nhiều tháng: từ đầu tháng đầu tới mốc mở của tháng cuối', () => {
    expect(khoangNgay({ tu_thang: '2026-05', den_thang: '2026-07' }, 1)).toEqual({
      tu: '2026-05-01',
      den: '2026-08-01',
    })
  })

  it('theo ngày: den_ngay là mốc ĐÓNG nên phải cộng một ngày thành mốc mở', () => {
    expect(khoangNgay({ tu_ngay: '2026-07-01', den_ngay: '2026-07-31' }, 1)).toEqual({
      tu: '2026-07-01',
      den: '2026-08-01',
    })
  })

  it('không có khoảng nào thì ném lỗi, không lặng lẽ lấy hết', () => {
    expect(() => khoangNgay({}, 1)).toThrow(/khoảng/)
  })
})

describe('ratesMoiNhat', () => {
  const fx = (on_date: string, rates: Record<string, number>): FxHistoryRow => ({
    user_id: 'u1',
    on_date,
    base: 'JPY',
    rates,
  })

  it('lấy dòng có on_date lớn nhất, không phụ thuộc thứ tự mảng vào', () => {
    expect(ratesMoiNhat([fx('2026-07-01', { VND: 170 }), fx('2026-08-01', { VND: 175 })], 'JPY'))
      .toEqual({ VND: 175 })
  })

  it('bỏ dòng khác base', () => {
    const khac: FxHistoryRow = { user_id: 'u1', on_date: '2026-08-02', base: 'USD', rates: { VND: 26000 } }
    expect(ratesMoiNhat([fx('2026-08-01', { VND: 175 }), khac], 'JPY')).toEqual({ VND: 175 })
  })

  it('không có dòng nào → rỗng, để convertToBase trả null và cờ thiếu tỷ giá bật', () => {
    expect(ratesMoiNhat([], 'JPY')).toEqual({})
  })
})

describe('dungRo', () => {
  it('bỏ is_debt_flow và exclude_from_stats', () => {
    const ro = dungRo(
      du({
        txs: [
          tx({ id: 'giu' }),
          tx({ id: 'no', is_debt_flow: true }),
          tx({ id: 'loai', exclude_from_stats: true }),
        ],
      }),
      { tu_thang: '2026-07', den_thang: '2026-07' },
    )
    expect(ro.txs.map((t) => t.id)).toEqual(['giu'])
  })

  it('giữ giao dịch chuyển khoản trong rổ — loại chi/thu/chuyển do tool tự lọc sau', () => {
    const ro = dungRo(du({ txs: [tx({ id: 'ck', type: 'transfer' })] }), {
      tu_thang: '2026-07',
      den_thang: '2026-07',
    })
    expect(ro.txs.map((t) => t.id)).toEqual(['ck'])
  })

  it('cắt theo khoảng: mốc cuối là mốc MỞ nên ngày đầu tháng sau bị loại', () => {
    const ro = dungRo(
      du({
        txs: [
          tx({ id: 'trong', occurred_on: '2026-07-31' }),
          tx({ id: 'ngoai', occurred_on: '2026-08-01' }),
          tx({ id: 'truoc', occurred_on: '2026-06-30' }),
        ],
      }),
      { tu_thang: '2026-07', den_thang: '2026-07' },
    )
    expect(ro.txs.map((t) => t.id)).toEqual(['trong'])
  })

  it('transferIds lấy từ danh mục kind = transfer', () => {
    const ro = dungRo(
      du({
        categories: [
          {
            id: 'c-gui', user_id: 'u1', name: 'Gửi về VN', type: 'expense', icon: '', parent_id: null,
            sort_order: 0, is_archived: false, created_at: '', need_level: null, cost_type: null,
            kind: 'transfer',
          },
          {
            id: 'c-an', user_id: 'u1', name: 'Ăn ngoài', type: 'expense', icon: '', parent_id: null,
            sort_order: 1, is_archived: false, created_at: '', need_level: null, cost_type: null,
            kind: 'expense',
          },
        ],
      }),
      { tu_thang: '2026-07', den_thang: '2026-07' },
    )
    expect([...ro.transferIds]).toEqual(['c-gui'])
  })

  it('phamVi nói lại khoảng thật và số dòng vào rổ', () => {
    const ro = dungRo(du({ txs: [tx({}), tx({ id: 't2' })] }), {
      tu_thang: '2026-07',
      den_thang: '2026-07',
    })
    expect(ro.phamVi).toEqual({
      tu_ngay: '2026-07-01',
      den_ngay: '2026-08-01',
      so_dong_vao_ro: 2,
      loc_da_ap: ['bỏ dòng tiền nợ/cho vay', 'bỏ khoản đã đánh dấu loại khỏi thống kê'],
    })
  })
})
