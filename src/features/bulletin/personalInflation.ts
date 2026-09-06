// Lạm phát CÁ NHÂN — THUẦN, có test. Bài học giáo trình đã đối chiếu (09/2026, C1/C10):
// con số lạm phát trên báo đo một giỏ hàng trung bình không ai mua; thứ chạm vào ví là
// giỏ hàng CỦA CHÍNH MÌNH đắt lên bao nhiêu giữa hai năm, và nhóm nào kéo mạnh nhất.
//
// So CÙNG THÁNG năm nay với năm ngoái (06/2026 vs 06/2025…), chỉ những tháng CẢ HAI năm
// đều có ghi chép — sổ mới hơn hai năm thì phần thiếu không được đoán bù. Cần tối thiểu
// INFL_MIN_PAIRS cặp; ít hơn thì im lặng thay vì kết luận từ một tháng lẻ.
//
// Quy đổi: convertToBase; khoản thiếu tỷ giá bị LOẠI + cờ approx — không quy 1:1.
import { addMonths, getMonthRange, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { completedMonthKeys } from './drift'

/** Ít nhất chừng này cặp tháng (cả hai năm đều có sổ) mới so. */
export const INFL_MIN_PAIRS = 3
/** |%| phải vượt mức này panel mới lên tiếng — đắt lên 1-2% là nhiễu, không phải tin. */
export const INFL_SPEAK_PCT = 5
/** Danh mục phải chiếm ít nhất chừng này phần chi năm ngoái mới được nêu tên (bps). */
export const INFL_CAT_MIN_SHARE_BPS = 500

export interface PersonalInflationResult {
  /** % giỏ chi đắt lên giữa hai năm (âm = rẻ đi). */
  pct: number
  /** Các tháng năm-nay được so, cũ → mới. */
  pairKeys: MonthKey[]
  /** Danh mục tăng nhanh nhất trong các danh mục đủ lớn; null = không nhóm nào đủ lớn. */
  topCategory: { categoryId: string | null; pct: number } | null
  approx: boolean
  curMinor: number
  priorMinor: number
}

interface Args {
  txs: TransactionRow[]
  currencyOf: (accountId: string) => CurrencyCode
  base: CurrencyCode
  rates: Rates
  todayISO: string
  monthStartDay: number
  transferIds: ReadonlySet<string>
}

export function personalInflation(args: Args): PersonalInflationResult | null {
  const { txs, currencyOf, base, rates, todayISO, monthStartDay, transferIds } = args

  // 12 tháng hoàn tất gần nhất, mỗi tháng ghép với chính nó năm ngoái.
  const keys = completedMonthKeys(todayISO, monthStartDay, 12)
  const window = keys.map((k) => ({
    cur: getMonthRange(k, monthStartDay),
    prior: getMonthRange(addMonths(k, -12), monthStartDay),
    key: k,
  }))

  // Một lượt qua sổ: chi từng-khoảng, cộng theo (khoảng, danh mục).
  let approx = false
  const sumOf = new Map<string, number>() // `${i}|cur|catId` / `${i}|prior|catId`
  const coData = new Set<string>() // `${i}|cur` / `${i}|prior` — tháng có ghi chép
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    for (let i = 0; i < window.length; i++) {
      const w = window[i]
      const side =
        t.occurred_on >= w.cur.start && t.occurred_on < w.cur.end
          ? 'cur'
          : t.occurred_on >= w.prior.start && t.occurred_on < w.prior.end
            ? 'prior'
            : null
      if (side === null) continue
      coData.add(`${i}|${side}`)
      const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
      if (v === null) {
        approx = true
        break
      }
      const key = `${i}|${side}|${t.category_id ?? ''}`
      sumOf.set(key, (sumOf.get(key) ?? 0) + v)
      break // mỗi khoản thuộc đúng một tháng — khỏi quét nốt các khoảng còn lại
    }
  }

  // Cặp giữ được: cả hai năm đều CÓ GHI CHÉP tháng đó (kể cả khi tổng quy đổi về 0).
  const pairIdx = window
    .map((_, i) => i)
    .filter((i) => coData.has(`${i}|cur`) && coData.has(`${i}|prior`))
  if (pairIdx.length < INFL_MIN_PAIRS) return null

  let curMinor = 0
  let priorMinor = 0
  const byCat = new Map<string, { cur: number; prior: number }>()
  for (const [key, v] of sumOf) {
    const [iStr, side, catId] = key.split('|')
    const i = Number(iStr)
    if (!pairIdx.includes(i)) continue
    if (side === 'cur') curMinor += v
    else priorMinor += v
    const c = byCat.get(catId) ?? { cur: 0, prior: 0 }
    if (side === 'cur') c.cur += v
    else c.prior += v
    byCat.set(catId, c)
  }
  if (priorMinor <= 0) return null

  const nguongCat = (priorMinor * INFL_CAT_MIN_SHARE_BPS) / 10_000
  let topCategory: PersonalInflationResult['topCategory'] = null
  for (const [catId, c] of byCat) {
    if (c.prior < nguongCat) continue
    const p = ((c.cur - c.prior) / c.prior) * 100
    if (topCategory === null || p > topCategory.pct)
      topCategory = { categoryId: catId === '' ? null : catId, pct: p }
  }

  return {
    pct: ((curMinor - priorMinor) / priorMinor) * 100,
    pairKeys: pairIdx.map((i) => window[i].key).reverse(),
    topCategory,
    approx,
    curMinor,
    priorMinor,
  }
}
