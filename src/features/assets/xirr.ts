// Tỷ suất sinh lời có tính THỜI ĐIỂM bỏ tiền (XIRR) — thuần, unit-test được.
//
// Vì sao không dùng phép chia đơn giản (lãi ÷ vốn): bỏ 1 triệu từ 3 năm trước
// khác hẳn bỏ 1 triệu tháng trước, dù cùng lời 100k. XIRR quy mọi dòng tiền về
// một con số "lãi bao nhiêu %/năm", so sánh được với lãi tiết kiệm hay S&P500.

import { daysBetween } from '../../lib/dates'

/** Một dòng tiền. amount ÂM = bỏ tiền vào; DƯƠNG = nhận về (kể cả giá trị cuối kỳ). */
export interface CashFlow {
  date: string
  amount: number
}

const DAYS_PER_YEAR = 365

/** Hiện giá ròng của chuỗi dòng tiền tại lãi suất năm `rate`. */
function npv(flows: CashFlow[], rate: number, startISO: string): number {
  let sum = 0
  for (const f of flows) {
    const years = daysBetween(startISO, f.date) / DAYS_PER_YEAR
    sum += f.amount / Math.pow(1 + rate, years)
  }
  return sum
}

/**
 * Lãi suất năm khiến hiện giá ròng = 0.
 *
 * Dùng chia đôi (bisection) thay vì Newton–Raphson: chậm hơn vài chục vòng lặp
 * nhưng LUÔN hội tụ khi đã có đổi dấu, còn Newton hay văng ra vô cực với chuỗi
 * dòng tiền thật (nạp đều hằng tháng rồi rút một cục).
 *
 * Trả null khi: dưới 2 dòng tiền, không có cả chiều vào lẫn chiều ra, mọi dòng
 * tiền cùng một ngày, hoặc nghiệm nằm ngoài khoảng [-99.99%, +10.000%/năm]
 * (mất gần hết vốn / lãi phi thực tế → con số vô nghĩa, thà không hiện).
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const startISO = sorted[0].date
  if (sorted.every((f) => f.date === startISO)) return null

  let lo = -0.9999
  let hi = 100 // +10.000%/năm
  let fLo = npv(sorted, lo, startISO)
  let fHi = npv(sorted, hi, startISO)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null
  if (fLo * fHi > 0) return null // không đổi dấu → không có nghiệm trong khoảng

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(sorted, mid, startISO)
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-9) return mid
    if (fLo * fMid <= 0) {
      hi = mid
      fHi = fMid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  void fHi
  return (lo + hi) / 2
}

export interface InvestmentPerformance {
  /** tổng tiền đã bỏ vào (≥ 0) */
  contributed: number
  /** tổng tiền đã rút ra (≥ 0) */
  withdrawn: number
  /** vốn ròng còn nằm trong = contributed − withdrawn */
  netContributed: number
  /** giá trị thị trường hiện tại */
  currentValue: number
  /** phần do thị trường tạo ra = currentValue + withdrawn − contributed */
  growth: number
  /** lợi nhuận danh nghĩa %/năm; null = chưa đủ dữ liệu */
  annualReturn: number | null
  /** sau thuế lãi vốn; null khi annualReturn null */
  afterTaxReturn: number | null
  /** sau thuế VÀ sau lạm phát (lợi nhuận THỰC); null khi chưa khai lạm phát */
  realReturn: number | null
}

export interface PerformanceInput {
  /** dòng tiền vào/ra danh mục (chưa gồm giá trị cuối kỳ) */
  flows: CashFlow[]
  currentValue: number
  todayISO: string
  /** thuế lãi vốn theo basis points (2032 = 20.32%) */
  capitalGainsTaxBps: number
  /** lạm phát năm theo basis points; null = chưa khai, không tính lợi nhuận thực */
  annualInflationBps: number | null
}

/**
 * Gộp một danh mục đầu tư thành các con số dễ đọc: bỏ vào bao nhiêu, thị trường
 * cho thêm bao nhiêu, và quy ra %/năm ở ba mức danh nghĩa → sau thuế → sau lạm phát.
 *
 * Thuế chỉ đánh vào phần LỜI và chỉ khi đang lời (lỗ thì không phải nộp gì).
 * Lợi nhuận thực dùng công thức Fisher: (1+r)/(1+i) − 1, không phải phép trừ.
 */
export function investmentPerformance(input: PerformanceInput): InvestmentPerformance {
  const { flows, currentValue, todayISO, capitalGainsTaxBps, annualInflationBps } = input
  let contributed = 0
  let withdrawn = 0
  for (const f of flows) {
    if (f.amount < 0) contributed += -f.amount
    else withdrawn += f.amount
  }
  const netContributed = contributed - withdrawn
  const growth = currentValue + withdrawn - contributed

  const annualReturn = xirr([...flows, { date: todayISO, amount: currentValue }])

  let afterTaxReturn: number | null = null
  if (annualReturn !== null) {
    if (growth <= 0) {
      afterTaxReturn = annualReturn
    } else {
      const tax = (growth * capitalGainsTaxBps) / 10_000
      afterTaxReturn = xirr([...flows, { date: todayISO, amount: currentValue - tax }])
    }
  }

  const realReturn =
    afterTaxReturn === null || annualInflationBps === null
      ? null
      : (1 + afterTaxReturn) / (1 + annualInflationBps / 10_000) - 1

  return {
    contributed,
    withdrawn,
    netContributed,
    currentValue,
    growth,
    annualReturn,
    afterTaxReturn,
    realReturn,
  }
}
