// Ghép từng dòng sao kê với từng giao dịch trong sổ, rồi chia phần lệch làm hai: thứ
// NGƯỜI DÙNG cần xem, và thứ giải thích được bằng khác biệt cấu trúc.
//
// Vì sao phải chia: đo trên 8 kỳ PayPay, ~200 dòng, chỉ 4 dòng là ghi sai thật. Đổ hết
// phần lệch vào một danh sách thì 4 dòng đáng sửa nằm lẫn giữa hàng chục dòng vô hại.
//
// Vì sao ghép CẢ LÔ một lượt (đợt 2): Rakuten ghi phí ETC trễ tới 5 tuần — dòng 17/05 nằm
// trong hoá đơn kỳ quẹt tháng 6. Ghép từng kỳ với rổ sổ của đúng kỳ đó thì dòng ấy báo
// "thẻ có, sổ không" dù sổ có. Một rổ cho cả lô; cặp ghép được GÁN VỀ KỲ CỦA DÒNG THẺ.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { CARD_RECONCILE_NOTE } from './reconcile'
import type { MergedStatement } from './statementBatch'
import type { StatementLine } from './statementLine'

export interface LedgerTx {
  id: string
  occurred_on: string
  amount: number
  type: 'expense' | 'income' | 'transfer'
  is_refund: boolean
  to_account_id: string | null
  note: string | null
}

export type ExplainedCause =
  | 'refund-shifted'
  | 'wallet-topup'
  | 'date-edge'
  | 'late-posting'
  | 'recalculated'
  | 'merged-rows'
  | 'installment'
  | 'investment'

/**
 * Một hàng của bảng ghép đôi. n:m vì `merged-rows` là 1 sổ : n thẻ, `wallet-topup` là
 * 1 thẻ : n sổ. `cause` rỗng = khớp thường.
 */
export interface Pair {
  ledger: LedgerTx[]
  lines: StatementLine[]
  cause?: ExplainedCause
  label: string
  /** Số tiền đại diện của hàng (phía thẻ nếu có, không thì phía sổ). */
  amount: number
}

export interface ReconcileResult {
  /** Số dòng thẻ của kỳ ghép được 1-1 (kể cả date-edge / late-posting). */
  matchedCount: number
  extraInLedger: { tx: LedgerTx; amount: number }[]
  missingFromLedger: StatementLine[]
  /**
   * Chênh lệch CHỈ liên quan tới hoàn tiền: dòng `adjustment` của nhà thẻ và dòng hoàn
   * trong sổ không khớp 1-1 được. Nhóm RIÊNG chứ không nhét vào `explained`: nhà thẻ GỘP
   * nhiều khoản hoàn vào một dòng điều chỉnh nên hai bên hiếm khi khớp từng dòng — nhưng
   * một khoản hoàn người dùng QUÊN ghi cũng rơi vào đây, giấu đi là phản lại lý do tồn tại
   * của cả màn này.
   */
  refundDiffs: { source: 'ledger' | 'statement'; label: string; iso: string; amount: number }[]
  /** Dẫn xuất từ `pairs` có `cause`. */
  explained: { cause: ExplainedCause; label: string; amount: number }[]
  /**
   * Nạp ví không tìm được nhóm món sổ tương ứng. Gom một cụm, không rải lẻ: ví có số dư nên
   * đây thường KHÔNG phải lỗi sổ, nhưng giấu hẳn thì một tuần quên ghi cũng biến mất.
   */
  unmatchedTopups: { count: number; total: number; lines: StatementLine[] }
  pairs: Pair[]
}

export function emptyResult(): ReconcileResult {
  return {
    matchedCount: 0,
    extraInLedger: [],
    missingFromLedger: [],
    refundDiffs: [],
    explained: [],
    unmatchedTopups: { count: 0, total: 0, lines: [] },
    pairs: [],
  }
}

const MATCH_WINDOW_DAYS = 4
/**
 * `date-edge` = CÙNG một lần mua, hai bên ghi hai ngày, rơi hai kỳ. Cách ranh giới kỳ xa
 * hơn thế thì là nhà thẻ ghi TRỄ (`late-posting`) — ETC là 5 tuần. Cả hai đều đã ghép 1-1
 * nên không "khớp bừa"; nhãn chỉ để người đọc hiểu vì sao hàng nằm ở kỳ này.
 */
