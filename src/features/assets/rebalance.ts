// Tái cân bằng theo tỷ trọng mục tiêu — THUẦN, có test. Bài học giáo trình đã đối chiếu
// (09/2026, C8/C16): khai tỷ trọng mục tiêu MỘT LẦN lúc bình tĩnh; từ đó máy đo độ lệch
// thay cảm xúc. Lệch quá REBAL_DRIFT_ALERT_PP điểm % thì nhắc, và gợi ý duy nhất là GÓP
// THÊM TIỀN MỚI vào nhóm đang hụt — không bao giờ gợi ý bán: bán trong NISA là mất suất
// miễn thuế vĩnh viễn, và bán để "cân" cũng là một quyết định thời điểm.

/** Lệch tuyệt đối (điểm %) từ mức này trở lên mới đáng nhắc. */
export const REBAL_DRIFT_ALERT_PP = 5

export interface RebalanceGroupInput {
  name: string
  /** minor, base — tổng nhóm ĐANG TÍNH VÀO tổng tài sản. */
  total: number
  includeInTotals: boolean
}

export interface RebalanceRow {
  name: string
  actualPct: number
  targetPct: number
  /** actual − target (điểm %); âm = đang hụt so mục tiêu. */
  driftPp: number
  /**
   * Góp thêm bao nhiêu TIỀN MỚI vào riêng nhóm này thì nó về đúng mục tiêu
   * (các nhóm khác giữ nguyên, tổng phình theo). null khi nhóm đang VƯỢT mục tiêu
   * (thứ cần góp là các nhóm kia) hoặc mục tiêu ≥ 100%.
   */
  addToReachMinor: number | null
}

export interface RebalanceResult {
  /** Chỉ nhóm CÓ khai mục tiêu, xếp theo |lệch| giảm dần. */
  rows: RebalanceRow[]
  /** Tổng % mục tiêu đã khai — UI nhắc khi vượt 100. */
  declaredPct: number
  maxDriftPp: number
  /** Nhóm lệch nhất. */
  worst: RebalanceRow | null
  alert: boolean
}

/**
 * null khi chưa nói được gì: chưa nhóm nào khai mục tiêu, hoặc tổng tài sản ≤ 0.
 * `targetsBps` theo TÊN nhóm (khoá của asset_group_settings).
 */
export function rebalancePlan(
  groups: RebalanceGroupInput[],
  targetsBps: ReadonlyMap<string, number>,
): RebalanceResult | null {
  const inTotals = groups.filter((g) => g.includeInTotals)
  const T = inTotals.reduce((s, g) => s + g.total, 0)
  if (T <= 0) return null

  const rows: RebalanceRow[] = []
  for (const g of inTotals) {
    const bps = targetsBps.get(g.name)
    if (bps === undefined || bps <= 0) continue
    const target = bps / 10_000
    const actualPct = (g.total / T) * 100
    const targetPct = bps / 100
    // x sao cho (total + x) / (T + x) = target → x = (target·T − total) / (1 − target).
    const thieu = target * T - g.total
    const addToReachMinor =
      thieu > 0 && target < 1 ? Math.round(thieu / (1 - target)) : null
    rows.push({ name: g.name, actualPct, targetPct, driftPp: actualPct - targetPct, addToReachMinor })
  }
  if (rows.length === 0) return null

  rows.sort((a, b) => Math.abs(b.driftPp) - Math.abs(a.driftPp))
  const worst = rows[0]
  const maxDriftPp = Math.abs(worst.driftPp)
  return {
    rows,
    declaredPct: rows.reduce((s, r) => s + r.targetPct, 0),
    maxDriftPp,
    worst,
    alert: maxDriftPp >= REBAL_DRIFT_ALERT_PP,
  }
}

/**
 * Ô nhập % mục tiêu → bps: '30' / '12,5' → 3000 / 1250; chuỗi rỗng → null (xoá);
 * không parse được hoặc ngoài [0, 100] → undefined (chỗ gọi giữ nguyên giá trị cũ).
 */
export function parsePctToBps(raw: string): number | null | undefined {
  const s = raw.trim().replace(',', '.').replace('%', '')
  if (s === '') return null
  const pct = Number(s)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return undefined
  return Math.round(pct * 100)
}
