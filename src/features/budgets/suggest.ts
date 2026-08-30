// Gợi ý số khi đặt hạn mức — thuần, test được.
//
// Tới nay ô đặt hạn mức là một ô trống: app biết rõ ba tháng qua danh mục này tốn bao
// nhiêu mà không nói, còn người dùng thì phải bịa số từ trí nhớ. File này lấy đúng dữ
// liệu đã có sẵn (cùng nguồn với đường 6 tháng ở màn chi tiết danh mục) và trả về hai
// con số để chọn.

import type { CategorySlice } from '../reports/aggregate'

/** Chi theo danh mục của MỘT tháng. */
export interface MonthSlices {
  /** 'YYYY-MM' */
  monthKey: string
  slices: CategorySlice[]
}

export interface Suggestion {
  categoryId: string
  /** trung bình mỗi tháng trong cửa sổ (base minor, đã làm tròn) */
  average: number
  /** tháng tốn nhất trong cửa sổ */
  max: number
  /** từng tháng, cũ → mới; tháng không chi đồng nào vẫn có mặt với 0 */
  months: { monthKey: string; amount: number }[]
}

/**
 * Gợi ý hạn mức cho từng danh mục từ các tháng ĐÃ HOÀN TẤT.
 *
 * Nơi gọi chịu trách nhiệm chỉ đưa vào tháng đã đóng sổ: tháng đang dở luôn thiếu tiền
 * nên sẽ kéo mọi gợi ý xuống thấp hơn thực tế.
 *
 * Tháng không có đồng chi nào bị loại khỏi mẫu số — cùng luật với `baselineIncome`.
 * Đó là tháng CHƯA CÓ DỮ LIỆU (mới cài app, hoặc chưa nhập), không phải tháng tiêu 0
 * đồng. Ngược lại, tháng có dữ liệu mà danh mục này không phát sinh thì VẪN tính là 0:
 * hạn mức là con số mỗi tháng, mà "sửa xe 45.000 mỗi ba tháng" đúng ra là 15.000 một
 * tháng chứ không phải 45.000.
 *
 * Trả về cả `max` vì trung bình một mình là cái bẫy: tháng nào cũng đúng trung bình thì
 * một nửa số tháng sẽ vượt trần. Ai muốn chắc thì chọn số cao nhất — UI bày cả hai.
 */
export function suggestLimits(months: MonthSlices[]): Map<string, Suggestion> {
  const withData = months.filter((m) => m.slices.some((s) => s.amount > 0))
  const out = new Map<string, Suggestion>()
  if (withData.length === 0) return out

  const ids = new Set<string>()
  for (const m of withData) for (const s of m.slices) ids.add(s.categoryId)

  for (const categoryId of ids) {
    const series = withData.map((m) => ({
      monthKey: m.monthKey,
      amount: m.slices.find((s) => s.categoryId === categoryId)?.amount ?? 0,
    }))
    const total = series.reduce((s, x) => s + x.amount, 0)
    out.set(categoryId, {
      categoryId,
      average: Math.round(total / series.length),
      max: series.reduce((m, x) => Math.max(m, x.amount), 0),
      months: series,
    })
  }
  return out
}

/** Ngoài khoảng này thì hạn mức và trung bình coi là lệch nhau. */
const OFF_LOW = 0.5
const OFF_HIGH = 1.5
/**
 * Ngưỡng TIỀN đi kèm ngưỡng tỉ lệ. Đơn vị `base minor`, cùng quy ước với mọi ngưỡng
 * tiền khác trong app — người dùng đổi mệnh giá thì ngưỡng đi theo `base`.
 */
const OFF_MIN_GAP = 3000

/**
 * Hạn mức có lệch trung bình đủ để nói ra không (B33.3).
 *
 * Vì sao phải có ngưỡng TIỀN, không chỉ ngưỡng tỉ lệ: `Gas` TB `¥58` mà hạn mức
 * `¥1,500` đọc ra "gấp 26 lần" — nghe như báo động, thực ra là một khoản bé có một
 * tháng nhảy. Thiếu ngưỡng tiền thì `Gas`, `Điện thoại`, `Cây & Cá` đều bị tô, và một
 * cảnh báo lúc nào cũng kêu thì mất luôn cả lần nó đúng (cùng lý lẽ với `FAST_MIN_RATIO`
 * trong `budgetSort.ts`).
 *
 * `average <= 0` trả false: không có mẫu số thì không có tỉ lệ nào để so, và danh mục
 * chưa từng chi thì "lệch trung bình" là một câu không nói được gì.
 */
export function isOffAverage(limit: number, average: number): boolean {
  if (average <= 0 || limit <= 0) return false
  if (Math.abs(limit - average) < OFF_MIN_GAP) return false
  const r = limit / average
  return r < OFF_LOW || r > OFF_HIGH
}

/**
 * Cộng chi của các con LÊN danh mục cha, giữ nguyên chiều tháng.
 *
 * `categoryBreakdown` cộng theo đúng `category_id` ghi trên giao dịch, không gộp ngược
 * lên cha. Nên `Nhà ở` và `Ăn uống` — hai danh mục người dùng đặt TRẦN NHÓM — chưa từng
 * có mặt trong `suggestLimits()`, và cột `TB 6 tháng`, `Cao nhất`, nhịp 6 tháng của
 * chúng in ra `—` trong khi app biết thừa số đó nằm ở các con.
 *
 * Vì sao phải cộng theo TỪNG THÁNG rồi mới đưa cho `suggestLimits`, chứ không cộng
 * `average`/`max` của các con: `average` cộng lại thì đúng, `max` thì SAI. Hai con đạt
 * đỉnh ở hai tháng khác nhau (Tiền nhà tháng 6, Điện tháng 7) thì cộng hai đỉnh ra một
 * tháng chưa từng xảy ra — và `Cao nhất` tồn tại đúng để trả lời "tháng đắt nhất tốn bao
 * nhiêu".
 *
 * Khoản ghi THẲNG vào cha được CỘNG THÊM chứ không bị đè: `Sở thích` vừa là cha của
 * `Nhiếp ảnh`, `Thể thao`… vừa có giao dịch của chính nó.
 */
export function rollUpParents(
  months: MonthSlices[],
  parentOf: (categoryId: string) => string | null,
): MonthSlices[] {
  return months.map((month) => {
    const totals = new Map(month.slices.map((s) => [s.categoryId, s.amount]))
    for (const s of month.slices) {
      // Chặn vòng: dữ liệu hỏng (cha trỏ ngược về con) không được làm treo cả trang.
      const seen = new Set<string>([s.categoryId])
      let p = parentOf(s.categoryId)
      while (p !== null && !seen.has(p)) {
        seen.add(p)
        totals.set(p, (totals.get(p) ?? 0) + s.amount)
        p = parentOf(p)
      }
    }
    return {
      monthKey: month.monthKey,
      slices: [...totals].map(([categoryId, amount]) => ({ categoryId, amount })),
    }
  })
}
