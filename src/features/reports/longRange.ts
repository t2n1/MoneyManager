// Phép tính cho tab "Dài hạn" bản 27a — thuần, không phụ thuộc React, unit-test được.
//
// VÌ SAO CÓ FILE NÀY
// Bản trước bày BA khoảng thời gian cùng lúc trên một màn: công tắc ghi "12T", dải điều
// hướng ghi "Năm 2026", biểu đồ vẽ 24 tháng. Và hai trong ba nút công tắc ("3N", "Tất cả")
// render y hệt nhau, vì app chỉ có 24 tháng dữ liệu — còn y hệt nhau tới 08/2027.
//
// 27a chốt: công tắc SUY TỪ DỮ LIỆU THẬT, không hardcode ba nhãn. Chỗ neo của cả tab là
// điểm ĐỔI NẾP (change point) và MỨC NỀN kể từ đó — hai con số này thay hai thẻ chữ riêng
// của bản cũ và được vẽ thẳng lên biểu đồ.

import { addMonths, monthKeyForDate, type MonthKey } from '../../lib/dates'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CurrencyCode } from '../../lib/money'
import { detectChangePoints } from './trends'

/** Một điểm của chuỗi tháng mà file này cần — cố ý hẹp hơn `MonthlyPoint`. */
export interface RangePoint {
  key: MonthKey
  income: number
  expense: number
}

// ---------------------------------------------------------------------------------
// Công tắc phạm vi — suy từ dữ liệu
// ---------------------------------------------------------------------------------

export type LongScopeKey = '12m' | 'regime' | 'all'

export interface LongScopeOption {
  key: LongScopeKey
  label: string
  /** Số tháng cuối chuỗi mà mốc này lấy. */
  months: number
}

/**
 * Mốc thứ ba ("Tất cả") chỉ đáng có khi dữ liệu vượt ngưỡng này. Dưới ngưỡng, "3 năm" và
 * "Tất cả" trả về đúng cùng một tập tháng, và hai nút giống nhau thì tệ hơn một nút: người
 * dùng bấm thử, thấy không đổi gì, rồi mất tin vào cả dải công tắc.
 */
export const ALL_SCOPE_MIN_MONTHS = 36

/**
 * Các mốc phạm vi có nghĩa với chuỗi này.
 *
 * `regimeIndex` = chỉ số điểm đổi nếp trong `points` (null = không có cú đổi nào). Mốc
 * "Từ khi đổi nếp" chỉ hiện khi đoạn sau cú đổi ĐỦ DÀI để nói được gì và KHÁC hẳn 12 tháng
 * — nếu cú đổi xảy ra 12 tháng trước thì hai mốc trùng nhau và ta lại có hai nút giống nhau.
 */
export function longScopeOptions(
  points: readonly RangePoint[],
  regimeIndex: number | null,
): LongScopeOption[] {
  const total = points.length
  const out: LongScopeOption[] = [
    { key: '12m', label: '12 tháng', months: Math.min(12, total) },
  ]

  if (regimeIndex !== null) {
    const monthsSince = total - regimeIndex
    if (monthsSince >= 6 && Math.abs(monthsSince - 12) >= 3) {
      const k = points[regimeIndex].key
      out.push({
        key: 'regime',
        label: `Từ khi đổi nếp · ${k.year}/${String(k.month).padStart(2, '0')}`,
        months: monthsSince,
      })
    }
  }

  if (total > ALL_SCOPE_MIN_MONTHS) {
    out.push({ key: 'all', label: 'Tất cả', months: total })
  }
  return out
}

// ---------------------------------------------------------------------------------
// Điểm đổi nếp + mức nền
// ---------------------------------------------------------------------------------

export interface Regime {
  /** Chỉ số tháng ĐẦU TIÊN của nếp mới trong `points`. */
  index: number
  key: MonthKey
  /** Mức chi trung bình của nếp cũ / nếp mới (từ detectChangePoints). */
  before: number
  after: number
  /** % đổi; âm = nếp mới rẻ hơn. null khi nếp cũ = 0. */
  changePct: number | null
  /** TRUNG VỊ chi của nếp mới — "mức nền". Xem lý do dùng trung vị ở `baselineLevel`. */
  baseline: number
  /** Số tháng đã sống với nếp mới. */
  monthsSince: number
}

