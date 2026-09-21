// Sinh CẢ BẢNG hạn mức từ trung bình lịch sử — thuần, không React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: app đã tính sẵn trung bình 6 tháng cho từng danh mục
// (`suggestLimits`) và đã đưa nó vào sheet đặt hạn mức của TỪNG dòng. Cái còn thiếu là
// bước đầu tiên: một người mới, hoặc một người muốn dựng lại từ đầu, phải mở sheet 20
// lần và gõ 20 con số mà app đã biết cả rồi. Đó là chỗ người ta bỏ cuộc.
//
// KHÔNG phải "đặt hạn mức hộ rồi thôi": kết quả là một bản NHÁP để người dùng sửa. Vì
// vậy hàm này trả về danh sách đề xuất kèm lý do, không tự ghi.

import { isTrackingMarker } from './progress'

/** Một dòng đề xuất. `current` là hạn mức đang có (0 = chưa đặt). */
export interface AutoBudgetLine {
  categoryId: string
  /** Số đề xuất, base minor. Luôn > 0. */
  amount: number
  /** Hạn mức đang có. 0 = chưa đặt bao giờ. */
  current: number
  /** Trung bình lịch sử (base minor) — để UI hiện "vì sao là số này". */
  average: number
}

export interface AutoBudgetPlan {
  /** Những dòng sẽ ghi. Đã sắp giảm dần theo số tiền. */
  lines: AutoBudgetLine[]
  /** Số dòng sẽ ĐÈ lên hạn mức đang có — con số phải nói ra trước khi bấm. */
  overwrite: number
  /**
   * TỔNG NGÂN SÁCH SAU KHI GHI — cùng luật với `BudgetReport.totalBudgeted`, nên nó so
   * thẳng được với con số tab Ngân sách đang hiện.
   *
   * Không phải tổng các dòng đề xuất: dòng con nằm dưới một cha cũng có trần chỉ là mốc
   * theo dõi (`isTrackingMarker`) và không vào tổng, còn hạn mức đang có mà bản đề xuất
   * không đụng tới thì vẫn còn đó nên vẫn phải cộng. Cộng ngây thơ mọi dòng cho ra
   * ¥837.000 ở tháng 2026-09 trong khi kế hoạch thật là ¥432.000.
   */
  total: number
}

/** Bội số làm tròn theo độ lớn: số tròn thì người ta nhớ được và sửa được. */
export function roundLimit(amount: number): number {
  if (amount <= 0) return 0
  if (amount < 1_000) return Math.max(100, Math.round(amount / 100) * 100)
  if (amount < 10_000) return Math.round(amount / 500) * 500
  if (amount < 100_000) return Math.round(amount / 1_000) * 1_000
  return Math.round(amount / 10_000) * 10_000
}

export interface AutoBudgetInput {
  /** Trung bình lịch sử theo danh mục. */
  averages: ReadonlyMap<string, number>
  /** Hạn mức đang có theo danh mục. Thiếu = chưa đặt. */
  current: ReadonlyMap<string, number>
  /** Danh mục được phép đặt hạn mức — đã loại `kind = 'transfer'` và mục đã lưu trữ. */
  eligible: readonly string[]
  /**
   * Bỏ qua danh mục có trung bình dưới mức này (base minor). Mặc định 0 = không bỏ.
   *
   * Vì sao cần: một danh mục trung bình ¥180/tháng mà cũng có một dòng hạn mức thì bảng
   * dài thêm mà chẳng canh được gì — hạn mức chỉ có nghĩa khi vượt nó là một tin.
   */
  minAverage?: number
  /**
   * Giữ nguyên hạn mức người dùng đã tự đặt. Mặc định false = đè hết.
   *
   * Hai chế độ vì hai ý định khác nhau: "dựng lại từ đầu" và "điền nốt chỗ còn trống".
   * Gộp làm một thì một trong hai ý định không làm được.
   */
  keepExisting?: boolean
  /**
   * Danh mục CHA của một danh mục (null = danh mục gốc). Chỉ dùng để tính `total` cho
   * đúng luật mốc theo dõi; nó KHÔNG đổi những dòng nào được đề xuất.
   *
   * Mặc định: mọi danh mục là gốc → `total` bằng tổng các dòng, như trước.
   */
  parentOf?: (categoryId: string) => string | null
}

/**
 * Dựng bản đề xuất. Không ghi gì — nơi gọi tự quyết định có ghi hay không.
 *
 * Danh mục KHÔNG có lịch sử (trung bình 0) bị bỏ hẳn, không đặt hạn mức 0: hạn mức ¥0 là
 * một hạn mức THẬT trong app này (tiêu một đồng vào đó là vượt — xem `progress.ts`), nên
 * sinh hàng loạt số 0 là âm thầm gán cho hàng chục danh mục một lời hứa người dùng chưa
 * bao giờ khai.
 */
export function planAutoBudget(input: AutoBudgetInput): AutoBudgetPlan {
  const min = input.minAverage ?? 0
  const lines: AutoBudgetLine[] = []
  for (const categoryId of input.eligible) {
    const average = input.averages.get(categoryId) ?? 0
    if (average <= 0 || average < min) continue
    const current = input.current.get(categoryId) ?? 0
    if (input.keepExisting && current > 0) continue
    const amount = roundLimit(average)
    if (amount <= 0) continue
    // Làm tròn xong mà trùng đúng hạn mức đang có thì đây không phải một thay đổi —
    // đếm nó vào "sẽ đè N dòng" là doạ người dùng bằng một con số rỗng.
    if (amount === current) continue
    lines.push({ categoryId, amount, current, average })
  }
  lines.sort((a, b) => b.amount - a.amount)
  return {
    lines,
    overwrite: lines.filter((l) => l.current > 0).length,
    total: totalAfterWrite(lines, input),
  }
}

/**
 * Tổng ngân sách app sẽ hiện sau khi ghi bản đề xuất này.
 *
 * Sổ sau khi ghi = hạn mức đang có, với những dòng trong `lines` được thay số. Trên tập
 * đó áp đúng luật của `buildBudgetReport`: dòng nào là mốc theo dõi thì không cộng.
 *
 * Một xấp xỉ đã biết: `current` là hạn mức HIỆU LỰC (đã gồm phần dồn của tháng trước),
 * còn `line.amount` là số thô. Dòng bật dồn mà bị đè sẽ được cộng thiếu đúng phần dồn
 * đó. Chỗ gọi duy nhất cũng dựng `current` từ `BudgetLine.budgeted` nên phép so
 * "làm tròn xong trùng hạn mức đang có" ở trên vốn đã sống chung với xấp xỉ này.
 */
function totalAfterWrite(lines: AutoBudgetLine[], input: AutoBudgetInput): number {
  const parentOf = input.parentOf ?? (() => null)
  const amountAfter = new Map(input.current)
  for (const l of lines) amountAfter.set(l.categoryId, l.amount)
  const budgetedIds = new Set(amountAfter.keys())
  let total = 0
  for (const [categoryId, amount] of amountAfter) {
    if (isTrackingMarker(categoryId, parentOf, budgetedIds)) continue
    total += amount
  }
  return total
}
