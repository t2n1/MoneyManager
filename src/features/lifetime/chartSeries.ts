// Hai quyết định THUẦN của `LifetimeChartCard`: gộp dữ liệu theo năm, và quyết ĐƯỜNG
// NÀO ĐƯỢC VẼ.
//
// VÌ SAO ĐỨNG RIÊNG MỘT FILE thay vì nằm trong `LifetimeChartCard.tsx`: thẻ đó không
// có file test nào (repo này chưa có jsdom/testing-library — mọi phép thử là phép thử
// module thuần), nên mọi câu rào "lệch đơn vị tiền thì ẩn đường" trong đó chỉ được canh
// bằng mắt người đọc. Lớp lỗi "đơn vị đổi mà con số không đổi" đã bị bắt NĂM lần trên
// nhánh này, hai lần trong đúng cái thẻ ấy — nên phần quyết định phải là hàm thuần, có
// phép thử, chứ không phải một biểu thức nằm giữa JSX.
import type { CurrencyCode } from '../../lib/currencies'
import type { NetWorthSnapshotRow } from '../../types/database.types'
import type { YearRow } from './project'

export interface ChartPoint {
  year: number
  actual: number | null
  projected: number | null
  band: [number, number] | null
  compare: number | null
}

/** Gộp dữ liệu lịch sử + bản chiếu (+ bản so sánh) về một mảng theo năm cho Recharts. */
export function buildChartData(
  rows: YearRow[],
  historyRows: NetWorthSnapshotRow[],
  compareRows: YearRow[] | null,
): ChartPoint[] {
  // Lịch sử ghi theo NGÀY (nhiều snapshot/năm) nhưng trục hoành của đồ thị này theo NĂM
  // như bản chiếu — gộp về một điểm/năm, giữ bản ghi MỚI NHẤT trong năm đó (historyRows
  // đã sắp theo snapshot_on tăng dần từ repo, nên gán đè tuần tự là đủ).
  const historyByYear = new Map<number, number>()
  for (const s of historyRows) {
    historyByYear.set(Number(s.snapshot_on.slice(0, 4)), s.net_worth)
  }

  const rowByYear = new Map(rows.map((r) => [r.year, r]))
  const compareByYear = compareRows ? new Map(compareRows.map((r) => [r.year, r])) : null

  // Hợp cả năm có lịch sử lẫn năm có bản chiếu — lịch sử thường lùi về trước năm hiện
  // tại, nên KHÔNG được chỉ lấy years của `rows` (sẽ cắt mất phần lịch sử thật).
  const years = Array.from(new Set([...historyByYear.keys(), ...rows.map((r) => r.year)])).sort(
    (a, b) => a - b,
  )

  return years.map((year) => {
    const row = rowByYear.get(year)
    const cRow = compareByYear?.get(year)
    return {
      year,
      actual: historyByYear.get(year) ?? null,
      projected: row ? row.assetsEndMinor : null,
      band: row ? [row.assetsPessimisticMinor, row.assetsOptimisticMinor] : null,
      compare: cRow ? cRow.assetsEndMinor : null,
    }
  })
}

export interface ChartSeriesInput {
  /** `display_currency` của kịch bản ĐANG XEM — đơn vị của trục tung. */
  currency: CurrencyCode
  /** Đơn vị THẬT của `historyRows` = `profiles.base_currency`, không phải `currency`. */
  historyCurrency: CurrencyCode
  /** `display_currency` của kịch bản đang so sánh; `null`/`undefined` = không biết. */
  compareCurrency: CurrencyCode | null | undefined
  /** Có mảng `compare` khác null hay không (đã bật chế độ so sánh). */
  hasCompare: boolean
}

export interface ChartSeriesPlan {
  showHistory: boolean
  showCompare: boolean
  showBand: boolean
  /** Khác `null` = lịch sử BỊ ẨN vì lệch đơn vị tiền; đây là câu nói ra lý do. */
  historyHiddenNote: string | null
  /** Khác `null` = đường so sánh BỊ ẨN vì lệch đơn vị tiền. */
  compareHiddenNote: string | null
}

/**
 * Đường nào ĐƯỢC VẼ trên đồ thị Lifetime — quyết định theo ĐƠN VỊ TIỀN, không theo
 * "có dữ liệu hay không".
 *
 * Trục tung của đồ thị mang đúng MỘT đơn vị: `currency` (display_currency của kịch bản
 * đang xem). Một chuỗi số tính theo đơn vị khác vẽ lên trục đó là sai IM LẶNG — cùng
 * một khối tài sản ¥11.000.000 đọc ra ~$110.000 hay ~1,65 tỷ đồng, nên đường "khác
 * tiền" dán xuống sát 0 hoặc phóng lên hết khung, còn đường đúng tiền thì trông như một
 * thảm hoạ. Không có tỷ giá giả định nào cho hai chuỗi này (khác hẳn từng dòng
 * chặng/sự kiện, vốn tự mang `fx_to_display`), nên KHÔNG vẽ là lựa chọn duy nhất đúng —
 * và phải NÓI RA lý do, vì im lặng thì người dùng tưởng chưa có dữ liệu.
 *
 * `showBand = !showCompare` (không phải `!hasCompare`): dải bị ẩn khi đang so sánh vì
 * HAI DẢI chồng nhau không đọc được gì — nhưng khi đường so sánh đã bị ẩn vì lệch đơn
 * vị thì trên đồ thị chỉ còn MỘT kịch bản, không có gì chồng lên nhau, nên dải của
 * chính nó phải hiện lại.
 */
export function chartSeriesPlan(input: ChartSeriesInput): ChartSeriesPlan {
  const { currency, historyCurrency, compareCurrency, hasCompare } = input

  const showHistory = historyCurrency === currency
  // `compareCurrency == null` = chỗ gọi không truyền được đơn vị của bản so sánh. Coi
  // như KHÔNG lệch (vẫn vẽ): đây là ca "chưa biết", còn ẩn đường vì một điều chưa biết
  // là xoá dữ liệu vì nghi ngờ. Prop này luôn được LifetimePage truyền, nên ca này chỉ
  // là phòng hờ.
  const currencyMismatch = compareCurrency != null && compareCurrency !== currency
  const showCompare = hasCompare && !currencyMismatch

  return {
    showHistory,
    showCompare,
    showBand: !showCompare,
    historyHiddenNote: showHistory
      ? null
      : `Lịch sử thật đang ẩn vì kịch bản này hiển thị bằng ${currency} còn lịch sử ghi theo ${historyCurrency} — chưa quy đổi được nên không vẽ để tránh sai đơn vị.`,
    compareHiddenNote:
      hasCompare && currencyMismatch
        ? `Đường kịch bản so sánh đang ẩn vì nó hiển thị bằng ${compareCurrency} còn đồ thị này theo ${currency} — chưa quy đổi được nên không vẽ để tránh sai đơn vị.`
        : null,
  }
}
