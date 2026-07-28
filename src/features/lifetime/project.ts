// Engine Lifetime — THUẦN. MODULE LÁ: chỉ được import lib/currencies.
// Không React, không localStorage, không Date.now(). Lý do: lifetimeRules.ts gọi
// hàm này, và src/features/notifications/purity.test.ts canh điều kiện đó (mục J).
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'

/** Chặng đời: thu chi NỀN. Chặng sau bắt đầu thì chặng trước kết thúc. */
export interface LifetimePhase {
  startYear: number
  label: string
  country: string | null
  currency: CurrencyCode
  annualIncomeMinor: number
  annualExpenseMinor: number
  /** 1 đơn vị `currency` = bao nhiêu đơn vị display, theo MAJOR units. */
  fxToDisplay: number
}

/** Sự kiện: số MỖI NĂM trong khoảng [startYear, endYear]. endYear null = hết đời. */
export interface LifetimeEvent {
  id: string
  startYear: number
  endYear: number | null
  kind: 'income' | 'expense'
  amountMinor: number
  currency: CurrencyCode
  label: string
  inflate: boolean
}

export interface LifetimeInput {
  currentYear: number
  birthYear: number
  endAge: number
  displayCurrency: CurrencyCode
  startingAssetsMinor: number
  /** Lợi suất THỰC, basis points. Âm được. */
  realReturnBps: number
  /** Nửa độ rộng dải: chạy lại với realReturn ± giá trị này. 0 = không có dải. */
  bandSpreadBps: number
  inflationBps: number
  /** false = giá hôm nay: lạm phát KHÔNG phồng chi phí, chỉ trừ vào lợi suất. */
  nominalTerms: boolean
  phases: LifetimePhase[]
  events: LifetimeEvent[]
}

export interface YearEvent {
  id: string
  label: string
  kind: 'income' | 'expense'
  /** Đã quy đổi về displayCurrency và đã áp lạm phát nếu inflate. */
  amountDisplayMinor: number
}

export interface YearRow {
  year: number
  age: number
  country: string | null
  phaseLabel: string
  /** Thu nền, đã quy đổi. Không gồm sự kiện. */
  incomeMinor: number
  /** Chi nền, đã quy đổi. Không gồm sự kiện. */
  expenseMinor: number
  events: YearEvent[]
  /** (thu nền + thu sự kiện) − (chi nền + chi sự kiện) */
  netFlowMinor: number
  assetsEndMinor: number
  /** Nhánh lợi suất thấp (realReturn − bandSpread). */
  assetsLowMinor: number
  /** Nhánh lợi suất cao (realReturn + bandSpread). */
  assetsHighMinor: number
}

/**
 * Quy đổi minor units giữa hai loại tiền bằng tỷ giá MAJOR-sang-MAJOR.
 *
 * Cố ý ngược hướng với `Rates` trong lib/rates.ts (ở đó `rates[X]` là "1 base đổi
 * được bao nhiêu X" nên phải CHIA). Ở đây `fxMajor` là "1 đơn vị `from` đổi được
 * bao nhiêu đơn vị `to`" — đúng cách người dùng nghĩ khi gõ "¥150/$" — nên NHÂN.
 *
 * Bắt buộc đi qua major units: JPY có 0 chữ số thập phân còn USD có 2, nhân thẳng
 * minor × tỷ giá sẽ lệch 100 lần.
 */
export function convertLifetimeMinor(
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxMajor: number,
): number {
  if (from === to) return minor
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals
  return Math.round(fromMajor * fxMajor * 10 ** CURRENCIES[to].decimals)
}

/** Chặng đang hiệu lực cho `year`: chặng muộn nhất có startYear <= year. */
function phaseForYear(sorted: LifetimePhase[], year: number): LifetimePhase {
  let found = sorted[0]
  for (const p of sorted) {
    if (p.startYear <= year) found = p
    else break
  }
  // Năm nằm trước chặng đầu tiên thì dùng chặng đầu tiên — thà lấy giả định gần
  // nhất còn hơn để trống một quãng đầu đồ thị.
  return found
}

export function projectLifetime(input: LifetimeInput): YearRow[] {
  const {
    currentYear,
    birthYear,
    endAge,
    displayCurrency,
    startingAssetsMinor,
    realReturnBps,
    bandSpreadBps,
    inflationBps,
    nominalTerms,
    phases,
    events,
  } = input

  if (phases.length === 0) return []

  const sortedPhases = [...phases].sort((a, b) => a.startYear - b.startYear)
  const lastYear = birthYear + endAge
  if (lastYear < currentYear) return []

  const inflation = nominalTerms ? inflationBps / 10_000 : 0
  const rates = [realReturnBps, realReturnBps - bandSpreadBps, realReturnBps + bandSpreadBps].map(
    (bps) => bps / 10_000,
  )
  // Ba nhánh tài sản chạy song song trên CÙNG dòng tiền — chỉ khác lợi suất.
  const assets = [startingAssetsMinor, startingAssetsMinor, startingAssetsMinor]

  const out: YearRow[] = []

  for (let year = currentYear; year <= lastYear; year++) {
    const phase = phaseForYear(sortedPhases, year)
    const infl = (1 + inflation) ** (year - currentYear)

    const incomeMinor = Math.round(
      convertLifetimeMinor(
        phase.annualIncomeMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay,
      ) * infl,
    )
    const expenseMinor = Math.round(
      convertLifetimeMinor(
        phase.annualExpenseMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay,
      ) * infl,
    )

    const yearEvents: YearEvent[] = []
    for (const e of events) {
      if (e.startYear > year) continue
      if (e.endYear !== null && e.endYear < year) continue
      const base = convertLifetimeMinor(e.amountMinor, e.currency, displayCurrency, 1)
      // Sự kiện dùng tỷ giá của chặng đang hiệu lực nếu khác tiền hiển thị: 年金 giữ ¥
      // trong khi chặng Mỹ dùng $, nên không thể mượn fx của chặng một cách vô điều kiện.
      const converted =
        e.currency === displayCurrency
          ? base
          : convertLifetimeMinor(
              e.amountMinor,
              e.currency,
              displayCurrency,
              e.currency === phase.currency ? phase.fxToDisplay : 1,
            )
      yearEvents.push({
        id: e.id,
        label: e.label,
        kind: e.kind,
        amountDisplayMinor: Math.round(converted * (e.inflate ? infl : 1)),
      })
    }

    const eventIncome = yearEvents
      .filter((e) => e.kind === 'income')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)
    const eventExpense = yearEvents
      .filter((e) => e.kind === 'expense')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)

    const netFlowMinor = incomeMinor + eventIncome - expenseMinor - eventExpense

    for (let i = 0; i < assets.length; i++) {
      assets[i] = Math.round(assets[i] * (1 + rates[i])) + netFlowMinor
    }

    out.push({
      year,
      age: year - birthYear,
      country: phase.country,
      phaseLabel: phase.label,
      incomeMinor,
      expenseMinor,
      events: yearEvents,
      netFlowMinor,
      assetsEndMinor: assets[0],
      assetsLowMinor: assets[1],
      assetsHighMinor: assets[2],
    })
  }

  return out
}
