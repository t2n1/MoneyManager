// Hạn mức theo TRỤC chi (thiết yếu / linh hoạt / tiết kiệm...) — thuần, test được.
//
// Ngân sách theo danh mục trả lời "tháng này ăn uống bao nhiêu là đủ".
// Ngân sách theo trục trả lời câu khác hẳn: "cơ cấu chi của mình có lành mạnh
// không" — và nó dùng lại đúng need_level đã gắn cho danh mục, nên người dùng
// không phải khai báo thêm lần nào nữa. "Danh mục" ở đây gồm cả CHA: trần nhóm
// và giao dịch ghi thẳng vào cha đều lấy nhãn của chính cha (xem planGroups.ts).
//
// Từ 2026-09-03: số khoản, tên, mốc và cách gộp nhãn của từng khoản đến từ
// BudgetMethod (xem budgetMethods.ts) — 50/30/20, 80/20, JARS, Kakeibo... mỗi
// phương pháp một danh sách khoản khác nhau, không còn cứng ba trục
// essential/flexible/savings.

import type { CategorySlice, ClassificationBreakdown } from '../reports/aggregate'
import type { CategoryRow } from '../../types/database.types'
import { bucketForNeed, type AxisKey, type BudgetMethod, type MethodBucket } from './budgetMethods'

export type { AxisKey } from './budgetMethods'

/** Mấy mốc đang thế nào — một mệnh đề ĐỘC LẬP, chưa có liên từ. */
export interface AxisMissSummary {
  /** Các dòng chưa đạt mốc, giữ thứ tự của `lines`. */
  missed: AxisLine[]
  /** "đạt cả 3 mốc" · "chưa đạt mốc Linh hoạt" · "lệch 2 mốc". */
  phrase: string
}

/**
 * Tóm các mốc thành một mệnh đề. `null` = chưa dựng được cơ cấu, không có gì để nói.
 *
 * Ở ĐÂY chứ không ở mỗi màn tự viết: cả hai mặt của tab Ngân sách đều cần câu này (mặt
 * theo dõi in nó ở tiêu đề thẻ Cơ cấu, mặt lập kế hoạch ghép nó vào câu kết luận), và
 * `planVerdict` từng giữ một bản riêng. Hai bản thì sớm muộn một bên đếm "lệch 2 mốc"
 * còn bên kia vẫn nói "đạt cả ba" trên cùng một dữ liệu.
 *
 * MỘT mốc lệch thì gọi TÊN — người đọc sửa được ngay. NHIỀU mốc thì đếm: liệt kê nhiều
 * tên vào giữa câu làm nó dài ra mà vẫn phải cuộn xuống mới biết lệch bao nhiêu.
 */
export function axisMissSummary(lines: readonly AxisLine[]): AxisMissSummary | null {
  if (lines.length === 0) return null
  const missed = lines.filter((l) => !l.ok)
  if (missed.length === 0) return { missed, phrase: `đạt cả ${lines.length} mốc` }
  if (missed.length === 1) {
    return { missed, phrase: `chưa đạt mốc ${missed[0].label}` }
  }
  return { missed, phrase: `lệch ${missed.length} mốc` }
}

export interface AxisLine {
  key: AxisKey
  /** tên khoản để hiện lên màn hình — lấy từ `MethodBucket.label` của phương pháp đang dùng */
  label: string
  /** chữ CHỈ ĐỂ DẠY — ẩn ở chế độ Gọn, xem `MethodBucket.hint` */
  hint: string
  /** số tiền thực tế trong kỳ (base minor); tiết kiệm có thể ÂM */
  actual: number
  /** mốc quy ra tiền (base minor) */
  target: number
  /** actual / thu nhập */
  share: number
  /** mốc dưới dạng tỷ lệ (0..1) */
  targetShare: number
  /** 'cap' = càng thấp càng tốt · 'floor' = càng cao càng tốt */
  direction: 'cap' | 'floor'
  /** đã đạt mốc chưa (bằng đúng mốc = đạt) */
  ok: boolean
  /** danh mục đã góp vào khoản này, giảm dần; rỗng = không xổ ra được */
  slices: CategorySlice[]
}

