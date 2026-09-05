// Bản đồ khoản lớn — THUẦN, không React, không Date.now().
//
// Trả lời đúng một câu của Chặng 19 (giáo trình đã đối chiếu 09/2026): "các khoản lớn
// KHÔNG bất ngờ — chúng chỉ chưa từng được nhìn cùng lúc". Mỗi mốc tương lai sinh một
// dòng "cần để dành mỗi tháng = còn thiếu ÷ số tháng còn lại"; cộng mọi dòng lại rồi đặt
// cạnh phần dư thật mỗi tháng — vượt thì ít nhất một mốc phải lùi hoặc thu nhỏ, và biết
// điều đó NGAY BÂY GIỜ rẻ hơn mọi cách xoay tiền lúc mốc đã tới.
//
// Ba nguồn mốc, cố ý KHÔNG khử trùng nhau (người dùng thấy đủ rồi tự dọn):
// - sự kiện của kịch bản lifetime (chỉ có NĂM),
// - khoản chi dự kiến (có ngày),
// - mục tiêu tiết kiệm (có hạn + đã dành được một phần).
import { convertLifetimeMinor, type LifetimeEvent } from './project'
import { convertMinorToday, type FxOf } from './fxModel'
import type { CurrencyCode } from '../../lib/currencies'

export interface PlannedLikeInput {
  id: string
  title: string
  /** minor theo `currency`; 0 = chưa biết bao nhiêu → bỏ qua. */
  amount: number
  currency: CurrencyCode
  /** ISO yyyy-mm-dd. */
  due_on: string
}

export interface GoalLikeInput {
  id: string
  name: string
  /** minor theo `currency` (tiền của tài khoản gắn mục tiêu). */
  targetMinor: number
  /** Đã dành được (số dư/giá trị tài khoản gắn mục tiêu), cùng tiền với target. */
  progressMinor: number
  currency: CurrencyCode
  /** ISO yyyy-mm-dd; null = không hạn → KHÔNG vào bản đồ (bản đồ nói về thời gian). */
  targetDate: string | null
}

export interface BigExpenseItem {
  id: string
  label: string
  source: 'event' | 'planned' | 'goal'
  dueYear: number
  /** 'yyyy-mm' khi mốc biết tới tháng; null = mốc chỉ có năm. */
  dueMonth: string | null
  /**
   * Còn phải chuẩn bị, minor theo displayCurrency. null = thiếu tỷ giá hôm nay —
   * dòng vẫn hiện (để thấy có mốc) nhưng không cộng vào tổng, đúng luật ≈ của app.
   */
  remainingMinor: number | null
  /** ≥ 1. Mốc chỉ có năm: tính tới THÁNG 1 của năm đó — thà dư còn hơn hụt. */
  monthsLeft: number
  /** remainingMinor ÷ monthsLeft (một lần) hoặc số năm ÷ 12 (lặp). null khi thiếu tỷ giá. */
  monthlyNeedMinor: number | null
  /** true = khoản lặp mỗi năm (sự kiện nhiều năm) — không có "hạn", chỉ có nhịp. */
  recurring: boolean
}

export interface YearPressure {
  year: number
  /** Tổng các khoản rơi vào năm này (một lần + phần lặp), minor display. */
  totalMinor: number
  /** Số khoản MỘT LẦN trong năm — cái làm một năm thành "năm nặng". */
  onceCount: number
}

export interface BigExpenseMap {
  items: BigExpenseItem[]
  /** Tổng "cần để dành mỗi tháng" của mọi dòng có số. */
  totalMonthlyNeedMinor: number
  hasMissingFx: boolean
  /** currentYear → currentYear+9. Chỉ gồm năm có gì đó. */
  yearPressure: YearPressure[]
  /** Năm có ≥ 2 khoản một lần — danh sách ưu tiên xử lý của Chặng 19. */
  heavyYears: number[]
}

export const PRESSURE_HORIZON_YEARS = 10

/** Số tháng từ todayISO tới (year, month), kẹp sàn 1 — "đến hạn rồi" vẫn chia cho 1. */
function monthsUntil(todayISO: string, year: number, month: number): number {
  const cy = Number(todayISO.slice(0, 4))
  const cm = Number(todayISO.slice(5, 7))
  return Math.max(1, (year - cy) * 12 + (month - cm))
}

