// Quỹ chung hai người — phần THUẦN: ai góp bao nhiêu cho phần nào, quỹ đã chi bao nhiêu
// cho phần đó, phần đó còn dư hay thiếu. Không React, không I/O (xem purity.test.ts).
//
// Mô hình (người dùng chốt 2026-09-30, migration 0073):
//   · MỘT tài khoản là quỹ chung (`profiles.shared_fund_account_id`).
//   · Góp = chuyển khoản VÀO quỹ, mang `fund_part_id` (phần: một danh mục chi) và
//     `owner` (ai góp: 'partner' là người kia, còn lại là mình).
//   · Chi = khoản CHI từ quỹ; thuộc phần nào suy theo danh mục: chính nó hoặc tổ tiên
//     gần nhất là một phần ("Đi chợ" là con của "Ăn uống" → phần Ăn uống).
//   · Rút = chuyển khoản RA khỏi quỹ (vd chuyển phần dư sang tiết kiệm). Mang
//     `fund_part_id` thì trừ vào phần đó, không mang thì vào "Chưa gán phần".
//
// Mọi số là minor units theo tiền của quỹ. Góp từ tài khoản khác tiền thì lấy `to_amount`
// (số quỹ thật sự nhận), đúng như số dư tài khoản đọc nó.
//
// Vì sao "còn lại" tính LUỸ KẾ từ đầu chứ không riêng tháng: góp cố định thì tháng rẻ dư,
// tháng đắt thiếu, và đó là chủ ý — điện nước ga mùa đông ăn vào phần dư mùa thu. Nhìn
// riêng một tháng thì tháng 1 nào cũng "thiếu" và app sẽ giục tăng mức góp sai lúc.

import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { expenseSign } from '../reports/aggregate'

export type Contributor = 'mine' | 'partner'

export type FundTx = Pick<
  TransactionRow,
  | 'id'
  | 'type'
  | 'amount'
  | 'to_amount'
  | 'category_id'
  | 'account_id'
  | 'to_account_id'
  | 'occurred_on'
  | 'owner'
  | 'fund_part_id'
  | 'is_refund'
>

/** Kỳ [start, end) — luôn lấy từ getMonthRange. */
export interface FundRange {
  start: string
  end: string
}

export interface FundPartRow {
  /** null = "Chưa gán phần": góp không ghi phần, chi vào danh mục không phải phần nào. */
  partId: string | null
  /** Góp TRONG kỳ, theo người. */
  contributed: Record<Contributor, number>
  /** Chi trong kỳ (đã trừ hoàn tiền). */
  spent: number
  /** Rút ra khỏi quỹ trong kỳ. */
  withdrawn: number
  /** Thu khác vào quỹ trong kỳ (hoàn tiền về quỹ dưới dạng khoản thu, lãi…). */
  otherIn: number
  /** LUỸ KẾ tới hết kỳ: góp + thu khác − chi − rút. Âm = phần này đang thiếu. */
  balance: number
}

export interface FundSummary {
  parts: FundPartRow[]
  /** Tổng góp trong kỳ theo người. */
  contributed: Record<Contributor, number>
  spent: number
  /** Tổng luỹ kế — bằng số dư sổ của tài khoản quỹ trừ số dư đầu (initial_balance). */
  balance: number
}

const zero = (): Record<Contributor, number> => ({ mine: 0, partner: 0 })

export function contributorOf(t: Pick<TransactionRow, 'owner'>): Contributor {
  return t.owner === 'partner' ? 'partner' : 'mine'
}

/** true = chuyển khoản này là một khoản GÓP vào quỹ. */
export function isContribution(t: Pick<FundTx, 'type' | 'account_id' | 'to_account_id'>, fundId: string): boolean {
  return t.type === 'transfer' && t.to_account_id === fundId && t.account_id !== fundId
}