/**
 * Tỷ lệ (0..1) → nhãn phần trăm để hiện lên màn hình.
 *
 * Số ÂM viết thành "Âm 12%" chứ không phải "-12%": chi vượt thu thì tiết kiệm âm
 * (và một khoản cũng có thể âm nếu hoàn tiền nhiều hơn đã chi), mà dấu trừ ở cỡ
 * chữ 12px rất dễ trượt mắt — đọc "12%" thành "gần đạt mốc 20%" là hiểu ngược
 * hẳn tình hình. Thanh tiến độ thì đã kẹp về 0 nên tự nó không nói được gì.
 */
export function shareLabel(share: number): string {
  const pct = sharePct(share)
  return pct < 0 ? `Âm ${-pct}%` : `${pct}%`
}

/**
 * Tỷ lệ 0..1 → số phần trăm đã làm tròn, giữ dấu. Tách riêng vì chỗ hiển thị cần
 * hỏi "âm chưa" theo ĐÚNG con số đã làm tròn của `shareLabel` — làm tròn hai lần
 * theo hai cách thì -0,2% sẽ hiện "0%" mà vẫn bị coi là âm.
 */
export const sharePct = (share: number): number => {
  const pct = Math.round(share * 100)
  // Math.round(-0,2) ra -0. Nó không nhỏ hơn 0 nên hiển thị vẫn đúng, nhưng
  // `Object.is(-0, 0)` là false — trả 0 phẳng để chỗ gọi so sánh kiểu nào cũng yên.
  return pct === 0 ? 0 : pct
}

/** Danh mục lá của từng khoản. `savings` (và mọi khoản `residual` khác) luôn vắng mặt. */
export type AxisSliceMap = Partial<Record<AxisKey, CategorySlice[]>>

/**
 * Chia các lát chi theo khoản của PHƯƠNG PHÁP, để dòng khoản xổ ra được "đã chi vào đâu".
 *
 * Trả về danh mục LÁ đúng như `categoryBreakdown` cho ra, không gộp lên cha: khoản đã là
 * một tầng gộp rồi, gộp thêm tầng nữa là phải chạm ba lần mới thấy giao dịch.
 *
 * Khoản `residual` (Để dành) luôn không có mặt trong map — nó không phải tổng của danh
 * mục nào cả nên chẳng có gì để liệt kê (xem `axisProgress`). Danh mục chưa gắn
 * `need_level`, hoặc phương pháp không có khoản nào nhận nhãn đó, cũng không vào đâu hết.
 */
export function axisSlices(
  slices: CategorySlice[],
  categories: CategoryRow[],
  method: BudgetMethod,
): AxisSliceMap {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const r: AxisSliceMap = {}
  for (const s of slices) {
    // MỘT phép tra dùng chung với planGroups — hai bên phải khớp nhau từng đồng.
    const bucket = bucketForNeed(method, byId.get(s.categoryId)?.need_level ?? null)
    if (!bucket || bucket.source.kind === 'residual') continue
    ;(r[bucket.key] ??= []).push(s)
  }
  for (const list of Object.values(r)) list?.sort((a, b) => b.amount - a.amount)
  return r
}

export interface AxisProgress {
  lines: AxisLine[]
  /** mẫu số đang dùng: thu thực tế, hoặc nền ước tính khi chưa tới ngày lương */
  income: number
  /** thu đã thực nhận trong kỳ — bằng `income` khi không ước tính */
  actualIncome: number
  /** true = mẫu số là nền ước tính, mọi tỷ lệ đang là DỰ KIẾN */
  estimated: boolean
  /** chi chưa gắn need_level và chưa được đếm ở khoản nào — các dòng chi chưa gồm phần này */
  unclassified: number
  /** phương pháp đang dùng để dựng cơ cấu này — mỗi dòng trong `lines` ứng với một khoản của nó */
  method: BudgetMethod
}

/** Số tháng đã hoàn tất dùng để dựng nền thu nhập. */
export const BASELINE_MONTHS = 3

/** Chỉ cần thu/chi — nhận cả MonthlyPoint lẫn dữ liệu dựng tay trong test. */
export interface MonthSums {
  income: number
  expense: number
}

