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
  /**
   * Hai mép của `band` tách thành hai chuỗi vô hướng RIÊNG, chỉ để VẼ ĐƯỜNG VIỀN.
   *
   * `band` là cặp `[thấp, cao]` cho `<Area>`, mà `<Line>` của Recharts không đọc được
   * cặp — nó cần một số. Tách ở đây (nơi có test) thay vì lấy bằng `dataKey` dạng hàm
   * trong component: hàm dataKey không có tên chuỗi nên tooltip và `payload` gọi nó là
   * `undefined`, và đó đúng là chỗ đã sinh ra một nhãn "undefined" trong tooltip.
   *
   * Luôn đi cùng `band` (cùng null, cùng có giá trị) — chúng là ba cách nhìn của một
   * dòng, không phải ba nguồn dữ liệu.
   */
  bandLow: number | null
  bandHigh: number | null
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
      bandLow: row ? row.assetsPessimisticMinor : null,
      bandHigh: row ? row.assetsOptimisticMinor : null,
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
  /**
   * Bản chiếu của kịch bản so sánh, ĐÚNG như chỗ gọi có: `null` = chưa bật so sánh, `[]`
   * = đã bật nhưng kịch bản kia không chiếu ra năm nào.
   *
   * Nhận cả mảng chứ không nhận một `hasCompare: boolean` đã tính sẵn: bản trước nhận
   * boolean và chỗ gọi tính nó bằng `compare !== null`, nên `[]` (mảng rỗng — khác `null`)
   * đi qua thành "đang so sánh". Chỗ nào TÍNH câu rào thì chỗ đó phải là chỗ có phép thử;
   * để phép tính nằm ở chỗ gọi là để nó nằm ngoài mọi phép thử, đúng thứ file này tồn tại
   * để tránh (xem chú thích đầu file).
   */
  compareRows: YearRow[] | null
}

export interface ChartSeriesPlan {
  showHistory: boolean
  showCompare: boolean
  showBand: boolean
  /** Khác `null` = lịch sử BỊ ẨN vì lệch đơn vị tiền; đây là câu nói ra lý do. */
  historyHiddenNote: string | null
  /** Khác `null` = đường so sánh BỊ ẨN vì lệch đơn vị tiền. */
  compareHiddenNote: string | null
  /**
   * Khác `null` = đã bật so sánh nhưng bản chiếu của kịch bản kia RỖNG, nên không có gì
   * để vẽ. Tách khỏi `compareHiddenNote` vì hai nguyên nhân khác nhau và câu chữ hướng
   * người dùng đi hai nơi khác nhau (khai tỷ giá/đơn vị tiền ≠ thêm chặng đời).
   */
  compareEmptyNote: string | null
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
 * `showBand = !showCompare` (không phải `!compareRows`): dải bị ẩn khi đang so sánh vì
 * HAI DẢI chồng nhau không đọc được gì — nhưng khi đường so sánh đã bị ẩn (lệch đơn vị,
 * hoặc bản chiếu kia rỗng) thì trên đồ thị chỉ còn MỘT kịch bản, không có gì chồng lên
 * nhau, nên dải của chính nó phải hiện lại. Đây là lý do bản chiếu RỖNG bắt buộc phải
 * tính là "không so sánh": mất dải là mất luôn nhánh bi quan cùng vùng âm đỏ tính theo
 * nó — cảnh báo tệ nhất của màn này tắt mà không có gì trên màn hình nói ra.
 */
export function chartSeriesPlan(input: ChartSeriesInput): ChartSeriesPlan {
  const { currency, historyCurrency, compareCurrency, compareRows } = input

  const showHistory = historyCurrency === currency
  // `compareCurrency == null` = chỗ gọi không truyền được đơn vị của bản so sánh. Coi
  // như KHÔNG lệch (vẫn vẽ): đây là ca "chưa biết", còn ẩn đường vì một điều chưa biết
  // là xoá dữ liệu vì nghi ngờ. Prop này luôn được LifetimePage truyền, nên ca này chỉ
  // là phòng hờ.
  const currencyMismatch = compareCurrency != null && compareCurrency !== currency
  // Đã bật so sánh (`!== null`) nhưng không chiếu ra năm nào. `projectLifetime` trả `[]`
  // cho kịch bản không có chặng nào hoặc có tuổi kết thúc đã qua, và `projectScenario`
  // (useLifetime.ts) trả `[]` cho một id không còn khớp kịch bản nào.
  const compareEmpty = compareRows !== null && compareRows.length === 0
  const showCompare = compareRows !== null && !compareEmpty && !currencyMismatch

  return {
    showHistory,
    showCompare,
    showBand: !showCompare,
    historyHiddenNote: showHistory
      ? null
      : `Lịch sử thật đang ẩn vì kịch bản này hiển thị bằng ${currency} còn lịch sử ghi theo ${historyCurrency} — chưa quy đổi được nên không vẽ để tránh sai đơn vị.`,
    // `!compareEmpty`: bản chiếu rỗng thì KHÔNG có đường nào để mà ẩn vì đơn vị tiền —
    // nói sai nguyên nhân còn tệ hơn không nói, vì nó bảo người dùng đi khai tỷ giá trong
    // khi việc phải làm là thêm chặng đời cho kịch bản kia.
    compareHiddenNote:
      compareRows !== null && !compareEmpty && currencyMismatch
        ? `Đường kịch bản so sánh đang ẩn vì nó hiển thị bằng ${compareCurrency} còn đồ thị này theo ${currency} — chưa quy đổi được nên không vẽ để tránh sai đơn vị.`
        : null,
    compareEmptyNote: compareEmpty
      ? 'Kịch bản so sánh chưa chiếu được năm nào nên không có đường nào để vẽ — kiểm chặng đời và tuổi kết thúc của kịch bản đó.'
      : null,
  }
}

