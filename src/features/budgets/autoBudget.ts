// Sinh CẢ BẢNG hạn mức từ trung bình lịch sử — thuần, không React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: app đã tính sẵn trung bình 6 tháng cho từng danh mục
// (`suggestLimits`) và đã đưa nó vào sheet đặt hạn mức của TỪNG dòng. Cái còn thiếu là
// bước đầu tiên: một người mới, hoặc một người muốn dựng lại từ đầu, phải mở sheet 20
// lần và gõ 20 con số mà app đã biết cả rồi. Đó là chỗ người ta bỏ cuộc.
//
// KHÔNG phải "đặt hạn mức hộ rồi thôi": kết quả là một bản NHÁP để người dùng sửa. Vì
// vậy hàm này trả về danh sách đề xuất kèm lý do, không tự ghi.

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
  /** Tổng của mọi dòng đề xuất. */
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
    total: lines.reduce((s, l) => s + l.amount, 0),
  }
}