/**
 * Tập các phần: mọi danh mục từng được góp cho. Không có bảng "phần" riêng — phần là
 * danh mục chi mà người dùng đã chọn khi góp. Nhờ vậy đổi tên / lưu trữ danh mục là đổi
 * luôn phần, không có hai danh sách phải giữ khớp nhau.
 */
export function fundPartIds(txs: readonly FundTx[], fundId: string): Set<string> {
  const out = new Set<string>()
  for (const t of txs) if (t.fund_part_id && t.type === 'transfer' && (t.to_account_id === fundId || t.account_id === fundId)) out.add(t.fund_part_id)
  return out
}

/** Danh mục → phần: chính nó, hoặc tổ tiên gần nhất là phần; không có thì null. */
export function partOfCategory(
  categoryId: string | null,
  parts: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string | null>,
): string | null {
  let cur = categoryId
  // Chặn vòng lặp nếu dữ liệu lỗi tự trỏ về nhau.
  for (let i = 0; cur && i < 16; i++) {
    if (parts.has(cur)) return cur
    cur = parentOf.get(cur) ?? null
  }
  return null
}

export function summarizeFund(
  txs: readonly FundTx[],
  fundId: string,
  range: FundRange,
  categories: readonly Pick<CategoryRow, 'id' | 'parent_id'>[],
): FundSummary {
  const parts = fundPartIds(txs, fundId)
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]))
  const rows = new Map<string | null, FundPartRow>()
  const row = (partId: string | null) => {
    let r = rows.get(partId)
    if (!r) {
      r = { partId, contributed: zero(), spent: 0, withdrawn: 0, otherIn: 0, balance: 0 }
      rows.set(partId, r)
    }
    return r
  }

  for (const t of txs) {
    if (t.occurred_on >= range.end) continue
    const inRange = t.occurred_on >= range.start
    if (isContribution(t, fundId)) {
      const v = t.to_amount ?? t.amount
      const r = row(t.fund_part_id ?? null)
      r.balance += v
      if (inRange) r.contributed[contributorOf(t)] += v
    } else if (t.account_id !== fundId) {
      continue
    } else if (t.type === 'transfer') {
      if (t.to_account_id === fundId) continue
      const r = row(t.fund_part_id ?? null)
      r.balance -= t.amount
      if (inRange) r.withdrawn += t.amount
    } else if (t.type === 'expense') {
      const v = t.amount * expenseSign(t)
      const r = row(partOfCategory(t.category_id, parts, parentOf))
      r.balance -= v
      if (inRange) r.spent += v
    } else {
      const r = row(null)
      r.balance += t.amount
      if (inRange) r.otherIn += t.amount
    }
  }

  // Phần có tên xếp theo tiền góp trong kỳ (lớn trước), "Chưa gán phần" luôn cuối, và chỉ
  // hiện khi có số — một dòng toàn 0 chỉ làm người đọc tìm xem có gì sai.
  const named = [...rows.values()].filter((r) => r.partId !== null)
  named.sort((a, b) => total(b.contributed) - total(a.contributed) || b.spent - a.spent)
  const un = rows.get(null)
  const hasUn = un && (total(un.contributed) || un.spent || un.withdrawn || un.otherIn || un.balance)
  const list = hasUn ? [...named, un] : named

  const contributed = zero()
  let spent = 0
  let balance = 0
  for (const r of list) {
    contributed.mine += r.contributed.mine
    contributed.partner += r.contributed.partner
    spent += r.spent
    balance += r.balance
  }
  return { parts: list, contributed, spent, balance }
}

export function total(c: Record<Contributor, number>): number {
  return c.mine + c.partner
}

/**
 * Phần trăm góp của mình trong kỳ, số nguyên 0..100; không ai góp → null.
 * Của người kia là `100 − x`: làm tròn một bên rồi lấy phần bù để hai số luôn cộng
 * đủ 100, không bao giờ ra "33% + 66%".
 */
