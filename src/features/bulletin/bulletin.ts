// Phép tính của màn Bản tin — tách khỏi component để test được, và vì cùng một con số
// (Thu / Chi / Giữ lại / Tài sản ròng, kèm so tháng trước) sẽ còn được khối "Việc cần
// làm" đọc lại ở PR 9.
//
// KHÔNG tự tính lại gì đã có: chuỗi tháng đến từ `reports/aggregate.monthlySeries`, tỷ lệ
// giữ lại từ `reports/insights.savingsRate`, tài sản ròng từ `assets/useAssetsData`. Ở
// đây chỉ có phần Bản tin thật sự thêm vào — so với tháng liền trước, và cắt chuỗi thành
// dữ liệu cho đường tí hon.
import type { MonthlySeries } from '../reports/aggregate'
import type { MonthKey } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

/** Số tháng vẽ trong khối Dòng tiền (§4.1). Cũng là độ dài đường tí hon của ô KPI. */
export const BULLETIN_MONTHS = 8

/** Số thứ tự tháng tuyệt đối — để trừ hai MonthKey cho ra khoảng cách tháng. */
const ordinal = (k: MonthKey) => k.year * 12 + k.month

/**
 * Tháng ĐỨNG CUỐI dải 8 cột.
 *
 * Không phải lúc nào cũng là tháng đang xem, và đây là điểm dễ làm sai: neo dải vào
 * tháng đang xem thì bấm cột thứ 5 sẽ kéo cả dải trượt sang phải để cột vừa bấm thành
 * cột cuối — người dùng bấm một cái bar rồi thấy tám cái bar khác hẳn. Đã dựng đúng lỗi
 * đó rồi mới sửa.
 *
 * Luật: dải neo vào THÁNG NÀY, trừ khi tháng đang xem nằm ngoài dải (đi lùi quá 8 tháng
 * bằng nút ‹ trên top bar, hoặc mở link `?ym=` cũ) — lúc đó mới trượt để tháng đang xem
 * hiện ra. Hệ quả: bấm cột chỉ đổi cột được tô, dải đứng yên.
 *
 * Tháng ở TƯƠNG LAI cũng phải kéo dải theo, không thì bấm › đi tới tháng sau là mất
 * luôn cột đang chọn.
 */
export function seriesAnchor(active: MonthKey, current: MonthKey): MonthKey {
  const diff = ordinal(current) - ordinal(active)
  return diff >= 0 && diff <= BULLETIN_MONTHS - 1 ? current : active
}

export interface Kpi {
  /** Giá trị của tháng đang xem, minor units base. */
  value: number
  /** Cùng chỉ số ở tháng liền trước; null khi không có tháng trước trong chuỗi. */
  prev: number | null
  /**
   * Lệch so tháng trước, %. null khi KHÔNG so được — tháng trước bằng 0 thì mọi mức đều
   * là "tăng vô hạn". Cùng quy ước với `headlineOf`: thà không nói còn hơn nói sai.
   */
  deltaPct: number | null
  /** Chuỗi cho <Sparkline>, cũ → mới. */
  spark: number[]
}

/** Lệch phần trăm, làm tròn. null khi mẫu số ≤ 0. */
export function deltaPct(current: number, prev: number | null): number | null {
  if (prev === null || prev <= 0) return null
  return Math.round(((current - prev) / prev) * 100)
}

/**
 * Cắt một chuỗi tháng thành ô KPI.
 *
 * `values` xếp cũ → mới và PHẢI kết thúc ở tháng đang xem — `monthlySeries` sinh ra đúng
 * thứ tự đó cho khoảng đã yêu cầu.
 */
export function kpiFromSeries(values: number[]): Kpi {
  const value = values.at(-1) ?? 0
  const prev = values.length >= 2 ? (values.at(-2) ?? null) : null
  return { value, prev, deltaPct: deltaPct(value, prev), spark: values }
}

export interface BulletinSeries {
  labels: string[]
  income: number[]
  expense: number[]
}

/** Ba mảng song song từ MonthlySeries — dạng mà cả biểu đồ lẫn ô KPI cùng cần. */
export function seriesArrays(series: MonthlySeries, labelOf: (i: number) => string): BulletinSeries {
  return {
    labels: series.points.map((_, i) => labelOf(i)),
    income: series.points.map((p) => p.income),
    expense: series.points.map((p) => p.expense),
  }
}

/**
 * Bề rộng thanh "giữ lại" (§4.1: thanh 4px có mốc 20%), tính theo phần trăm.
 *
 * Kẹp vào [0, 100] chứ không để tràn: tỷ lệ giữ lại ÂM là chuyện thật (chi vượt thu) và
 * một thanh dài âm sẽ vẽ ngược ra ngoài khung. Chiều âm đã được nói bằng CHỮ ở dòng
 * ngay trên, thanh chỉ còn việc hiện "gần như không giữ được gì".
 */
export function keptBarPct(ratePct: number | null): number {
  if (ratePct === null) return 0
  return Math.max(0, Math.min(100, ratePct))
}

/**
 * N giao dịch mới nhất. Sắp theo NGÀY GHI NHẬN rồi mới tới thời điểm tạo: hai khoản cùng
 * ngày thì cái nhập sau đứng trên, vì đó là cái người dùng vừa động vào.
 *
 * Bỏ khoản đã loại khỏi thống kê? KHÔNG — đây là "vừa ghi gì", không phải một con số
 * tổng. Giấu đi thì người dùng ghi xong không thấy nó đâu và tưởng mất.
 */
export function recentTransactions(txs: TransactionRow[], limit: number): TransactionRow[] {
  return [...txs]
    .sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
      return (a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1
    })
    .slice(0, limit)
}
