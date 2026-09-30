// Phần THUẦN của các module Bản tin thêm đợt 2026-09-30 (Khoản chi lớn nhất, Lịch chi
// tiêu, Sức khỏe, Gửi tiền về VN). Không React, không I/O — cùng lý do với board.ts: repo
// không render component trong test, nên mọi phép chọn/xếp phải thử được ở đây.
//
// Không có luật tiền MỚI nào: mỗi hàm chỉ chọn lại từ thứ màn nguồn đã tính (dailySpike,
// remittance/aggregate, health_snapshots) — để module trên Bản tin và màn gốc không bao
// giờ nói hai con số khác nhau.
import type { HealthSnapshotRow, TransactionRow } from '../../types/database.types'
import type { DaySpend } from '../reports/dailySpike'

// ---- Khoản chi lớn nhất ----------------------------------------------------------------

export interface BigExpense {
  tx: TransactionRow
  /** base minor, dương. */
  amount: number
}

/**
 * N khoản chi lớn nhất (theo tiền base). CÙNG luật loại trừ với `dailySpendSeries`:
 * không chuyển khoản, không dòng tiền nợ, không khoản "bỏ khỏi thống kê", không hoàn tiền.
 * Thiếu tỷ giá (`toBase` trả null) thì bỏ ra và bật cờ — không bao giờ quy 1:1.
 */
export function bigExpenses(
  txs: readonly TransactionRow[],
  limit: number,
  toBase: (t: TransactionRow) => number | null,
  transferIds: ReadonlySet<string>,
): { items: BigExpense[]; hasMissingRate: boolean } {
  let hasMissingRate = false
  const items: BigExpense[] = []
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_refund || t.is_debt_flow || t.exclude_from_stats) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    const v = toBase(t)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    items.push({ tx: t, amount: v })
  }
  // Bằng tiền thì khoản MỚI hơn đứng trước — thứ tự ổn định giữa hai lần vẽ.
  items.sort((a, b) => b.amount - a.amount || (a.tx.occurred_on < b.tx.occurred_on ? 1 : -1))
  return { items: items.slice(0, limit), hasMissingRate }
}

// ---- Lịch chi tiêu (bản đồ nhiệt) -------------------------------------------------------

/** 0 = không chi, 1..4 = từ nhẹ tới nặng. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatCell {
  date: string
  total: number
  level: HeatLevel
  /** Ngày sau hôm nay — chưa tới, vẽ khác ngày "không chi". */
  future: boolean
}

/**
 * Nấc màu của từng ngày, đo theo MỨC CHI THƯỜNG (trung vị ngày có chi — `typical` của
 * dailySpendSeries), không theo ngày cao nhất: đo theo cực đại thì một ngày trả tiền nhà
 * biến mọi ngày khác thành nhạt như nhau, và bản đồ hết nói được gì.
 *
 *   ≤ ½ thường → 1 · ≤ thường → 2 · ≤ 2× thường → 3 · hơn nữa → 4
 */
export function heatLevel(total: number, typical: number): HeatLevel {
  if (total <= 0) return 0
  if (typical <= 0) return 2
  if (total <= typical / 2) return 1
  if (total <= typical) return 2
  if (total <= typical * 2) return 3
  return 4
}

export function heatCells(days: readonly DaySpend[], typical: number, todayISO: string): HeatCell[] {
  return days.map((d) => ({
    date: d.date,
    total: d.total,
    level: d.date > todayISO ? 0 : heatLevel(d.total, typical),
    future: d.date > todayISO,
  }))
}

/** Số ngày có chi / không chi tính tới hôm nay — dòng tóm tắt dưới bản đồ. */
export function heatSummary(cells: readonly HeatCell[]): { spendDays: number; zeroDays: number } {
  let spendDays = 0
  let zeroDays = 0
  for (const c of cells) {
    if (c.future) continue
    if (c.total > 0) spendDays++
    else zeroDays++
  }
  return { spendDays, zeroDays }
}

// ---- Sức khỏe tài chính -------------------------------------------------------------------

export interface HealthGlance {
  score: number
  monthOn: string
  /** so với lần chấm TRƯỚC; null khi mới có một lần. */
  delta: number | null
  /** Phần trọng số đã chấm được, 0..1. */
  coverage: number
  /** Điểm các lần chấm gần nhất, cũ → mới (tối đa `n`). */
  history: number[]
}

/**
 * Lần chấm gần nhất trong `health_snapshots` — màn Sức khỏe ghi mỗi tháng một dòng khi
 * được mở. Module ĐỌC điểm đã chấm, không chấm lại: chấm cần cả chục nguồn (số dư, nợ,
 * mục tiêu, 12 tháng giao dịch), tự làm lại ở Bản tin là hai bộ điểm có thể lệch nhau.
 */
export function healthGlance(rows: readonly HealthSnapshotRow[], n = 6): HealthGlance | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => (a.month_on < b.month_on ? -1 : a.month_on > b.month_on ? 1 : 0))
  const last = sorted[sorted.length - 1]
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null
  return {
    score: last.score,
    monthOn: last.month_on,
    delta: prev ? last.score - prev.score : null,
    coverage: Math.max(0, Math.min(1, last.coverage_bps / 10_000)),
    history: sorted.slice(-n).map((r) => r.score),
  }
}

