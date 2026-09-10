// Ghép từng dòng sao kê với từng giao dịch trong sổ, rồi chia phần lệch làm hai:
// thứ NGƯỜI DÙNG cần xem, và thứ giải thích được bằng khác biệt cấu trúc.
//
// Vì sao phải chia: đo trên 8 kỳ PayPay, ~200 dòng, chỉ 4 dòng là ghi sai thật. Nếu
// đổ hết phần lệch vào một danh sách thì 4 dòng đáng sửa nằm lẫn giữa hàng chục dòng
// vô hại, và người đọc bỏ qua cả cụm.
//
// Thuần, không phụ thuộc React, để unit-test được.

import type { StatementLine } from './paypayStatement'
import { CARD_RECONCILE_NOTE } from './reconcile'

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
  | 'recalculated'
  | 'merged-rows'

export interface ReconcileResult {
  matchedCount: number
  extraInLedger: { tx: LedgerTx; amount: number }[]
  missingFromLedger: StatementLine[]
  /**
   * Chênh lệch CHỈ liên quan tới hoàn tiền: dòng `調整額` của nhà thẻ, và dòng hoàn
   * trong sổ, không khớp 1-1 được.
   *
   * Nhóm RIÊNG chứ không nhét vào `explained`: nhà thẻ GỘP nhiều khoản hoàn vào một
   * dòng điều chỉnh (−7.951 = −961 + −6.990) nên hai bên gần như không bao giờ khớp
   * từng dòng — nhưng một khoản hoàn người dùng QUÊN ghi cũng rơi vào đây, và giấu nó
   * đi là phản lại lý do tồn tại của cả màn này. Hiện ra, gắn nhãn, để người đọc lướt.
   */
  refundDiffs: { source: 'ledger' | 'statement'; label: string; iso: string; amount: number }[]
  explained: { cause: ExplainedCause; label: string; amount: number }[]
}

const MATCH_WINDOW_DAYS = 4
/**
 * `date-edge` = CÙNG một lần mua, hai bên ghi hai ngày. Không ép gần nhau về thời gian thì
 * luật này biến thành "khớp bừa theo số tiền ở kỳ bên cạnh", và một khoản chi ghi sai thật
 * sẽ bị nuốt vào nhóm bỏ qua. Ca thật đo được lệch 3 ngày.
 */
const EDGE_WINDOW_DAYS = 7
const dayGap = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000))

/**
 * Dấu của một dòng sổ theo cách repo ghi tiền: hoàn tiền là `expense` + `is_refund`,
 * KHÔNG phải `income` (xem `aggregate.ts: expenseSign`). Đọc nhầm chỗ này là mọi khoản
 * hoàn đảo dấu và không dòng nào ghép được.
 *
 * `income` trên một tài khoản THẺ cũng mang dấu âm ở đây, dù không phải hoàn tiền: nó
 * khớp cách `txBalanceDelta` (`lib/cardBalance.ts`) tính số dư — tiền `income` trên thẻ
 * CỘNG vào số dư, cùng chiều với hoàn tiền, ngược chiều với một khoản chi thật. Không có
 * gì cấm ghi `income` trên thẻ (`assertTxShape` chỉ ràng buộc transfer/category), nên bỏ
 * qua nhánh này là một khoản `income` bị ghép nhầm với một khoản CHI thật cùng số tiền —
 * `matchedCount` tăng sai, và khoản chi thật bị nuốt mất khỏi "Cần bạn xem".
 */
const signedAmount = (t: LedgerTx) => (t.type === 'income' || t.is_refund ? -t.amount : t.amount)

/**
 * Rổ sổ dùng để đối chiếu, loại đúng những gì `cardMonthCharge` loại — hai chỗ phải nói
 * cùng một kiểu, kẻo panel báo lệch mà bảng đối chiếu bảo khớp.
 */
const inScope = (t: LedgerTx, cardId: string) =>
  !(t.type === 'transfer' && t.to_account_id === cardId) && t.note !== CARD_RECONCILE_NOTE

const nfkc = (s: string) => s.normalize('NFKC')
const isTopUp = (l: StatementLine) => nfkc(l.name).trim() === 'チャージ'
const isRecalculated = (l: StatementLine) => nfkc(l.name).trim().endsWith('(再計算)')

/** Mọi tổ hợp kích cỡ `size` lấy từ `arr`, không lặp phần tử, không quan tâm thứ tự. */
function* combinations<T>(arr: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  for (let i = 0; i <= arr.length - size; i++) {
    for (const rest of combinations(arr.slice(i + 1), size - 1)) {
      yield [arr[i], ...rest]
    }
  }
}

/**
 * Rule 'merged-rows': sổ ghi GỘP một dòng, nhà thẻ TÁCH ra nhiều dòng cùng ngày —
 * cùng một khoản tiền, khác độ mịn. Vét cạn tổ hợp 2–4 (nhóm cùng ngày rất nhỏ, không
 * làm subset-sum tổng quát) trên các dòng CHƯA khớp, KHÔNG phải điều chỉnh. Chỉ làm
 * chiều này (sổ gộp, thẻ tách) — chiều ngược lại chưa thấy trong dữ liệu thật.
 */
