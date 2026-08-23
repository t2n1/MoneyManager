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

  // `applyTx` là bản chép của view, và view KHÔNG lọc exclude_from_stats — nên hàm này
  // cũng không. Việc bỏ bút toán bù ra khỏi Δ là quyết định của `accountRowStats` (test
  // ngay dưới), không phải của hàm này: `keptDestinations` cũng dùng `applyTx` và tự lọc
  // theo rổ riêng của nó.
  it('exclude_from_stats vẫn tính vào số dư', () => {
    expect(applyTx(tx({ type: 'expense', amount: 500, exclude_from_stats: true }), 'A')).toBe(-500)
  })
})

describe('accountRowStats', () => {
  const chung = {
    lastReconciledById: new Map<string, string>(),
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

  // Bút toán bù số dư là sai số theo dõi được ghi nhận, không phải tiền vào — để nó
  // trong Δ là một cái ví ¥2.840 khoe "+¥1.446.190 / 30 ngày". Xem khối "VÌ SAO LOẠI
  // BÚT TOÁN BÙ" trong accountRowStats.ts.
  it('bỏ bút toán bù số dư khỏi Δ và khỏi đường tí hon', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 2_840]]),
      txs: [
        tx({ type: 'income', amount: 1_446_190, occurred_on: '2026-08-05', exclude_from_stats: true }),
        tx({ type: 'expense', amount: 1_000, occurred_on: '2026-08-20' }),
      ],
    }).get('A')!
    expect(r.delta).toBe(-1_000)
    // Đường vẫn neo ở số dư view trả về, và không còn bậc thang của khoản bù.
    expect(r.spark[r.spark.length - 1]).toBe(2_840)
    expect(r.spark[0]).toBe(3_840)
  })

  // Dòng nợ/cho vay thì GIỮ: tiền của người khác, nhưng nó rời tài khoản thật.
  it('giữ dòng nợ/cho vay trong Δ', () => {
    const r = accountRowStats({
      ...chung,
      balanceById: new Map([['A', 0]]),
      txs: [tx({ type: 'expense', amount: 200_000, occurred_on: '2026-08-10', is_debt_flow: true })],
    }).get('A')!
    expect(r.delta).toBe(-200_000)
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

  // Mốc đối chiếu KHÔNG còn suy ở đây nữa — nó tới từ `lastReconciledMap`
  // (notifications/reconciledAt.ts), nơi gộp cột `accounts.last_reconciled_at` với giao
  // dịch bù. Phép suy cũ ở file này chỉ nhìn giao dịch bù trong cửa sổ Δ, nên đối chiếu
  // thấy KHỚP (không sinh giao dịch nào) để lại nút "Đối chiếu" nằm lì ở dòng. Test cho
  // phép gộp hai nguồn nằm ở reconciledAt.test.ts; ở đây chỉ chốt phần dòng-tài-khoản.
  describe('ngày đối chiếu', () => {
    it('lấy đúng mốc được truyền vào', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0]]),
        txs: [],
        lastReconciledById: new Map([['A', '2026-08-19']]),
      }).get('A')!
      expect(r.lastReconciledISO).toBe('2026-08-19')
      expect(r.stale).toBe(false)
    })

    // Bản cũ suy "quá hạn" từ "không tìm thấy trong cửa sổ", nên không cần so ngày. Cột
    // thì giữ được mốc cũ tuỳ ý — bỏ phép so này là tài khoản đối chiếu từ năm ngoái
    // trông như vừa đối chiếu hôm qua.
    it('mốc cũ hơn cửa sổ vẫn là quá hạn, và vẫn hiện ra ngày', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0]]),
        txs: [],
        lastReconciledById: new Map([['A', '2026-06-01']]),
      }).get('A')!
      expect(r.lastReconciledISO).toBe('2026-06-01')
      expect(r.stale).toBe(true)
    })

    it('không có mốc nào → quá hạn', () => {
      const r = accountRowStats({ ...chung, balanceById: new Map([['A', 0]]), txs: [] }).get('A')!
      expect(r.lastReconciledISO).toBeNull()
      expect(r.stale).toBe(true)
    })

    it('mốc của tài khoản khác không tính sang', () => {
      const r = accountRowStats({
        ...chung,
        balanceById: new Map([['A', 0], ['B', 0]]),
        txs: [],
        lastReconciledById: new Map([['B', '2026-08-19']]),
      })
      expect(r.get('A')!.stale).toBe(true)
      expect(r.get('B')!.stale).toBe(false)
    })
  })

  it('cửa sổ Δ và cửa sổ đối chiếu là CÙNG một con số', () => {
    expect(DELTA_DAYS).toBe(30)
  })
})
