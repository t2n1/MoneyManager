import { describe, expect, it } from 'vitest'
import { baoCaoThang, nganSach } from './moc'
import type { DuLieu } from '../basket'
import type { AccountRow, BudgetRow, CategoryRow, TransactionRow } from '../../types/database.types'

const acc: AccountRow = {
  id: 'a1', user_id: 'u1', name: 'Tiền mặt', type: 'cash', currency: 'JPY',
  initial_balance: 0, asset_group: null, is_hidden: false, include_in_totals: true,
} as unknown as AccountRow

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
  txs: [], accounts: [acc], categories: [], tags: [], txTags: [], budgets: [], fx: [],
  base: 'JPY', monthStartDay: 1, tz: 'Asia/Tokyo', ...p,
})

describe('baoCaoThang', () => {
  it('thu − chi − chuyển = phần để lại, và ba tầng cộng lại đúng bằng thu', () => {
    const r = baoCaoThang(
      { thang: '2026-07' },
      du({
        categories: [cat('c-gui', 'Gửi về VN', { kind: 'transfer' })],
        txs: [
          tx({ id: '1', type: 'income', amount: 300_000 }),
          tx({ id: '2', amount: 100_000 }),
          tx({ id: '3', category_id: 'c-gui', amount: 30_000 }),
        ],
      }),
    )
    expect(r.thu.so).toBe(300_000)
    expect(r.chi.so).toBe(100_000)
    expect(r.chuyen.so).toBe(30_000)
    expect(r.de_lai.so).toBe(170_000)
    expect(r.chi.so + r.chuyen.so + r.de_lai.so).toBe(r.thu.so)
  })

  it('phần để lại ÂM được giữ nguyên, không kẹp về 0', () => {
    const r = baoCaoThang(
      { thang: '2026-07' },
      du({ txs: [tx({ id: '1', type: 'income', amount: 1000 }), tx({ id: '2', amount: 5000 })] }),
    )
    expect(r.de_lai.so).toBe(-4000)
  })

  it('thiếu tỷ giá thì bật cờ và nói rõ số chưa đủ', () => {
    const viVN: AccountRow = { ...acc, id: 'a2', name: 'Ví VN', currency: 'VND' }
    const r = baoCaoThang(
      { thang: '2026-07' },
      du({ accounts: [acc, viVN], txs: [tx({ id: '1', account_id: 'a2', amount: 500_000 })], fx: [] }),
    )
    expect(r.thieu_ty_gia).toBe(true)
    expect(r.ghi_chu.join(' ')).toMatch(/chưa đủ/i)
  })
})

describe('nganSach', () => {
  // Cột thật của `budgets` là `amount` + `month_key` (không phải `limit_amount`), và
  // `buildBudgetReport` lấy `b.amount + carried` — đặt sai tên cột thì hạn mức ra NaN
  // mà không có gì đỏ ngoài phép so sánh cuối.
  const budget = (
    category_id: string,
    amount: number,
    p: Partial<BudgetRow> = {},
  ): BudgetRow => ({
    id: `b-${category_id}-${p.month_key ?? '2026-07'}`,
    user_id: 'u1',
    category_id,
    month_key: '2026-07',
    amount,
    created_at: '',
    updated_at: '',
    ...p,
  })

  it('còn lại = hạn mức − đã tiêu, và đánh dấu dòng vượt trần', () => {
    const r = nganSach(
      { thang: '2026-07' },
      du({
        categories: [cat('c1', 'Ăn ngoài')],
        budgets: [budget('c1', 30_000)],
        txs: [tx({ id: '1', category_id: 'c1', amount: 42_000 })],
      }),
    )
    expect(r.dong).toEqual([
      {
        danh_muc: 'Ăn ngoài',
        han_muc: { don_vi: 'JPY', so: 30_000, hien: '¥30,000' },
        da_tieu: { don_vi: 'JPY', so: 42_000, hien: '¥42,000' },
        con_lai: { don_vi: 'JPY', so: -12_000, hien: '-¥12,000' },
        vuot: true,
        chi_la_moc_theo_doi: false,
      },
    ])
  })

  it('dùng ngưỡng vượt CỦA APP (status) chứ không tự so', () => {
    const r = nganSach(
      { thang: '2026-07' },
      du({
        categories: [cat('c1', 'Ăn ngoài')],
        budgets: [budget('c1', 30_000)],
        txs: [tx({ id: '1', category_id: 'c1', amount: 30_000 })],
      }),
    )
    // ratio = 1 → status 'over' theo statusOf() của progress.ts. Phép thử này chốt rằng
    // tool ĐỌC status thay vì tự đặt ngưỡng riêng — hai ngưỡng khác nhau là một cái bug im lặng.
    expect(r.dong[0].vuot).toBe(true)
    expect(r.dong[0].con_lai.so).toBe(0)
  })

  // `buildBudgetReport` KHÔNG tự lọc tháng — tab Ngân sách của app lọc trước bằng
  // `useBudgets(monthKey)` (queries.ts:885). Không lọc ở đây thì mọi tháng đều nhận hạn
  // mức của mọi tháng, và số của Claude lệch hẳn tab Ngân sách.
  it('chỉ lấy hạn mức của ĐÚNG tháng được hỏi', () => {
    const r = nganSach(
      { thang: '2026-07' },
      du({
        categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Đi lại')],
        budgets: [
          budget('c1', 30_000),
          budget('c2', 99_000, { month_key: '2026-06' }),
        ],
        txs: [tx({ id: '1', category_id: 'c1', amount: 1_000 })],
      }),
    )
    expect(r.dong.map((d) => d.danh_muc)).toEqual(['Ăn ngoài'])
  })

  // Dồn hạn mức (mục AH): tab Ngân sách cộng phần chưa tiêu của tháng trước vào trần
  // tháng này. Bỏ qua thì tool "mốc đối chiếu" lại là cái lệch với màn hình nó đối chiếu.
  it('cộng phần hạn mức chưa tiêu tháng trước cho hạn mức bật dồn', () => {
    const r = nganSach(
      { thang: '2026-07' },
      du({
        categories: [cat('c1', 'Ăn ngoài')],
        budgets: [
          budget('c1', 30_000, { month_key: '2026-06', rollover: true }),
          budget('c1', 30_000, { rollover: true }),
        ],
        // Tháng 6 tiêu 10.000 → còn 20.000 dồn sang tháng 7 → trần tháng 7 = 50.000.
        txs: [tx({ id: '1', category_id: 'c1', amount: 10_000, occurred_on: '2026-06-10' })],
      }),
    )
    expect(r.dong[0].han_muc.so).toBe(50_000)
    expect(r.dong[0].da_tieu.so).toBe(0)
    expect(r.ghi_chu.join(' ')).toMatch(/dồn/i)
  })

  it('không có ngân sách nào thì trả rỗng kèm ghi chú', () => {
    const r = nganSach({ thang: '2026-07' }, du())
    expect(r.dong).toEqual([])
    expect(r.ghi_chu.join(' ')).toMatch(/chưa đặt ngân sách/i)
  })
})
