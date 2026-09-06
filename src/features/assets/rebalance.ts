// Tái cân bằng theo tỷ trọng mục tiêu — THUẦN, có test. Bài học giáo trình đã đối chiếu
// (09/2026, C8/C16): khai tỷ trọng mục tiêu MỘT LẦN lúc bình tĩnh; từ đó máy đo độ lệch
// thay cảm xúc. Lệch quá REBAL_DRIFT_ALERT_PP điểm % thì nhắc, và gợi ý duy nhất là GÓP
// THÊM TIỀN MỚI vào nhóm đang hụt — không bao giờ gợi ý bán: bán trong NISA là mất suất
// miễn thuế vĩnh viễn, và bán để "cân" cũng là một quyết định thời điểm.
//
// ---- Mẫu số suy từ chính lời khai, không phải từ một cái nút -----------------------
//
// Một sổ thật có thể để nhóm to nhất ĐỨNG NGOÀI "Tổng tài sản" (ví dụ nhóm Đầu tư bằng
// ngoại tệ). Nếu mẫu số cứ khoá cứng ở phần tính-vào-tổng thì "tỷ trọng mục tiêu" chỉ
// còn là chia tiền mặt giữa hai ví, không phải phân bổ tài sản — mà đó lại đúng là thứ
// tính năng này sinh ra để làm.
//
// Nên mẫu số có HAI mức, và người dùng chọn nó bằng chính hành động khai mục tiêu:
//
//   · chưa khai nhóm ngoài tổng nào  → 'totals', mẫu số = phần tính vào Tổng tài sản.
//     Đây là hành vi cũ y nguyên, nên sổ đang chạy không thấy gì đổi.
//   · khai mục tiêu cho một nhóm ngoài tổng → 'all', mẫu số nở ra mọi nhóm có tiền.
//
// Không thêm cột DB, không thêm nút, và Bản tin gọi cùng hàm này nên hai màn không thể
// lệch pha nhau. Nhóm `total = 0` không bao giờ vào mẫu số — nó không có gì để chia; đó
// cũng là cách nhóm chỉ chứa tài khoản ÂM (đã bị loại ở cấp tài khoản) tự rơi ra ngoài
// mà không cần một nhánh riêng.

/** Lệch tuyệt đối (điểm %) từ mức này trở lên mới đáng nhắc. */
export const REBAL_DRIFT_ALERT_PP = 5

export interface RebalanceGroupInput {
  name: string
  /** minor, base — tổng nhóm; đã tôn trọng loại-trừ ở CẤP TÀI KHOẢN. */
  total: number
  /** false = nhóm đứng ngoài "Tổng tài sản". */
  includeInTotals: boolean
}

export interface RebalanceRow {
  name: string
  actualPct: number
  /** null = nhóm này chưa khai mục tiêu. */
  targetPct: number | null
  /** actual − target (điểm %); âm = đang hụt so mục tiêu. null khi chưa khai. */
  driftPp: number | null
  /**
   * Góp thêm bao nhiêu TIỀN MỚI vào riêng nhóm này thì nó về đúng mục tiêu
   * (các nhóm khác giữ nguyên, tổng phình theo). null khi nhóm đang VƯỢT mục tiêu
   * (thứ cần góp là các nhóm kia), khi mục tiêu ≥ 100%, hoặc khi chưa khai.
   */
  addToReachMinor: number | null
}

/** Dòng của nhóm ĐÃ khai mục tiêu — `targetPct`/`driftPp` chắc chắn có. */
export type DeclaredRebalanceRow = RebalanceRow & { targetPct: number; driftPp: number }

/** Mẫu số đang dùng — xem đầu file. */
export type RebalanceBasis = 'totals' | 'all'

export interface RebalanceResult {
  basis: RebalanceBasis
  /** minor, base — tổng của mọi nhóm trong mẫu số. */
  denominator: number
  /** MỌI nhóm trong mẫu số, xếp theo số tiền GIẢM DẦN (đây cũng là thứ tự hiển thị). */
  rows: RebalanceRow[]
  /** Tổng % mục tiêu đã khai — UI nhắc khi vượt 100. */
  declaredPct: number
  /** 0 khi chưa nhóm nào khai mục tiêu. */
  maxDriftPp: number
  /** Nhóm lệch nhất TRONG SỐ ĐÃ KHAI; null khi chưa ai khai. */
  worst: DeclaredRebalanceRow | null
  alert: boolean
}

/**
 * null chỉ khi không có gì để chia (mẫu số ≤ 0). Chưa ai khai mục tiêu vẫn trả kết quả —
 * thẻ Cơ cấu dùng chính `rows` để vẽ vạch, nên hai thứ không thể lệch mẫu số.
 * `targetsBps` theo TÊN nhóm (khoá của asset_group_settings).
 */
export function rebalancePlan(
  groups: RebalanceGroupInput[],
  targetsBps: ReadonlyMap<string, number>,
): RebalanceResult | null {
  const targetOf = (name: string) => {
    const bps = targetsBps.get(name)
    return bps !== undefined && bps > 0 ? bps : null
  }
  const withMoney = groups.filter((g) => g.total > 0)
  // Lời khai trên một nhóm ngoài tổng là lời tuyên bố "đo trên toàn bộ tài sản".
  const basis: RebalanceBasis = withMoney.some(
    (g) => !g.includeInTotals && targetOf(g.name) !== null,
  )
    ? 'all'
    : 'totals'
  const inScope =
    basis === 'all' ? withMoney : withMoney.filter((g) => g.includeInTotals)

  const T = inScope.reduce((s, g) => s + g.total, 0)
  if (T <= 0) return null

  const rows: RebalanceRow[] = [...inScope]
    .sort((a, b) => b.total - a.total)
    .map((g) => {
      const bps = targetOf(g.name)
      const actualPct = (g.total / T) * 100
      if (bps === null)
        return { name: g.name, actualPct, targetPct: null, driftPp: null, addToReachMinor: null }
      const target = bps / 10_000
      // x sao cho (total + x) / (T + x) = target → x = (target·T − total) / (1 − target).
      const thieu = target * T - g.total
      const addToReachMinor =
        thieu > 0 && target < 1 ? Math.round(thieu / (1 - target)) : null
      return {
        name: g.name,
        actualPct,
        targetPct: bps / 100,
        driftPp: actualPct - target * 100,
        addToReachMinor,
      }
    })

  // Hoà |lệch| (A hụt 10, B vượt 10) thì nhóm ĐANG HỤT thắng: câu kết của UI là "góp
  // thêm bao nhiêu", mà chỉ nhóm hụt mới có con số đó. Chọn nhóm vượt là dẫn tới một
  // lời nhắc không kèm việc gì làm được.
  const declared = rows
    .filter((r): r is DeclaredRebalanceRow => r.targetPct !== null && r.driftPp !== null)
    .sort(
      (a, b) => Math.abs(b.driftPp) - Math.abs(a.driftPp) || a.driftPp - b.driftPp,
    )
  const worst = declared[0] ?? null
  const maxDriftPp = worst === null ? 0 : Math.abs(worst.driftPp)
  return {
    basis,
    denominator: T,
    rows,
    declaredPct: declared.reduce((s, r) => s + r.targetPct, 0),
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
