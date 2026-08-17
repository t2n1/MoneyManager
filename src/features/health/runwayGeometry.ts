// Hình học của DẢI PHÂN VỊ cho mô phỏng "nếu mất thu nhập" (bản vẽ 15b, mục 5).
//
// 15b muốn 2.000 kịch bản hiện thành một dải, không phải ba con số rời trong câu văn:
// "trung vị 9 tháng, xui thì 5, may thì 17" bắt người đọc tự dựng hình trong đầu, mà
// điều đáng thấy nhất lại là ĐỘ RỘNG của dải — dải hẹp nghĩa là tương lai khá chắc,
// dải rộng nghĩa là chính con số trung vị cũng không đáng tin lắm.
//
// Tách khỏi JSX vì có ba cái bẫy, mỗi cái một test:
//   · Trục phải TỰ CO. `monteCarloRunway` chạy tới trần 60 tháng, nên vẽ trục 0–60 thì
//     một dải 5–17 tháng bị nén còn một phần tư bề ngang và không đọc được gì.
//   · Kịch bản sống sót cho p50 = horizon = 60. Đó KHÔNG phải "cạn tiền ở tháng 60",
//     nó là "không cạn trong tầm mô phỏng" — phải nói được sự khác biệt đó.
//   · p10 == p90 (mọi kịch bản ra cùng một số) thì dải rộng 0 pixel, tức biến mất.

/** Các mốc trục được phép chọn, tăng dần. */
export const AXIS_STEPS = [12, 24, 60] as const

export interface RunwayBandInput {
  p10: number
  p50: number
  p90: number
  /** Trần mô phỏng của `monteCarloRunway`. */
  horizon: number
}

export interface RunwayBandGeometry {
  /** Mốc cuối của trục, tính bằng tháng. */
  axisMax: number
  /** Vị trí trái của dải, % bề ngang. */
  leftPct: number
  /** Bề rộng dải, % — luôn ≥ MIN_WIDTH_PCT để dải không tàng hình. */
  widthPct: number
  /** Vị trí kim trung vị, %. */
  medianPct: number
  /** Các vạch chia trên trục, tính bằng tháng (gồm cả 0 và axisMax). */
  ticks: number[]
  /** true = trung vị chạm trần mô phỏng, tức "không cạn tiền trong tầm nhìn". */
  medianAtHorizon: boolean
}

/** Dải hẹp hơn mức này thì vẽ ra không thấy — nới tối thiểu bằng đúng chừng này. */
export const MIN_WIDTH_PCT = 1.5

/**
 * Chọn trục và quy ba phân vị thành phần trăm bề ngang.
 *
 * Trục lấy mốc NHỎ NHẤT trong `AXIS_STEPS` mà còn chứa nổi p90; vượt hết thì lấy
 * `horizon`. Nhờ vậy một danh mục cầm cự 5–17 tháng được vẽ trên trục 24 tháng thay vì
 * bị nén trong trục 60 tháng của trần mô phỏng.
 */
export function runwayBandGeometry({
  p10,
  p50,
  p90,
  horizon,
}: RunwayBandInput): RunwayBandGeometry {
  const axisMax = AXIS_STEPS.find((s) => p90 <= s && s <= horizon) ?? horizon
  const toPct = (v: number) => Math.min(100, Math.max(0, (v / axisMax) * 100))

  const left = toPct(p10)
  const right = toPct(p90)
  // Kẹp lại từ bên PHẢI khi nới: nới sang phải sẽ đẩy dải vượt quá 100% và tràn khung.
  const rawWidth = right - left
  const widthPct = Math.max(rawWidth, MIN_WIDTH_PCT)
  const leftPct = Math.min(left, 100 - widthPct)

  // Vạch chia: chia trục thành bốn phần đều. 24 → 0/6/12/18/24, đúng như bản vẽ.
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((axisMax * i) / 4))

  return {
    axisMax,
    leftPct,
    widthPct,
    medianPct: toPct(p50),
    ticks,
    medianAtHorizon: p50 >= horizon,
  }
}