/**
 * TRUNG VỊ, không phải trung bình.
 *
 * Mức nền là câu trả lời cho "tháng bình thường tốn bao nhiêu". Trung bình bị một chuyến đi
 * ¥400k kéo lên và rồi mọi tháng bình thường đều nằm DƯỚI "mức nền" — một mốc mà phần lớn
 * dữ liệu nằm dưới thì không phải mốc.
 */
export function baselineLevel(values: readonly number[]): number {
  if (values.length === 0) return 0
  const xs = [...values].sort((a, b) => a - b)
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2)
}

/**
 * Cú đổi nếp GẦN NHẤT và mức nền kể từ đó.
 *
 * Lấy cú GẦN NHẤT chứ không phải cú mạnh nhất: nếp đang sống mới là nếp cần một mức nền.
 * Cần ≥ 8 tháng (cùng ngưỡng `detectChangePoints` dùng ở bản cũ) và đoạn sau ≥ 3 tháng.
 */
export function findRegime(points: readonly RangePoint[]): Regime | null {
  if (points.length < 8) return null
  const expenses = points.map((p) => p.expense)
  const cps = detectChangePoints(expenses)
  if (cps.length === 0) return null
  const cp = cps[cps.length - 1]
  const monthsSince = points.length - cp.index
  if (monthsSince < 3) return null
  return {
    index: cp.index,
    key: points[cp.index].key,
    before: cp.before,
    after: cp.after,
    changePct: cp.before > 0 ? ((cp.after - cp.before) / cp.before) * 100 : null,
    baseline: baselineLevel(expenses.slice(cp.index)),
    monthsSince,
  }
}

// ---------------------------------------------------------------------------------
// Bảng theo tháng: chi · cùng tháng năm ngoái · so mức nền
// ---------------------------------------------------------------------------------

export interface LongTableRow {
  key: MonthKey
  expense: number
  /** Chi CÙNG THÁNG năm trước; null = không có dữ liệu năm ngoái. */
  yearAgo: number | null
  /** % so cùng tháng năm trước; null khi năm ngoái ≤ 0. */
  deltaPct: number | null
  /** expense / baseline; null khi chưa có mức nền. Dùng vẽ thanh "So mức nền". */
  vsBaseline: number | null
  /** Vượt mức nền — tô màu chi. */
  overBaseline: boolean
}

export interface LongTable {
  rows: LongTableRow[]
  total: number
  yearAgoTotal: number | null
  totalDeltaPct: number | null
  /** Số tháng vượt mức nền trong bảng. */
  overCount: number
}

/**
 * Bảng của `scopeMonths` tháng CUỐI chuỗi, mới nhất lên đầu — in ĐỦ, không cắt ở 6.
 *
 * Bản cũ cắt ở 6 dòng và không có dấu hiệu nào cho biết còn tiếp. Người đọc kết luận "chỉ
 * có 6 tháng dữ liệu" từ một bảng thật ra có 24.
 *
 * `points` phải là chuỗi ĐẦY ĐỦ (kể cả phần trước phạm vi): cột "năm ngoái" cần tháng
 * cách đây 12, mà tháng đó thường nằm NGOÀI phạm vi đang xem.
 */