const EDGE_WINDOW_DAYS = 7
const DAY = 86_400_000
const dayGap = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY))
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Dấu của một dòng sổ theo cách repo ghi tiền: hoàn tiền là `expense` + `is_refund`, KHÔNG
 * phải `income` (xem `aggregate.ts: expenseSign`). `income` trên thẻ cũng mang dấu âm —
 * khớp `txBalanceDelta` (`lib/cardBalance.ts`): tiền vào thẻ CỘNG vào số dư, cùng chiều
 * hoàn tiền, ngược chiều một khoản chi thật.
 */
const signedAmount = (t: LedgerTx) => (t.type === 'income' || t.is_refund ? -t.amount : t.amount)

/** Rổ sổ để đối chiếu, loại đúng những gì `cardMonthCharge` loại — hai chỗ phải nói cùng một kiểu. */
const inScope = (t: LedgerTx, cardId: string) =>
  !(t.type === 'transfer' && t.to_account_id === cardId) && t.note !== CARD_RECONCILE_NOTE

/**
 * Dòng thẻ KHÔNG đi qua vòng ghép 1-1: trả góp lần sau và mua quỹ không có gì để ghép;
 * nạp ví đi qua luật riêng (Task 5) — để vòng 1 lấy nó trước là luật riêng không bao giờ
 * tới lượt, và một lần nạp 1.485 sẽ ăn nhầm một khoản chi 1.485 cùng ngày.
 */
const UNMATCHABLE = new Set<StatementLine['kind']>(['installment-later', 'investment', 'topup'])

/** Mọi tổ hợp kích cỡ `size` lấy từ `arr`, không lặp phần tử, không quan tâm thứ tự. */
function* combinations<T>(arr: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  for (let i = 0; i <= arr.length - size; i++) {
    for (const rest of combinations(arr.slice(i + 1), size - 1)) yield [arr[i], ...rest]
  }
}

/** Tổ hợp `minSize..maxSize` phần tử của `pool` có tổng đúng `target`, không thì null. */
function findSubset<T>(target: number, pool: T[], amountOf: (x: T) => number, minSize: number, maxSize: number): T[] | null {
  for (let size = minSize; size <= Math.min(maxSize, pool.length); size++) {
    for (const combo of combinations(pool, size)) {
      if (combo.reduce((s, c) => s + amountOf(c), 0) === target) return combo
    }
  }
  return null
}

interface S {
  l: StatementLine
  closeISO: string
  range: MergedStatement['range']
  used: boolean
}
interface L {
  t: LedgerTx
  amount: number
  used: boolean
}

/**
 * ĐIỀU KIỆN GỌI: `ledger` PHẢI đã lọc về đúng một thẻ (`cardId`) — `LedgerTx` không mang
 * `account_id` nên `inScope` không tự lọc được. Cửa sổ ngày của `ledger` phải phủ từ
 * min(range.start, ngày dòng thẻ sớm nhất) tới hết kỳ muộn nhất.
 * `statements` phải đã qua `mergeStatements` (mỗi closeISO một bản, sắp tăng).
 */
