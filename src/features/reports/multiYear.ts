// Báo cáo NHIỀU NĂM: gộp chuỗi tháng thành từng năm, và tách "mùa vụ" (tháng nào trong
// năm thường tốn hơn). Hàm thuần — không đụng repo, không format tiền.
//
// Chỉ làm được từ khi sổ có lịch sử dài (nạp 9 năm từ Zaim). Trước đó tab Xu hướng đã có
// rolling 3 tháng và cùng kỳ năm trước, nhưng không ai trả lời được "9 năm qua tiền đi đâu".

import { monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'
import type { TransactionRow } from '../../types/database.types'

/**
 * Các tháng tài chính CÓ giao dịch, sắp tăng dần.
 *
 * Không tự sinh dải "từ tháng 1 năm đầu đến tháng 12 năm cuối": làm vậy thì những tháng
 * chưa từng ghi sổ cũng thành điểm 0đ, và bảng theo năm hiện "12 tháng" cho cả năm mới ghi
 * hai tháng. Tôn trọng `month_start_day` qua `monthKeyForDate` như mọi truy vấn tháng khác.
 */
export function monthKeysOf(txs: readonly TransactionRow[], monthStartDay: number): MonthKey[] {
  const seen = new Map<string, MonthKey>()
  for (const t of txs) {
    const k = monthKeyForDate(t.occurred_on, monthStartDay)
    seen.set(`${k.year}-${k.month}`, k)
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || a.month - b.month)
}

/** Một dòng của bảng theo năm. */
export interface YearRow {
  year: number
  income: number
  expense: number
  /** thu − chi */
  net: number
  /** Tỷ lệ tiết kiệm (basis point, 5000 = 50%). `null` khi thu = 0 — không có gì để chia. */
  savingsRateBps: number | null
  /** Số tháng CÓ dữ liệu, để thấy năm nào chỉ ghi một phần (2017 bắt đầu từ tháng 11…). */
  months: number
}

/** Khoảng năm có dữ liệu. `null` khi sổ trống — không đoán khoảng. */
export function yearSpan(dates: readonly string[]): { from: number; to: number } | null {
  let from = Infinity
  let to = -Infinity
  for (const d of dates) {
    const y = Number(String(d).slice(0, 4))
    if (!Number.isFinite(y)) continue
    if (y < from) from = y
    if (y > to) to = y
  }
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null
}

/** Gộp chuỗi tháng thành bảng theo năm, sắp tăng dần. */
export function yearlyTotals(series: MonthlySeries): YearRow[] {
  const acc = new Map<number, YearRow>()
  for (const p of series.points) {
    const row =
      acc.get(p.key.year) ??
      ({ year: p.key.year, income: 0, expense: 0, net: 0, savingsRateBps: null, months: 0 } as YearRow)
    row.income += p.income
    row.expense += p.expense
    // Tháng rỗng không phải "tháng có dữ liệu": nếu đếm cả thì năm nào cũng 12 tháng và
    // cột "số tháng" mất hết ý nghĩa cảnh báo.
    if (p.income !== 0 || p.expense !== 0) row.months++
    acc.set(p.key.year, row)
  }
  const rows = [...acc.values()].sort((a, b) => a.year - b.year)
  for (const r of rows) {
    r.net = r.income - r.expense
    r.savingsRateBps = r.income > 0 ? Math.round((r.net / r.income) * 10_000) : null
  }
  return rows
}

/**
 * Cửa sổ trượt 12 tháng, để đặt CẠNH các cột năm.
 *
 * Vì sao cần: năm đang chạy luôn thấp giả (tháng 8 thì cột 2026 chỉ có 8 tháng) nên đặt
 * nó cạnh 2025 đủ 12 tháng là so sai — mắt đọc thành "năm nay tiêu ít hơn". Cột 12T là
 * con số DUY NHẤT trong biểu đồ đó so được trực tiếp với một năm đầy.
 */
export interface TrailingRow {
  income: number
  expense: number
  net: number
  savingsRateBps: number | null
  /** Số tháng CÓ dữ liệu trong cửa sổ (≤ 12) — cửa sổ luôn rộng 12 tháng lịch. */
  months: number
  /** Tháng đầu và tháng cuối của cửa sổ, để nói ra "12 tháng tới hết tháng 7/2026". */
  from: MonthKey
  to: MonthKey
}

const idx = (k: MonthKey) => k.year * 12 + k.month

/**
 * 12 tháng ĐÃ HOÀN TẤT gần nhất, tính lùi từ `currentKey` (tháng đang chạy dở) — tháng
 * đó và mọi tháng sau nó đều bị loại, cùng quy ước với `completedPoints` ở verdicts.ts.
 *
 * Không có tháng nào có dữ liệu trong cửa sổ → null (đừng vẽ cột 0đ).
 */
export function trailingTwelveMonths(
  series: MonthlySeries,
  currentKey: MonthKey,
): TrailingRow | null {
  const end = idx(currentKey) - 1 // tháng hoàn tất gần nhất
  const start = end - 11
  let income = 0
  let expense = 0
  let months = 0
  for (const p of series.points) {
    const i = idx(p.key)
    if (i < start || i > end) continue
    income += p.income
    expense += p.expense
    if (p.income !== 0 || p.expense !== 0) months++
  }
  if (months === 0) return null
  const net = income - expense
  const toMonth = ((end - 1) % 12) + 1
  const fromMonth = ((start - 1) % 12) + 1
  return {
    income,
    expense,
    net,
    savingsRateBps: income > 0 ? Math.round((net / income) * 10_000) : null,
    months,
    from: { year: Math.floor((start - 1) / 12), month: fromMonth },
    to: { year: Math.floor((end - 1) / 12), month: toMonth },
  }
}

/** Một tháng trong lịch (1–12) của biểu đồ mùa vụ. */
export interface SeasonMonth {
  month: number
  /** Chỉ số so với tháng trung bình: 100 = đúng mức trung bình, 140 = tốn hơn 40%. */
  indexPct: number
  /** Số năm góp vào con số này. */
  years: number
}

export interface Seasonality {
  months: SeasonMonth[]
  /** Các năm được dùng (chỉ năm đủ 12 tháng và có chi > 0). */
  yearsUsed: number[]
  peak: SeasonMonth | null
  trough: SeasonMonth | null
  /** Vì sao không tính được (khi `months` rỗng). */
  reason: string | null
}

/**
 * Mùa vụ chi tiêu: tháng nào trong năm thường tốn hơn mức trung bình.
 *
 * Tính bằng **tỷ trọng trong năm** rồi mới lấy trung bình các năm, chứ không lấy trung bình
 * số tiền: mức chi năm 2019 và 2025 khác nhau xa (lương tăng, lạm phát, đổi chỗ ở), lấy
 * trung bình tiền thô thì năm gần đây lấn hết và "mùa vụ" biến thành "xu hướng".
 *
 * Chỉ dùng **năm đủ 12 tháng**: năm ghi một phần (2017 từ tháng 11, năm đang chạy) làm tỷ
 * trọng vô nghĩa. Không đủ dữ liệu thì trả rỗng kèm lý do — không đoán.
 */
export function seasonality(series: MonthlySeries): Seasonality {
  const byYear = new Map<number, Map<number, number>>()
  for (const p of series.points) {
    if (!byYear.has(p.key.year)) byYear.set(p.key.year, new Map())
    byYear.get(p.key.year)!.set(p.key.month, p.expense)
  }

  const shares = new Map<number, number[]>() // tháng -> tỷ trọng của từng năm
  const yearsUsed: number[] = []
  for (const [year, months] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    if (months.size < 12) continue
    const total = [...months.values()].reduce((a, b) => a + b, 0)
    if (total <= 0) continue
    yearsUsed.push(year)
    for (const [m, v] of months) {
      if (!shares.has(m)) shares.set(m, [])
      shares.get(m)!.push(v / total)
    }
  }

  if (yearsUsed.length === 0)
    return {
      months: [],
      yearsUsed: [],
      peak: null,
      trough: null,
      reason: 'Chưa có năm nào đủ 12 tháng dữ liệu (và có chi tiêu) để so mùa vụ.',
    }

  const months: SeasonMonth[] = []
  for (let m = 1; m <= 12; m++) {
    const list = shares.get(m) ?? []
    if (list.length === 0) continue
    const avgShare = list.reduce((a, b) => a + b, 0) / list.length
    // Tỷ trọng trung bình của một tháng là 1/12 -> nhân 12 để 100 = đúng mức trung bình.
    months.push({ month: m, indexPct: avgShare * 12 * 100, years: list.length })
  }

  const sorted = [...months].sort((a, b) => b.indexPct - a.indexPct)
  return {
    months,
    yearsUsed,
    peak: sorted[0] ?? null,
    trough: sorted[sorted.length - 1] ?? null,
    reason: null,
  }
}

const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`

/**
 * Vài câu kết luận bằng tiếng Việt đời thường. Dưới 2 năm thì không nói gì — so sánh một
 * năm với chính nó là câu vô nghĩa, thà im.
 */
export function multiYearInsights(rows: readonly YearRow[]): string[] {
  if (rows.length < 2) return []
  const lines: string[] = []

  const spendYears = rows.filter((r) => r.expense > 0)
  if (spendYears.length >= 2) {
    const top = spendYears.reduce((a, b) => (b.expense > a.expense ? b : a))
    lines.push(`Năm chi nhiều nhất là ${top.year}.`)
  }

  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  if (prev.expense > 0 && last.expense > 0) {
    const delta = ((last.expense - prev.expense) / prev.expense) * 100
    const huong = delta >= 0 ? 'tăng' : 'giảm'
    const dangDo = last.months < 12 ? ` (${last.year} mới có ${last.months} tháng dữ liệu)` : ''
    lines.push(`Chi năm ${last.year} ${huong} ${pct(delta)} so với ${prev.year}${dangDo}.`)
  }

  const withRate = rows.filter((r) => r.savingsRateBps !== null && r.months === 12)
  if (withRate.length >= 2) {
    const best = withRate.reduce((a, b) => (b.savingsRateBps! > a.savingsRateBps! ? b : a))
    lines.push(
      `Tiết kiệm tốt nhất là năm ${best.year}: giữ được ${(best.savingsRateBps! / 100).toFixed(0)}% thu nhập.`,
    )
  }

  return lines
}