export function longTable(
  points: readonly RangePoint[],
  scopeMonths: number,
  baseline: number | null,
): LongTable {
  const byKey = new Map<string, number>()
  for (const p of points) byKey.set(`${p.key.year}-${p.key.month}`, p.expense)

  const window = points.slice(Math.max(0, points.length - scopeMonths))
  const rows: LongTableRow[] = window.map((p) => {
    const prevKey = addMonths(p.key, -12)
    const yearAgo = byKey.get(`${prevKey.year}-${prevKey.month}`) ?? null
    return {
      key: p.key,
      expense: p.expense,
      yearAgo,
      deltaPct:
        yearAgo !== null && yearAgo > 0 ? ((p.expense - yearAgo) / yearAgo) * 100 : null,
      vsBaseline: baseline !== null && baseline > 0 ? p.expense / baseline : null,
      overBaseline: baseline !== null && baseline > 0 && p.expense > baseline,
    }
  })

  const total = rows.reduce((s, r) => s + r.expense, 0)
  const withPrior = rows.filter((r) => r.yearAgo !== null)
  const yearAgoTotal =
    withPrior.length === rows.length && rows.length > 0
      ? withPrior.reduce((s, r) => s + (r.yearAgo as number), 0)
      : null

  rows.reverse() // mới nhất lên đầu
  return {
    rows,
    total,
    yearAgoTotal,
    totalDeltaPct:
      yearAgoTotal !== null && yearAgoTotal > 0
        ? ((total - yearAgoTotal) / yearAgoTotal) * 100
        : null,
    overCount: rows.filter((r) => r.overBaseline).length,
  }
}

/**
 * Cú đổi nếp có nằm GIỮA hai đoạn 12 tháng đang so hay không.
 *
 * Bắt buộc phải nói ra khi đúng: sáu tháng đầu bảng ra Δ dương và sáu tháng cuối ra Δ âm
 * KHÔNG phải vì chi đang tăng lại, mà vì cú đổi nếp nằm giữa hai đoạn. Thiếu câu đó thì
 * bảng đọc ra một xu hướng không tồn tại.
 */
export function regimeSplitsComparison(
  points: readonly RangePoint[],
  regimeIndex: number | null,
  scopeMonths: number,
): boolean {
  if (regimeIndex === null) return false
  const windowStart = points.length - scopeMonths
  // Cú đổi nằm trong đoạn "năm ngoái" (12 tháng trước phạm vi) → nó cắt ngang phép so.
  return regimeIndex < windowStart && regimeIndex >= windowStart - scopeMonths
}

// ---------------------------------------------------------------------------------
// Mùa vụ: 12 cột, một cột một tháng dương lịch
// ---------------------------------------------------------------------------------

export interface MonthAverage {
  /** 1–12 */
  month: number
  /** TB chi của riêng tháng đó qua các năm có dữ liệu; 0 = chưa có lần nào. */
  avg: number
  /** Tháng đó xuất hiện mấy lần. 0 = cột trống, phải vẽ khác cột 0đ. */
  occurrences: number
  /** Nặng hơn TB mọi tháng bao nhiêu %; null khi chưa có dữ liệu. */
  heavierPct: number | null
}

/**
 * TB chi theo từng tháng DƯƠNG LỊCH — nền của panel 12 cột.
 *
 * Thay thẻ "Tháng 10 vốn là tháng nặng" của bản cũ: một dòng chữ nói về MỘT tháng, trong
 * khi cùng dữ liệu đó vẽ được cả mười hai và người đọc tự thấy tháng nào nặng. Cột chưa có
 * dữ liệu (`occurrences = 0`) phải vẽ khác cột "tháng đó chi 0đ" — quy ước "chưa biết ≠ 0".
 */
export function monthAverages(points: readonly RangePoint[]): {
  months: MonthAverage[]
  overall: number
  heaviest: MonthAverage | null
} {
  const sums = new Array<number>(12).fill(0)
  const counts = new Array<number>(12).fill(0)
  for (const p of points) {
    const i = p.key.month - 1
    sums[i] += p.expense
    counts[i] += 1
  }
  const withData = points.length
  const overall = withData > 0 ? points.reduce((s, p) => s + p.expense, 0) / withData : 0

  const months: MonthAverage[] = sums.map((sum, i) => {
    const occurrences = counts[i]
    const avg = occurrences > 0 ? sum / occurrences : 0
    return {
      month: i + 1,
      avg,
      occurrences,
      heavierPct: occurrences > 0 && overall > 0 ? ((avg - overall) / overall) * 100 : null,
    }
  })

  const candidates = months.filter((m) => m.occurrences > 0)
  const heaviest =
    candidates.length > 0
      ? candidates.reduce((best, m) => (m.avg > best.avg ? m : best), candidates[0])
      : null
  return { months, overall, heaviest }
}

