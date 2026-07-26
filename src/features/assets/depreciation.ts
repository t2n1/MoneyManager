// Khấu hao tài sản cố định (xe, đồng hồ, máy ảnh, đồ nội thất đắt tiền).
// Thuần, không phụ thuộc React. Mọi số ở minor units theo currency TÀI KHOẢN.
//
// Mô hình: khấu hao TUYẾN TÍNH từ giá mua về giá trị còn lại (salvage) trong
// `months` tháng kể từ ngày mua. Đơn giản, dễ giải thích, và luôn bị ghi đè nếu
// người dùng tự nhập một định giá thực tế (account_valuations) — nhập tay luôn
// đúng hơn công thức.

import { daysBetween } from '../../lib/dates'

export interface DepreciationInput {
  /** giá mua (accounts.initial_balance) */
  costBasis: number
  /** giá trị còn lại khi hết vòng đời; 0 = khấu hao về 0 */
  salvageValue: number
  /** số tháng khấu hao; null = không khấu hao tự động */
  months: number | null
  /** ngày mua (mốc bắt đầu); null = chưa đặt */
  fromISO: string | null
  todayISO: string
}

export interface DepreciationResult {
  /** giá trị còn lại hôm nay (minor units) */
  currentValue: number
  /** đã mất bao nhiêu so với giá mua (≥ 0) */
  accumulated: number
  /** phần vòng đời đã đi qua (0..1) */
  elapsedRatio: number
  /** số tháng còn lại trước khi chạm salvage (0 = đã hết) */
  monthsLeft: number
}

/** Số tháng trung bình mỗi ngày — dùng để nội suy trong tháng cho mượt. */
const DAYS_PER_MONTH = 365.25 / 12

/**
 * Giá trị còn lại theo khấu hao tuyến tính. Trả null khi chưa cấu hình đủ
 * (thiếu số tháng hoặc ngày mua) — nơi gọi sẽ rơi về số dư sổ.
 *
 * Ngày mua ở TƯƠNG LAI (nhập nhầm hoặc đặt trước) → coi như chưa bắt đầu khấu hao.
 * salvage ≥ giá mua → không có gì để khấu hao, giữ nguyên giá mua.
 */
export function depreciate(input: DepreciationInput): DepreciationResult | null {
  const { costBasis, salvageValue, months, fromISO, todayISO } = input
  if (!months || months <= 0 || !fromISO) return null
  const depreciable = costBasis - salvageValue
  if (depreciable <= 0) {
    return { currentValue: costBasis, accumulated: 0, elapsedRatio: 0, monthsLeft: 0 }
  }
  const elapsedMonths = Math.max(0, daysBetween(fromISO, todayISO) / DAYS_PER_MONTH)
  const elapsedRatio = Math.min(1, elapsedMonths / months)
  const accumulated = Math.round(depreciable * elapsedRatio)
  return {
    currentValue: costBasis - accumulated,
    accumulated,
    elapsedRatio,
    monthsLeft: Math.max(0, Math.ceil(months - elapsedMonths)),
  }
}
