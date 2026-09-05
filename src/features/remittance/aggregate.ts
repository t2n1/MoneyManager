// Thống kê gửi tiền về VN — thuần, không phụ thuộc React, để unit-test được.
// Nhận danh sách giao dịch bất kỳ; tự lọc is_remittance. Số gửi gốc = amount − phí.

import { nearestFxRate, type FxDayRates } from '../assets/fxDecompose'
import type { TransactionRow } from '../../types/database.types'

export interface RemittanceStats {
  /** Σ (amount − remit_fee_jpy) — số gửi gốc, minor units JPY */
  totalSentJpy: number
  /** Σ remit_fee_jpy — tổng phí, minor units JPY */
  totalFeeJpy: number
  /** Σ remit_received_vnd — tổng VND người nhận nhận, minor units VND */
  totalReceivedVnd: number
  /** VND nhận trên mỗi 1 JPY gửi gốc; null nếu chưa gửi (totalSentJpy = 0) */
  avgRate: number | null
  /** số lần gửi */
  count: number
}

export interface RemittanceTiming {
  transactionId: string
  date: string
  /** VND nhận trên mỗi 1 JPY gửi gốc của LẦN này */
  rate: number
  /** chênh so với tỷ giá trung bình cả kỳ (%) — dương = gửi được giá tốt */
  vsAvgPct: number
  /**
   * Lợi/thiệt quy ra VND: nếu lần này gửi đúng bằng tỷ giá trung bình cả kỳ thì
   * nhận nhiều/ít hơn bao nhiêu. Dương = gửi đúng lúc, được thêm chừng đó đồng.
   */
  gainVsAvgVnd: number
  /** số JPY gửi gốc của lần này (đã trừ phí) */
  sentJpy: number
}

/**
 * Chi phí cơ hội của TỪNG lần gửi: so tỷ giá thực nhận của lần đó với tỷ giá
 * trung bình cả kỳ. Không cần nhập tỷ giá thị trường ở đâu cả — số VND người
 * nhận thực nhận đã là tỷ giá thật rồi.
 *
 * Chỉ lấy lần gửi có đủ dữ liệu (số gửi > 0 và có ghi số VND nhận).
 */
