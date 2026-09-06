// Dò phí lặp hằng tháng CHƯA thành lệnh định kỳ — THUẦN, có test.
//
// Bài học giáo trình đã đối chiếu (09/2026, C4/C22): phí định kỳ nhỏ là loại chi vô hình
// nhất — mỗi lần nhìn thấy nó đều "có đáng bao nhiêu đâu", nhưng nó chảy 12 lần một năm
// và 120 lần một thập kỷ. App dò CHUỖI chi lặp cùng danh mục + cùng số tiền + nhịp ~tháng
// trong sổ, rồi quy ra con số năm/10 năm để phần vô hình hiện nguyên hình.
//
// Chỉ dò khoản KHÔNG có `recurring_rule_id`: khoản đã khai lệnh định kỳ thì người dùng
// biết rồi (nó nằm trong cam kết tháng); thứ đáng chỉ ra là khoản lặp mà CHƯA AI KHAI.
//
// Quy đổi: convertToBase; nhóm thiếu tỷ giá bị LOẠI và bật cờ approx — không quy 1:1.
import { addDaysISO } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'

/** Phải thấy ít nhất chừng này lần mới gọi là chuỗi. */
export const FEE_MIN_HITS = 3
/** Trung vị khoảng cách giữa hai lần phải nằm trong nhịp tháng. */
export const FEE_GAP_MIN_DAYS = 25
export const FEE_GAP_MAX_DAYS = 36
/** Cho phép hụt MỘT kỳ (gap ~2 tháng) nhưng không hơn. */
export const FEE_GAP_HARD_MAX_DAYS = 75
/** Lần cuối phải trong vòng chừng này ngày — chuỗi đã dứt thì không nhắc nữa. */
export const FEE_STALE_DAYS = 45

export interface RecurringFeeItem {
  categoryId: string | null
  /** Ghi chú hay gặp nhất trong chuỗi (đã trim); rỗng cả chuỗi → null, UI dùng tên danh mục. */
  note: string | null
  /** minor, base — số tiền MỖI kỳ đã quy đổi. */
  perMonthMinor: number
  hits: number
  lastOn: string
}

export interface RecurringFeesResult {
  /** Xếp theo tiền/tháng giảm dần. */
  items: RecurringFeeItem[]
  totalPerMonthMinor: number
  /** Có chuỗi bị loại vì thiếu tỷ giá. */
  approx: boolean
}

interface Args {
  txs: TransactionRow[]
  currencyOf: (accountId: string) => CurrencyCode
  base: CurrencyCode
  rates: Rates
  todayISO: string
  /** Danh mục kind='transfer' (Gửi tiền về VN…) — tiền vẫn của mình, không phải phí. */
  transferIds: ReadonlySet<string>
}

function median(sorted: number[]): number {
  const n = sorted.length
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

/** null = không có chuỗi nào bày được (không tìm thấy, hoặc mọi chuỗi đều thiếu tỷ giá). */
export function detectRecurringFees(args: Args): RecurringFeesResult | null {
  const { txs, currencyOf, base, rates, todayISO, transferIds } = args

  // Gom theo (danh mục, đồng tiền tài khoản, số tiền ĐÚNG BẰNG NHAU). Subscription trừ
  // cùng một số tiền mỗi kỳ; sai một yên là thứ khác. Ghi chú KHÔNG vào khoá: cùng một
  // phí có tháng ghi chú có tháng bỏ trống.
  const groups = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    if (t.type !== 'expense' || t.amount <= 0) continue
    if (t.recurring_rule_id !== null) continue
    if (t.is_debt_flow || t.exclude_from_stats || t.is_refund) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    const key = `${t.category_id ?? ''}|${currencyOf(t.account_id)}|${t.amount}`
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  const items: RecurringFeeItem[] = []
  let approx = false
  const staleCutoff = addDaysISO(todayISO, -FEE_STALE_DAYS)

  for (const list of groups.values()) {
    // Ngày DUY NHẤT: hai khoản cùng ngày cùng tiền (mua hai lần một hôm) không phải nhịp.
    const dates = [...new Set(list.map((t) => t.occurred_on))].sort()
    if (dates.length < FEE_MIN_HITS) continue

    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) {
      gaps.push(
        Math.round(
          (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) /
            86_400_000,
        ),
      )
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const med = median(sortedGaps)
    if (med < FEE_GAP_MIN_DAYS || med > FEE_GAP_MAX_DAYS) continue
    // Một kỳ hụt thì tha; đứt dài hơn là hai đợt khác nhau, không phải một chuỗi.
    if (sortedGaps[sortedGaps.length - 1] > FEE_GAP_HARD_MAX_DAYS) continue
    const lastOn = dates[dates.length - 1]
    if (lastOn < staleCutoff) continue

    const sample = list[0]
    const v = convertToBase(sample.amount, currencyOf(sample.account_id), base, rates)
    if (v === null) {
      approx = true
      continue
    }

    // Ghi chú hay gặp nhất (bỏ chuỗi rỗng) — để UI gọi được tên "Netflix" thay vì chỉ
    // tên danh mục.
    const dem = new Map<string, number>()
    for (const t of list) {
      const n = t.note.trim()
      if (n !== '') dem.set(n, (dem.get(n) ?? 0) + 1)
    }
    let note: string | null = null
    let best = 0
    for (const [n, c] of dem) {
      if (c > best) {
        note = n
        best = c
      }
    }

    items.push({ categoryId: sample.category_id, note, perMonthMinor: v, hits: dates.length, lastOn })
  }

  if (items.length === 0) return null
  items.sort((a, b) => b.perMonthMinor - a.perMonthMinor)
  return {
    items,
    totalPerMonthMinor: items.reduce((s, i) => s + i.perMonthMinor, 0),
    approx,
  }
}