export function reconcileBatch(
  statements: MergedStatement[],
  ledger: LedgerTx[],
  cardId: string,
): Map<string, ReconcileResult> {
  const out = new Map<string, ReconcileResult>()
  for (const m of statements) out.set(m.range.closeISO, emptyResult())

  const stmt: S[] = statements.flatMap((m) =>
    m.lines.map((l) => ({ l, closeISO: m.range.closeISO, range: m.range, used: false })),
  )
  const led: L[] = ledger
    .filter((t) => inScope(t, cardId))
    .map((t) => ({ t, amount: signedAmount(t), used: false }))

  /** Kỳ chứa một ngày sổ, theo [start, end). Ngoài mọi kỳ đã nạp ⇒ undefined. */
  const periodOf = (iso: string) => statements.find((m) => iso >= m.range.start && iso < m.range.end)

  const push = (closeISO: string, pair: Pair) => {
    const r = out.get(closeISO)!
    r.pairs.push(pair)
    if (pair.cause) r.explained.push({ cause: pair.cause, label: pair.label, amount: pair.amount })
  }

  /** Cặp 1-1 vừa ghép: gán nhãn theo vị trí ngày sổ so với kỳ của dòng thẻ. */
  const pairOneToOne = (a: L, s: S) => {
    a.used = true
    s.used = true
    const iso = a.t.occurred_on
    const inside = iso >= s.range.start && iso < s.range.end
    let cause: ExplainedCause | undefined
    if (!inside) {
      const gap = iso < s.range.start ? dayGap(s.range.start, iso) : dayGap(iso, s.range.closeISO)
      cause = gap <= EDGE_WINDOW_DAYS ? 'date-edge' : 'late-posting'
    }
    const label =
      cause === 'date-edge'
        ? `${s.l.name} — thẻ ghi ${dayLabel(s.l.iso)}, sổ ${dayLabel(iso)}`
        : cause === 'late-posting'
          ? `${s.l.name} — nhà thẻ ghi trễ, sổ ${dayLabel(iso)}`
          : s.l.name
    push(s.closeISO, { ledger: [a.t], lines: [s.l], cause, label, amount: s.l.amount })
    out.get(s.closeISO)!.matchedCount++
  }

  // Vòng 1: mọi cặp (thẻ, sổ) cùng số tiền, lệch ngày ≤ cửa sổ, BẤT KỂ kỳ — chọn theo ĐỘ
  // LỆCH NHỎ NHẤT TOÀN CỤC, không tham lam theo thứ tự mảng `ledger`. `ledger` tới theo thứ
  // tự ngày (thực tế: `supabaseRepo.searchTransactions` sắp GIẢM DẦN theo `occurred_on`), dù
  // tăng hay giảm dần thì xét tham lam từng dòng sổ một và chọn ứng viên đầu tiên vừa mắt vẫn
  // để một dòng sổ KHÁC KỲ với dòng thẻ giành quyền chọn trước một dòng sổ đến sau trong mảng
  // — dù dòng sau mới thực sự khớp (gap nhỏ hơn, đúng kỳ của dòng thẻ). Vì vậy phải sắp toàn
  // cục theo độ lệch trước khi ghép, không xử lý tuần tự theo thứ tự mảng.
  const candidates: { a: L; s: S; gap: number; inside: boolean }[] = []
  for (const a of led) {
    for (const s of stmt) {
      if (UNMATCHABLE.has(s.l.kind) || s.l.amount !== a.amount) continue
      const gap = dayGap(a.t.occurred_on, s.l.iso)
      if (gap > MATCH_WINDOW_DAYS) continue
      const inside = a.t.occurred_on >= s.range.start && a.t.occurred_on < s.range.end
      candidates.push({ a, s, gap, inside })
    }
  }
  candidates.sort((x, y) => x.gap - y.gap || Number(y.inside) - Number(x.inside))
  for (const c of candidates) {
    if (c.a.used || c.s.used) continue
    pairOneToOne(c.a, c.s)
  }
  // Vòng 2: bỏ giới hạn ngày nhưng đòi CÙNG KỲ. Sao kê hay dời ngày vài hôm.
  for (const a of led) {
    if (a.used) continue
    const p = periodOf(a.t.occurred_on)
    if (!p) continue
    const s = stmt.find(
      (s) => !s.used && !UNMATCHABLE.has(s.l.kind) && s.closeISO === p.range.closeISO && s.l.amount === a.amount,
    )
    if (s) pairOneToOne(a, s)
  }

  // Nạp ví (Rakuten Pay, PayPay チャージ) chưa ghép 1-1: sổ ghi TỪNG MÓN tiêu ngày hôm
  // trước, thẻ ghi MỘT lần nạp hôm sau. Đo thật: nạp 2.376 ngày 22/06 = sổ 21/06 có 1.051 +
  // 1.325. Chỉ dùng món CHƯA ghép, không hoàn tiền; nhận cả `transfer` từ thẻ ra ví (cách
  // sổ PayPay ghi một lần nạp — ghép 1 dòng : 1 transfer ở đây, không qua vòng 1). Thử
  // D−1 trước rồi D.
  const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10)
  for (const s of stmt) {
    if (s.used || s.l.kind !== 'topup') continue
    for (const day of [shift(s.l.iso, -1), s.l.iso]) {
      const pool = led.filter(
        (a) => !a.used && !a.t.is_refund && (a.t.type === 'expense' || a.t.type === 'transfer') && a.t.occurred_on === day,
      )
      const group = findSubset(s.l.amount, pool, (a) => a.amount, 1, 4)
      if (!group) continue
      s.used = true
      group.forEach((a) => (a.used = true))
      const wallet = s.l.name.normalize('NFKC').includes('楽天') ? 'Rakuten Pay' : 'PayPay'
      push(s.closeISO, {
        ledger: group.map((a) => a.t), lines: [s.l], cause: 'wallet-topup',
        label: `Nạp ví ${wallet} = ${group.length} món sổ ngày ${dayLabel(day)}`, amount: s.l.amount,
      })
      break
    }
  }

  // Luật cho dòng SỔ chưa ghép.
  for (const a of led) {
    if (a.used) continue
    const p = periodOf(a.t.occurred_on)
    // Hoàn tiền sổ ghi ở kỳ này, nhà thẻ cấn qua 調整額 ở kỳ khác — bất kỳ kỳ nào đã nạp.
    // Chỉ xét khi dòng sổ THẬT SỰ là hoàn tiền (`is_refund`): một khoản `income` cùng số tiền
    // không phải hoàn tiền — ghép nhầm với 調整額 là giấu một khoản thu nhập thật đi.
    const adj = a.t.is_refund
      ? stmt.find((s) => !s.used && s.l.kind === 'adjustment' && s.l.amount === a.amount)
      : undefined
    if (adj) {
      a.used = true
      adj.used = true
      push(adj.closeISO, {
        ledger: [a.t], lines: [adj.l], cause: 'refund-shifted',
        label: 'Hoàn tiền nhà thẻ cấn ở kỳ khác', amount: adj.l.amount,
      })
      continue
    }
    if (!p) continue // ngoài mọi kỳ đã nạp và không ghép được ⇒ không thuộc kỳ nào đang xem
    // Sổ ghi GỘP một dòng, nhà thẻ TÁCH nhiều dòng CÙNG NGÀY — cùng tiền, khác độ mịn.
    // Cùng dấu với dòng sổ: Rakuten ghi hoàn tiền là dòng `purchase` ÂM, 3.000 + (−2.000)
    // không được phép "giải thích" một khoản 1.000.
    const sameDay = stmt.filter(
      (s) =>
        !s.used &&
        s.l.kind === 'purchase' &&
        s.closeISO === p.range.closeISO &&
        s.l.iso === a.t.occurred_on &&
        Math.sign(s.l.amount) === Math.sign(a.amount),
    )
    const merged = findSubset(a.amount, sameDay, (s) => s.l.amount, 2, 4)
    if (merged) {
      a.used = true
      merged.forEach((s) => (s.used = true))
      push(p.range.closeISO, {
        ledger: [a.t], lines: merged.map((s) => s.l), cause: 'merged-rows',
        label: `${merged.map((s) => s.l.name).join(' + ')} — sổ ghi gộp một dòng`, amount: a.amount,
      })
      continue
    }
    const r = out.get(p.range.closeISO)!
    if (a.t.is_refund) {
      r.refundDiffs.push({ source: 'ledger', label: a.t.note ?? '', iso: a.t.occurred_on, amount: a.amount })
    } else {
      r.extraInLedger.push({ tx: a.t, amount: a.amount })
    }
  }

  // Luật cho dòng THẺ chưa ghép.
  for (const s of stmt) {
    if (s.used) continue
    const r = out.get(s.closeISO)!
    switch (s.l.kind) {
      case 'recalculated':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'recalculated', label: `${s.l.name} — nhà thẻ tính lại`, amount: s.l.amount })
        break
      case 'adjustment':
        r.refundDiffs.push({ source: 'statement', label: s.l.name, iso: s.l.iso, amount: s.l.amount })
        break
      case 'topup':
        r.unmatchedTopups.count++
        r.unmatchedTopups.total += s.l.amount
        r.unmatchedTopups.lines.push(s.l)
        break
      case 'installment-later':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'installment', label: `${s.l.name} — trả góp lần sau, sổ đã ghi cả món`, amount: s.l.amount })
        break
      case 'investment':
        push(s.closeISO, { ledger: [], lines: [s.l], cause: 'investment', label: `${s.l.name} — mua quỹ, theo dõi riêng`, amount: s.l.amount })
        break
      default:
        r.missingFromLedger.push(s.l)
    }
  }

  return out
}