export function mineSharePct(c: Record<Contributor, number>): number | null {
  const t = total(c)
  if (t <= 0) return null
  return Math.round((c.mine * 100) / t)
}

export type FundAlertKind = 'negative' | 'short-streak' | 'surplus-streak'

export interface FundAlert {
  partId: string
  kind: FundAlertKind
  /** Số dư luỹ kế hiện tại của phần. */
  balance: number
}

/** Số tháng liền lệch cùng chiều thì mới nhắc chỉnh mức góp (đã chốt với người dùng). */
export const STREAK_MONTHS = 3

/**
 * Lời nhắc chỉnh mức góp, từ bản tóm tắt của N tháng ĐÃ XONG gần nhất (cũ → mới).
 *
 *   negative        — phần đang âm luỹ kế: quỹ đang lấy tiền phần khác bù. Nói ngay.
 *   short-streak    — 3 tháng liền chi > góp: mức góp thấp hơn nhịp chi thật.
 *   surplus-streak  — 3 tháng liền góp > chi VÀ dư luỹ kế đã vượt một tháng góp: tiền đang
 *                     nằm chết trong quỹ, có thể giảm mức góp hoặc chuyển sang tiết kiệm.
 *
 * Chỉ tháng ĐÃ XONG: tháng đang chạy mới qua vài ngày thì phần nào cũng "góp > chi" (góp
 * đầu tháng, chi rải rác) — nhắc theo nó là nhắc sai mỗi đầu tháng.
 */
export function fundAlerts(months: readonly FundSummary[]): FundAlert[] {
  const last = months[months.length - 1]
  if (!last) return []
  const out: FundAlert[] = []
  for (const p of last.parts) {
    if (p.partId === null) continue
    if (p.balance < 0) {
      out.push({ partId: p.partId, kind: 'negative', balance: p.balance })
      continue
    }
    if (months.length < STREAK_MONTHS) continue
    const recent = months.slice(-STREAK_MONTHS).map((m) => m.parts.find((x) => x.partId === p.partId))
    if (recent.some((r) => !r)) continue
    const nets = recent.map((r) => total(r!.contributed) - r!.spent - r!.withdrawn)
    if (nets.every((n) => n < 0)) out.push({ partId: p.partId, kind: 'short-streak', balance: p.balance })
    else if (nets.every((n) => n > 0) && p.balance > total(p.contributed))
      out.push({ partId: p.partId, kind: 'surplus-streak', balance: p.balance })
  }
  return out
}

/**
 * Lời nhắc của quỹ ở một thời điểm — MỘT hàm cho cả màn Quỹ chung, chuông/Bản tin và push
 * phía server (serverBundle.ts), để ba chỗ không bao giờ nói ba câu khác nhau.
 *
 *   current   — kỳ đang xem/đang chạy: phần nào âm LUỸ KẾ tới hết kỳ này thì nói ngay.
 *   doneMonths — STREAK_MONTHS tháng ĐÃ XONG gần nhất (cũ → mới), cho hai lời nhắc chuỗi.
 *
 * Một phần chỉ có một lời nhắc: đang âm thì câu "âm" đã bao câu "thiếu 3 tháng".
 */
export function fundAlertsFor(
  txs: readonly FundTx[],
  fundId: string,
  categories: readonly Pick<CategoryRow, 'id' | 'parent_id'>[],
  current: FundRange,
  doneMonths: readonly FundRange[],
): FundAlert[] {
  const now = summarizeFund(txs, fundId, current, categories)
  const negatives: FundAlert[] = now.parts
    .filter((p) => p.partId !== null && p.balance < 0)
    .map((p) => ({ partId: p.partId!, kind: 'negative', balance: p.balance }))
  const seen = new Set(negatives.map((a) => a.partId))
  const streaks = fundAlerts(doneMonths.map((r) => summarizeFund(txs, fundId, r, categories))).filter(
    (a) => a.kind !== 'negative' && !seen.has(a.partId),
  )
  return [...negatives, ...streaks]
}
