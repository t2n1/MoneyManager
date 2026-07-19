// Thống kê gửi tiền về VN — thuần, không phụ thuộc React, để unit-test được.
// Nhận danh sách giao dịch bất kỳ; tự lọc is_remittance. Số gửi gốc = amount − phí.

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
