// Đọc kết luận từ YearRow[]. THUẦN. Bốn câu hỏi của người dùng đều đọc từ cùng
// một mảng — không chỗ nào tính lại theo công thức riêng.
import { projectLifetime, type LifetimeInput, type YearRow } from './project'

/** Quy tắc 4%: tài sản × SWR đủ trả chi phí năm thì coi như tự do tài chính. */
export const DEFAULT_SWR_BPS = 400

/** Khoảng dò của minimumReturnBps: 0% → 10%. */
const MIN_RETURN_LO_BPS = 0
const MIN_RETURN_HI_BPS = 1000

/**
 * Năm đầu tiên tài sản xuống dưới 0. null = không bao giờ âm.
 * `branch` 'low' đọc biên DƯỚI của dải (`assetsPessimisticMinor`) — con số đáng lo
 * hơn và là thứ thẻ kết luận hiện, vì mốc âm của nhánh trung tâm dịch cả chục năm
 * khi đổi lợi suất 1%.
 */
export function firstNegativeYear(rows: YearRow[], branch: 'center' | 'low'): number | null {
  for (const r of rows) {
    // 'low' = BIÊN DƯỚI của dải (assetsPessimisticMinor), không phải "nhánh lợi suất
    // thấp": ở vùng tài sản âm hai thứ đó là hai nhánh khác nhau. Xem YearRow.
    const v = branch === 'low' ? r.assetsPessimisticMinor : r.assetsEndMinor
    if (v < 0) return r.year
  }
  return null
}

/** Năm đầu tiên tài sản × SWR ≥ chi phí năm. null = không bao giờ đạt. */
export function fireYear(rows: YearRow[], swrBps = DEFAULT_SWR_BPS): number | null {
  const swr = swrBps / 10_000
  for (const r of rows) {
    if (r.expenseMinor <= 0) continue // không có chi phí thì mốc này vô nghĩa
    if (r.assetsEndMinor * swr >= r.expenseMinor) return r.year
  }
  return null
}

export function assetsAtAge(
  rows: YearRow[],
  age: number,
): { center: number; low: number; high: number } | null {
  const row = rows.find((r) => r.age === age)
  if (!row) return null
  // low/high ở đây là hai BIÊN của dải, không phải hai nhánh lợi suất — nên đọc thẳng
  // assetsPessimisticMinor/assetsOptimisticMinor để `low <= high` luôn đúng.
  return {
    center: row.assetsEndMinor,
    low: row.assetsPessimisticMinor,
    high: row.assetsOptimisticMinor,
  }
}

/**
 * Lợi suất thực nhỏ nhất (basis points) để KHÔNG năm nào âm, dò nhị phân trong
 * khoảng 0–10%. null = không tồn tại trong khoảng đó.
 *
 * Đây là thẻ kết luận thay cho "năm đầu tiên âm" của bản nháp đầu: mốc âm dịch 15
 * năm khi đổi lợi suất 1%, tức là chính xác giả. Con số này thì hành động được.
 *
 * Dò trên nhánh TRUNG TÂM với bandSpread = 0 — đang trả lời "cần lợi suất bao
 * nhiêu", nên dải dao động quanh nó không liên quan.
 */
export function minimumReturnBps(input: LifetimeInput): number | null {
  const safeAt = (bps: number) =>
    firstNegativeYear(
      projectLifetime({ ...input, realReturnBps: bps, bandSpreadBps: 0 }),
      'center',
    ) === null

  if (safeAt(MIN_RETURN_LO_BPS)) return MIN_RETURN_LO_BPS
  if (!safeAt(MIN_RETURN_HI_BPS)) return null

  let lo = MIN_RETURN_LO_BPS
  let hi = MIN_RETURN_HI_BPS
  // 10 vòng đủ đưa khoảng 1000bps xuống dưới 1bps.
  for (let i = 0; i < 10; i++) {
    const mid = Math.round((lo + hi) / 2)
    if (safeAt(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** Hiệu tài sản cuối đời giữa hai bản chiếu (a − b). null nếu một bên rỗng. */
export function compareAtEnd(a: YearRow[], b: YearRow[]): number | null {
  if (a.length === 0 || b.length === 0) return null
  return a[a.length - 1].assetsEndMinor - b[b.length - 1].assetsEndMinor
}
