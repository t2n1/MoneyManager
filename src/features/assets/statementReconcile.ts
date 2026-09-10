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

export type ExplainedCause = 'refund-shifted' | 'wallet-topup' | 'date-edge' | 'recalculated'

export interface ReconcileResult {
  matchedCount: number
  extraInLedger: { tx: LedgerTx; amount: number }[]
  missingFromLedger: StatementLine[]
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
 */
const signedAmount = (t: LedgerTx) => (t.is_refund ? -t.amount : t.amount)

/**
 * Rổ sổ dùng để đối chiếu, loại đúng những gì `cardMonthCharge` loại — hai chỗ phải nói
 * cùng một kiểu, kẻo panel báo lệch mà bảng đối chiếu bảo khớp.
 */
const inScope = (t: LedgerTx, cardId: string) =>
  !(t.type === 'transfer' && t.to_account_id === cardId) && t.note !== CARD_RECONCILE_NOTE

const nfkc = (s: string) => s.normalize('NFKC')
const isTopUp = (l: StatementLine) => nfkc(l.name).trim() === 'チャージ'
const isRecalculated = (l: StatementLine) => nfkc(l.name).trim().endsWith('(再計算)')

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
    missingFromLedger.push(s.l)
  }

  return { matchedCount, extraInLedger, missingFromLedger, explained }
}