function findMergedSubset(
  target: number,
  candidates: { l: StatementLine; used: boolean }[],
): { l: StatementLine; used: boolean }[] | null {
  const pool = candidates.filter((c) => !c.used && !c.l.isAdjustment)
  for (let size = 2; size <= Math.min(4, pool.length); size++) {
    for (const combo of combinations(pool, size)) {
      if (combo.reduce((sum, c) => sum + c.l.amount, 0) === target) return combo
    }
  }
  return null
}

/**
 * ĐIỀU KIỆN GỌI: `ledger` PHẢI đã lọc sẵn về đúng một thẻ (`cardId`) và đúng kỳ đang xét.
 * `LedgerTx` cố tình không mang `account_id`, nên `inScope` không tự lọc được — truyền vào
 * rổ nhiều tài khoản thì khoản "Điều chỉnh số nợ" của thẻ KHÁC cũng bị loại, và kết quả
 * lệch khỏi `cardMonthCharge`.
 */
export function reconcileStatement(
  lines: StatementLine[],
  ledger: LedgerTx[],
  cardId: string,
  neighbours: { lines: StatementLine[] }[],
): ReconcileResult {
  const stmt = lines.map((l) => ({ l, used: false }))
  const led = ledger
    .filter((t) => inScope(t, cardId))
    .map((t) => ({ t, amount: signedAmount(t), used: false }))

  // Vòng 1: ghép theo số tiền, ưu tiên lệch ngày ít nhất trong cửa sổ.
  for (const a of led) {
    let best: { s: (typeof stmt)[number]; gap: number } | null = null
    for (const s of stmt) {
      if (s.used || s.l.amount !== a.amount) continue
      const gap = dayGap(a.t.occurred_on, s.l.iso)
      if (gap > MATCH_WINDOW_DAYS) continue
      if (!best || gap < best.gap) best = { s, gap }
    }
    if (best) {
      best.s.used = true
      a.used = true
    }
  }
  // Vòng 2: bỏ giới hạn ngày, vẫn trong cùng kỳ. Sao kê hay dời ngày vài hôm.
  for (const a of led) {
    if (a.used) continue
    const s = stmt.find((s) => !s.used && s.l.amount === a.amount)
    if (s) {
      s.used = true
      a.used = true
    }
  }

  const matchedCount = stmt.filter((s) => s.used).length
  const explained: ReconcileResult['explained'] = []
  const extraInLedger: ReconcileResult['extraInLedger'] = []
  const missingFromLedger: StatementLine[] = []
  const refundDiffs: ReconcileResult['refundDiffs'] = []

  // Dòng của các kỳ LIỀN KỀ, để nhận ra hai nguyên nhân "lệch một kỳ". Đây là lý do
  // màn nạp cho chọn nhiều file cùng lúc: một file lẻ không đủ dữ kiện.
  const near = neighbours.flatMap((n) => n.lines.map((l) => ({ l, used: false })))

  for (const a of led) {
    if (a.used) continue
    // Hoàn tiền sổ ghi ở kỳ này, nhà thẻ cấn qua 調整額 ở kỳ liền kề.
    const adj = near.find((n) => !n.used && n.l.isAdjustment && n.l.amount === a.amount)
    if (adj) {
      adj.used = true
      explained.push({ cause: 'refund-shifted', label: `Hoàn tiền nhà thẻ cấn ở kỳ khác`, amount: a.amount })
      continue
    }
    // Cùng một lần mua, hai bên ghi hai ngày, rơi hai kỳ.
    const edge = near.find(
      (n) =>
        !n.used &&
        !n.l.isAdjustment &&
        n.l.amount === a.amount &&
        dayGap(a.t.occurred_on, n.l.iso) <= EDGE_WINDOW_DAYS,
    )
    if (edge) {
      edge.used = true
      explained.push({ cause: 'date-edge', label: `${edge.l.name} — thẻ ghi ${edge.l.iso}`, amount: a.amount })
      continue
    }
    // Sổ ghi gộp một dòng, nhà thẻ tách nhiều dòng CÙNG NGÀY — cùng tiền, khác độ mịn.
    const sameDay = stmt.filter((s) => s.l.iso === a.t.occurred_on)
    const merged = findMergedSubset(a.amount, sameDay)
    if (merged) {
      merged.forEach((m) => (m.used = true))
      explained.push({
        cause: 'merged-rows',
        label: `${merged.map((m) => m.l.name).join(' + ')} — sổ ghi gộp một dòng`,
        amount: a.amount,
      })
      continue
    }
    if (a.t.is_refund) {
      refundDiffs.push({ source: 'ledger', label: a.t.note ?? '', iso: a.t.occurred_on, amount: a.amount })
      continue
    }
    extraInLedger.push({ tx: a.t, amount: a.amount })
  }

  for (const s of stmt) {
    if (s.used) continue
    if (isTopUp(s.l)) {
      explained.push({ cause: 'wallet-topup', label: 'Nạp ví PayPay bằng thẻ', amount: s.l.amount })
      continue
    }
    if (isRecalculated(s.l)) {
      explained.push({ cause: 'recalculated', label: `${s.l.name} — nhà thẻ tính lại`, amount: s.l.amount })
      continue
    }
    if (s.l.isAdjustment) {
      refundDiffs.push({ source: 'statement', label: s.l.name, iso: s.l.iso, amount: s.l.amount })
      continue
    }
    missingFromLedger.push(s.l)
  }

  return { matchedCount, extraInLedger, missingFromLedger, refundDiffs, explained }
}