export function buildBigExpenseMap(args: {
  todayISO: string
  displayCurrency: CurrencyCode
  /** Sự kiện của bản chiếu ĐANG XEM — fxToDisplay đã được chuẩn hoá theo tỷ giá hôm nay. */
  events: LifetimeEvent[]
  planned: PlannedLikeInput[]
  goals: GoalLikeInput[]
  /** Quy đổi planned/goal (tiền riêng của chúng) về display. */
  fxOf: FxOf
}): BigExpenseMap {
  const { todayISO, displayCurrency, events, planned, goals, fxOf } = args
  const currentYear = Number(todayISO.slice(0, 4))
  const horizonEnd = currentYear + PRESSURE_HORIZON_YEARS - 1

  const items: BigExpenseItem[] = []
  let missing = false

  for (const e of events) {
    if (e.kind !== 'expense' || e.amountMinor <= 0) continue
    const once = e.endYear !== null && e.endYear === e.startYear
    if (once && e.startYear < currentYear) continue
    if (!once && e.endYear !== null && e.endYear < currentYear) continue
    // Sự kiện mang fxToDisplay riêng (đã chuẩn hoá ở normalizeToPhaseCurrency) — nhân
    // thẳng, không đi qua fxOf: đi hai đường cho cùng một khoản là mời hai kết quả.
    const amountDisplay = convertLifetimeMinor(
      e.amountMinor,
      e.currency,
      displayCurrency,
      e.fxToDisplay,
    )
    if (once) {
      const monthsLeft = monthsUntil(todayISO, e.startYear, 1)
      items.push({
        id: e.id,
        label: e.label,
        source: 'event',
        dueYear: e.startYear,
        dueMonth: null,
        remainingMinor: amountDisplay,
        monthsLeft,
        monthlyNeedMinor: Math.ceil(amountDisplay / monthsLeft),
        recurring: false,
      })
    } else {
      items.push({
        id: e.id,
        label: e.label,
        source: 'event',
        dueYear: Math.max(e.startYear, currentYear),
        dueMonth: null,
        remainingMinor: amountDisplay,
        monthsLeft: 12,
        monthlyNeedMinor: Math.ceil(amountDisplay / 12),
        recurring: true,
      })
    }
  }

  for (const p of planned) {
    if (p.amount <= 0) continue
    const y = Number(p.due_on.slice(0, 4))
    const m = Number(p.due_on.slice(5, 7))
    if (y < currentYear) continue
    const remaining = convertMinorToday(p.amount, p.currency, displayCurrency, fxOf)
    if (remaining === null) missing = true
    const monthsLeft = monthsUntil(todayISO, y, m)
    items.push({
      id: p.id,
      label: p.title,
      source: 'planned',
      dueYear: y,
      dueMonth: p.due_on.slice(0, 7),
      remainingMinor: remaining,
      monthsLeft,
      monthlyNeedMinor: remaining === null ? null : Math.ceil(remaining / monthsLeft),
      recurring: false,
    })
  }

  for (const g of goals) {
    if (g.targetDate === null || g.targetMinor <= 0) continue
    const y = Number(g.targetDate.slice(0, 4))
    const m = Number(g.targetDate.slice(5, 7))
    if (y < currentYear) continue
    // Đã đạt rồi thì không còn là gánh nặng — bỏ khỏi bản đồ.
    const remainingOwn = Math.max(0, g.targetMinor - g.progressMinor)
    if (remainingOwn === 0) continue
    const remaining = convertMinorToday(remainingOwn, g.currency, displayCurrency, fxOf)
    if (remaining === null) missing = true
    const monthsLeft = monthsUntil(todayISO, y, m)
    items.push({
      id: g.id,
      label: g.name,
      source: 'goal',
      dueYear: y,
      dueMonth: g.targetDate.slice(0, 7),
      remainingMinor: remaining,
      monthsLeft,
      monthlyNeedMinor: remaining === null ? null : Math.ceil(remaining / monthsLeft),
      recurring: false,
    })
  }

  // Gần hạn trước; cùng năm thì khoản nặng tay hơn đứng trước; thiếu tỷ giá xuống cuối.
  items.sort((a, b) => {
    if (a.recurring !== b.recurring) return a.recurring ? 1 : -1
    if (a.dueYear !== b.dueYear) return a.dueYear - b.dueYear
    return (b.monthlyNeedMinor ?? -1) - (a.monthlyNeedMinor ?? -1)
  })

  const totalMonthlyNeedMinor = items.reduce((s, i) => s + (i.monthlyNeedMinor ?? 0), 0)

  const byYear = new Map<number, YearPressure>()
  const bump = (year: number, minor: number, once: boolean) => {
    if (year < currentYear || year > horizonEnd) return
    const row = byYear.get(year) ?? { year, totalMinor: 0, onceCount: 0 }
    row.totalMinor += minor
    if (once) row.onceCount += 1
    byYear.set(year, row)
  }
  for (const i of items) {
    if (i.remainingMinor === null) continue
    if (!i.recurring) {
      bump(i.dueYear, i.remainingMinor, true)
      continue
    }
    // Khoản lặp: đổ số NĂM vào từng năm nó còn chạy trong chân trời.
    const ev = events.find((e) => e.id === i.id)
    const from = Math.max(ev?.startYear ?? currentYear, currentYear)
    const to = Math.min(ev?.endYear ?? horizonEnd, horizonEnd)
    for (let y = from; y <= to; y++) bump(y, i.remainingMinor, false)
  }
  const yearPressure = [...byYear.values()].sort((a, b) => a.year - b.year)
  const heavyYears = yearPressure.filter((y) => y.onceCount >= 2).map((y) => y.year)

  return { items, totalMonthlyNeedMinor, hasMissingFx: missing, yearPressure, heavyYears }
}