// ---------------------------------------------------------------------------------
// Gửi về VN — 12 cột + tổng + ghi chú tháng bỏ
// ---------------------------------------------------------------------------------

export interface RemitMonth {
  key: MonthKey
  amount: number
  /** Trong phạm vi nhưng KHÔNG có lần gửi nào. */
  skipped: boolean
}

export interface RemitStrip {
  months: RemitMonth[]
  total: number
  /** Số tháng có gửi / tổng số tháng trong phạm vi. */
  sent: number
  /** Mức gửi thường lệ (trung vị các tháng CÓ gửi); 0 khi chưa lần nào. */
  usual: number
  /** Tháng gửi khác mức thường lệ — để câu chú thích gọi tên đúng tháng. */
  unusual: RemitMonth[]
  skippedMonths: RemitMonth[]
}

/**
 * Dải gửi tiền theo tháng.
 *
 * `amountOf` nhận một MonthKey và trả tổng đã gửi tháng đó (base minor). Tách ra làm tham
 * số để hàm này thuần: nguồn thật là `is_remittance` trên giao dịch, mà lọc nó cần tỷ giá.
 */
export function remitStrip(
  keys: readonly MonthKey[],
  amountOf: (k: MonthKey) => number,
): RemitStrip {
  const months: RemitMonth[] = keys.map((key) => {
    const amount = amountOf(key)
    return { key, amount, skipped: amount <= 0 }
  })
  const sentMonths = months.filter((m) => !m.skipped)
  const usual = baselineLevel(sentMonths.map((m) => m.amount))
  return {
    months,
    total: months.reduce((s, m) => s + m.amount, 0),
    sent: sentMonths.length,
    usual,
    unusual: sentMonths.filter((m) => m.amount !== usual),
    skippedMonths: months.filter((m) => m.skipped),
  }
}

/** Phần TỐI THIỂU của một giao dịch mà `remitMonthlyTotals` cần đọc. */
export interface RemitLikeTx {
  is_remittance?: boolean
  account_id: string
  amount: number
  occurred_on: string
}

/**
 * Lọc `is_remittance` → quy đổi tiền tài khoản nguồn sang base → gộp theo tháng.
 *
 * MỘT nơi làm việc này — trước bản này, tab Dài hạn (`LongView.tsx`) và form Nhập
 * (`TransactionForm.tsx`) mỗi nơi tự viết lại đúng ba bước filter/convert/bucket này,
 * và đã LỆCH NHAU thật (fallback tiền tài khoản khi tra không thấy: một bên `?? 'JPY'`,
 * bên kia `?? base`) — hai màn có thể báo hai tổng khác nhau cho CÙNG những tháng đó.
 * Gộp về đây để không còn chỗ thứ hai cho việc lệch lặp lại.
 *
 * Fallback tiền tài khoản khi tra `account_id` không thấy (tài khoản đã xoá) là
 * `?? base`: không giả định người dùng luôn để base = JPY, khác `?? 'JPY'` cũ ở
 * TransactionForm — hai bên chốt theo `?? base` vì đó là lựa chọn không đoán bừa.
 *
 * Trả về HÀM `amountOf` để đưa thẳng vào `remitStrip(keys, amountOf)` — không tự gọi
 * `remitStrip` ở đây vì `keys` (phạm vi bao nhiêu tháng) là quyết định của TỪNG nơi gọi.
 */
export function remitMonthlyTotals(
  txs: readonly RemitLikeTx[],
  accounts: readonly { id: string; currency: CurrencyCode }[],
  base: CurrencyCode,
  rates: Rates,
  monthStartDay: number,
): (k: MonthKey) => number {
  const byMonth = new Map<string, number>()
  for (const t of txs) {
    if (!t.is_remittance) continue
    const currency = accounts.find((a) => a.id === t.account_id)?.currency ?? base
    const v = convertToBase(t.amount, currency, base, rates)
    if (v === null) continue
    const k = monthKeyForDate(t.occurred_on, monthStartDay)
    const id = `${k.year}-${k.month}`
    byMonth.set(id, (byMonth.get(id) ?? 0) + v)
  }
  return (k: MonthKey) => byMonth.get(`${k.year}-${k.month}`) ?? 0
}
