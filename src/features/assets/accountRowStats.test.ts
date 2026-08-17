import { describe, expect, it } from 'vitest'
import { accountRowStats, applyTx, DELTA_DAYS, SPARK_POINTS } from './accountRowStats'
import type { TransactionRow } from '../../types/database.types'

const tx = (p: Partial<TransactionRow>): TransactionRow =>
  ({
    id: crypto.randomUUID(),
    type: 'expense',
    account_id: 'A',
    to_account_id: null,
    amount: 0,
    to_amount: null,
    is_refund: false,
    occurred_on: '2026-08-10',
    category_id: null,
    exclude_from_stats: false,
    ...p,
  }) as unknown as TransactionRow

describe('applyTx — chép đúng view account_balances', () => {
  it('thu cộng, chi trừ', () => {
    expect(applyTx(tx({ type: 'income', amount: 500 }), 'A')).toBe(500)
    expect(applyTx(tx({ type: 'expense', amount: 500 }), 'A')).toBe(-500)
  })

  // Nhánh dễ sai nhất: hoàn tiền là `expense` nhưng CỘNG. Nhánh này phải đứng trước
  // nhánh expense thường, không thì mọi khoản hoàn tiền bị trừ về hướng sai.
  it('hoàn tiền là expense nhưng CỘNG', () => {
    expect(applyTx(tx({ type: 'expense', amount: 500, is_refund: true }), 'A')).toBe(500)
  })

  it('chuyển khoản: trừ bên đi, cộng bên đến', () => {
    const t = tx({ type: 'transfer', account_id: 'A', to_account_id: 'B', amount: 300 })
    expect(applyTx(t, 'A')).toBe(-300)
    expect(applyTx(t, 'B')).toBe(300)
  })

  // Chuyển xuyên tệ: bên nhận cộng `to_amount`, không phải `amount`. Bỏ sót là số dư
  // tài khoản ngoại tệ sai đúng bằng chênh lệch tỷ giá.
  it('chuyển xuyên tệ: bên đến cộng to_amount', () => {
    const t = tx({ type: 'transfer', account_id: 'A', to_account_id: 'B', amount: 10_000, to_amount: 1_700_000 })
    expect(applyTx(t, 'A')).toBe(-10_000)
    expect(applyTx(t, 'B')).toBe(1_700_000)
  })

  it('không liên quan thì 0', () => {
    expect(applyTx(tx({ type: 'income', amount: 500, account_id: 'Z' }), 'A')).toBe(0)
  })

  // View KHÔNG lọc exclude_from_stats, nên ở đây cũng không: khoản bị loại khỏi thống kê
  // vẫn làm số dư đổi thật. Lọc là Δ không khớp số dư bên cạnh nó.
  it('exclude_from_stats vẫn tính vào số dư', () => {
    expect(applyTx(tx({ type: 'expense', amount: 500, exclude_from_stats: true }), 'A')).toBe(-500)
  })
})

describe('accountRowStats', () => {
  const chung = {
    adjustCategoryIds: new Set(['ADJ']),
    todayISO: '2026-08-31',
    windowStartISO: '2026-08-01',
  }

  it('Δ là tổng hiệu trong cửa sổ', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 100_000]]),
      txs: [
        tx({ type: 'income', amount: 50_000, occurred_on: '2026-08-05' }),
        tx({ type: 'expense', amount: 20_000, occurred_on: '2026-08-20' }),
      ],
    }).get('A')!
    expect(r.delta).toBe(30_000)
  })

  it('bỏ giao dịch trước cửa sổ', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 100_000]]),
      txs: [tx({ type: 'income', amount: 999_999, occurred_on: '2026-07-15' })],
    }).get('A')!
    expect(r.delta).toBe(0)
  })

  // Bất biến quan trọng nhất: đầu PHẢI của đường tí hon phải đúng bằng con số đứng
  // cạnh nó. Đi xuôi từ số dư đầu kỳ thì sai số cộng dồn đọng hết vào đúng đầu đó.
  it('phần tử cuối của đường tí hon = số dư hiện tại', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 100_000]]),
      txs: [
        tx({ type: 'income', amount: 50_000, occurred_on: '2026-08-05' }),
        tx({ type: 'expense', amount: 20_000, occurred_on: '2026-08-20' }),
      ],
    }).get('A')!
    expect(r.spark).toHaveLength(SPARK_POINTS)
    expect(r.spark[r.spark.length - 1]).toBe(100_000)
    // Và mốc đầu = số dư hiện tại trừ đi toàn bộ Δ.
    expect(r.spark[0]).toBe(100_000 - 30_000 + 0)
  })

  it('đường tí hon đi lên khi Δ dương', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 100_000]]),
      txs: [tx({ type: 'income', amount: 40_000, occurred_on: '2026-08-15' })],
    }).get('A')!
    expect(r.spark[0]).toBeLessThan(r.spark[r.spark.length - 1])
  })

  it('nhiều tài khoản, mỗi cái một Δ', () => {
    const m = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 10], ['B', 20]]),
      txs: [tx({ type: 'transfer', account_id: 'A', to_account_id: 'B', amount: 300, occurred_on: '2026-08-09' })],
    })
    expect(m.get('A')!.delta).toBe(-300)
    expect(m.get('B')!.delta).toBe(300)
  })

  describe('ngày đối chiếu', () => {
    it('lấy lần GẦN NHẤT trong cửa sổ', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0]]),
        txs: [
          tx({ type: 'income', amount: 1, category_id: 'ADJ', occurred_on: '2026-08-04' }),
          tx({ type: 'income', amount: 1, category_id: 'ADJ', occurred_on: '2026-08-19' }),
        ],
      }).get('A')!
      expect(r.lastReconciledISO).toBe('2026-08-19')
      expect(r.stale).toBe(false)
    })

    // Đối chiếu thấy KHỚP vẫn có thể ghi một dòng 0 — nó là bằng chứng đã đối chiếu.
    it('khoản bù bằng 0 vẫn tính là đã đối chiếu', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0]]),
        txs: [tx({ type: 'income', amount: 0, category_id: 'ADJ', occurred_on: '2026-08-19' })],
      }).get('A')!
      expect(r.lastReconciledISO).toBe('2026-08-19')
    })

    it('không thấy lần nào → stale', () => {
      const r = accountRowStats({ ...chung, balanceById: new Map([['A', 0]]), txs: [] }).get('A')!
      expect(r.lastReconciledISO).toBeNull()
      expect(r.stale).toBe(true)
    })

    it('khoản bù của tài khoản KHÁC không tính', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0], ['B', 0]]),
        txs: [tx({ account_id: 'B', type: 'income', amount: 1, category_id: 'ADJ', occurred_on: '2026-08-19' })],
      })
      expect(r.get('A')!.stale).toBe(true)
      expect(r.get('B')!.stale).toBe(false)
    })
  })

  it('cửa sổ Δ và cửa sổ đối chiếu là CÙNG một con số', () => {
    expect(DELTA_DAYS).toBe(30)
  })
})