export function remittanceTiming(txs: TransactionRow[], avgRate: number | null): RemittanceTiming[] {
  if (!avgRate || avgRate <= 0) return []
  const out: RemittanceTiming[] = []
  for (const t of txs) {
    if (!t.is_remittance) continue
    const sentJpy = Math.max(t.amount - (t.remit_fee_jpy ?? 0), 0)
    const received = t.remit_received_vnd ?? 0
    if (sentJpy <= 0 || received <= 0) continue
    const rate = received / sentJpy
    out.push({
      transactionId: t.id,
      date: t.occurred_on,
      rate,
      vsAvgPct: ((rate - avgRate) / avgRate) * 100,
      gainVsAvgVnd: Math.round((rate - avgRate) * sentJpy),
      sentJpy,
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Kiều hối chiếm bao nhiêu phần thu nhập cả kỳ (0.18 = 18%). Tính trên TỔNG tiền
 * rời khỏi ví (gửi gốc + phí) vì đó mới là số thật sự mất đi.
 * Thu nhập ≤ 0 → null.
 */
export function remittanceShareOfIncome(
  stats: RemittanceStats,
  annualIncomeJpy: number,
): number | null {
  if (annualIncomeJpy <= 0) return null
  return (stats.totalSentJpy + stats.totalFeeJpy) / annualIncomeJpy
}

export interface RemitTrueCostItem {
  transactionId: string
  date: string
  /** Số gửi gốc (amount − phí), minor JPY. */
  sentJpy: number
  feeJpy: number
  receivedVnd: number
  /** VND/JPY thị trường quanh ngày gửi (fx_history, ±3 ngày). */
  marketRate: number
  /** VND/JPY thực nhận = received ÷ sent. */
  appliedRate: number
  /**
   * Phần hụt vào tỷ giá, quy JPY minor: (thị trường − thực nhận) × sent ÷ thị trường.
   * ÂM được — nghĩa là lần đó đổi ĐƯỢC GIÁ hơn tỷ giá giữa, cứ nói thật.
   */
  fxLossJpy: number
  /** Chi phí thật của lần gửi = phí + phần hụt tỷ giá (minor JPY). */
  totalCostJpy: number
  /** Chi phí thật trên số gửi gốc, ví dụ 0.026 = 2,6%. */
  costPct: number
}

export interface RemitTrueCost {
  items: RemitTrueCostItem[]
  totalFeeJpy: number
  totalFxLossJpy: number
  totalCostJpy: number
  /** Σ sent của những lần TÍNH ĐƯỢC — mẫu số của costPct tổng. */
  totalSentJpy: number
  /** Lần gửi đủ hai đầu số nhưng THIẾU tỷ giá thị trường quanh ngày gửi. */
  missingRateCount: number
}

/** fx_history được phép lệch mấy ngày so với ngày gửi. */
export const REMIT_RATE_MAX_GAP_DAYS = 3

/**
 * Chi phí THẬT của từng lần gửi — so với tỷ giá THỊ TRƯỜNG cùng ngày, không phải với
 * trung bình của chính mình như `remittanceTiming`. Hai phép so trả lời hai câu khác
 * nhau: timing nói "lần nào canh khéo hơn lần nào", cái này nói "dịch vụ lấy của tôi
 * bao nhiêu" — gồm phí niêm yết CỘNG phần ẩn trong tỷ giá, phần mà biên lai không in
 * và (bài học Chặng 14) thường lớn hơn phí.
 *
 * Nguồn tỷ giá là fx_history — chỉ tích từ cuối 07/2026, nên lần gửi cũ hơn sẽ rơi vào
 * `missingRateCount` thay vì bị đoán bằng một tỷ giá không tồn tại.
 */
export function remitTrueCost(txs: TransactionRow[], fxDays: FxDayRates[]): RemitTrueCost {
  const items: RemitTrueCostItem[] = []
  let missingRateCount = 0
  for (const t of txs) {
    if (!t.is_remittance) continue
    const feeJpy = t.remit_fee_jpy ?? 0
    const sentJpy = Math.max(t.amount - feeJpy, 0)
    const receivedVnd = t.remit_received_vnd ?? 0
    if (sentJpy <= 0 || receivedVnd <= 0) continue
    const marketRate = nearestFxRate(fxDays, t.occurred_on, 'VND', REMIT_RATE_MAX_GAP_DAYS)
    if (marketRate === null) {
      missingRateCount++
      continue
    }
    const appliedRate = receivedVnd / sentJpy
    const fxLossJpy = Math.round(((marketRate - appliedRate) * sentJpy) / marketRate)
    const totalCostJpy = feeJpy + fxLossJpy
    items.push({
      transactionId: t.id,
      date: t.occurred_on,
      sentJpy,
      feeJpy,
      receivedVnd,
      marketRate,
      appliedRate,
      fxLossJpy,
      totalCostJpy,
      costPct: totalCostJpy / sentJpy,
    })
  }
  items.sort((a, b) => b.date.localeCompare(a.date))
  const totalFeeJpy = items.reduce((s, i) => s + i.feeJpy, 0)
  const totalFxLossJpy = items.reduce((s, i) => s + i.fxLossJpy, 0)
  const totalSentJpy = items.reduce((s, i) => s + i.sentJpy, 0)
  return {
    items,
    totalFeeJpy,
    totalFxLossJpy,
    totalCostJpy: totalFeeJpy + totalFxLossJpy,
    totalSentJpy,
    missingRateCount,
  }
}

export function remittanceStats(txs: TransactionRow[]): RemittanceStats {
  const rem = txs.filter((t) => t.is_remittance)
  let totalSentJpy = 0
  let totalFeeJpy = 0
  let totalReceivedVnd = 0
  for (const t of rem) {
    const fee = t.remit_fee_jpy ?? 0
    totalFeeJpy += fee
    totalSentJpy += Math.max(t.amount - fee, 0)
    totalReceivedVnd += t.remit_received_vnd ?? 0
  }
  return {
    totalSentJpy,
    totalFeeJpy,
    totalReceivedVnd,
    avgRate: totalSentJpy > 0 ? totalReceivedVnd / totalSentJpy : null,
    count: rem.length,
  }
}