/**
 * Thu nhập nền = trung bình thu của các tháng ĐÃ HOÀN TẤT gần nhất. null khi
 * không có tháng nào dùng được.
 *
 * Tháng không có đồng thu lẫn chi nào bị loại: đó là tháng app CHƯA CÓ DỮ LIỆU
 * (mới cài, hoặc chưa nhập), không phải tháng "thu = 0". Cộng nó vào là kéo nền
 * xuống bằng một khoảng trống. Ngược lại tháng có chi mà không có thu VẪN tính —
 * tháng nghỉ không lương là thu = 0 thật.
 */
export function baselineIncome(months: MonthSums[]): number | null {
  const withData = months.filter((m) => m.income > 0 || m.expense > 0)
  if (withData.length === 0) return null
  return Math.round(withData.reduce((s, m) => s + m.income, 0) / withData.length)
}

/**
 * So chi thực tế với mốc của từng khoản trong `method`. Mẫu số <= 0 → null: không có
 * mẫu số thì mọi tỷ lệ đều vô nghĩa, thà không hiện còn hơn hiện số sai.
 *
 * Mỗi khoản `needs` cộng chi của các `need_level` nó gom (xem `budgetMethods.ts`); khoản
 * `allExpense` (80/20) lấy thẳng tổng chi — cả tháng chỉ một khoản chi duy nhất nên không
 * đồng nào rơi ra ngoài; khoản `residual` (Để dành) luôn là thu − TỔNG chi, nên nó đúng
 * kể cả khi người dùng chưa gắn nhãn cho danh mục nào.
 *
 * `baseline` (thu nhập nền, xem `baselineIncome`) chỉ được truyền cho THÁNG ĐANG
 * DỞ. Đầu tháng chưa tới ngày lương thì thu thực tế bằng 0, và mẫu số 0 làm cả
 * khối biến mất đúng lúc người ta cần nhìn nhất — trong khi chi thì cứ phát sinh
 * từ ngày 1. Lấy nền làm mẫu số khi nó lớn hơn thu thực tế giữ khối luôn hiện,
 * đổi lại các tỷ lệ là DỰ KIẾN nên `estimated` phải được nói rõ trên màn hình.
 *
 * Tháng đã xong thì KHÔNG truyền `baseline`: tháng đó thu bao nhiêu là bấy nhiêu,
 * lấy trung bình quá khứ đắp vào là bịa ra một cơ cấu chưa từng xảy ra.
 */
export function axisProgress(
  income: number,
  data: ClassificationBreakdown,
  method: BudgetMethod,
  baseline: number | null = null,
  parts: AxisSliceMap | null = null,
): AxisProgress | null {
  // Nền chỉ đắp phần THIẾU: lương đã về (hoặc có thưởng) thì thu thật luôn thắng.
  const basis = baseline !== null && baseline > income ? baseline : income
  if (basis <= 0) return null

  const hasAll = method.buckets.some((b) => b.source.kind === 'allExpense')
  const actualOf = (b: MethodBucket): number => {
    switch (b.source.kind) {
      case 'needs':
        return b.source.levels.reduce((s, lv) => s + data.needByLevel[lv], 0)
      case 'allExpense':
        return data.totalExpense
      case 'residual':
        return basis - data.totalExpense
    }
  }

  return {
    income: basis,
    actualIncome: income,
    estimated: basis !== income,
    // Phương pháp gộp CẢ tổng chi (80/20) thì không đồng nào rơi ra ngoài —
    // đừng bật cảnh báo thiếu cho thứ đã được đếm đủ.
    unclassified: hasAll ? 0 : data.needUnclassified,
    method,
    lines: method.buckets.map((b) => {
      const actual = actualOf(b)
      const targetShare = b.bps / 10_000
      const target = Math.round(basis * targetShare)
      return {
        key: b.key,
        label: b.label,
        hint: b.hint,
        actual,
        target,
        share: actual / basis,
        targetShare,
        direction: b.direction,
        ok: b.direction === 'cap' ? actual <= target : actual >= target,
        slices: parts?.[b.key] ?? [],
      }
    }),
  }
}
