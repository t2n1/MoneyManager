// Nhãn CỐ ĐỊNH / BIẾN ĐỔI / CHƯA GẮN hiện ngay trong danh sách danh mục (bản vẽ 22e).
//
// 22e nói rõ vì sao nó phải ở ĐÂY chứ không chỉ nằm trong form sửa: "cột Cố định/Biến đổi
// hiện ngay tại đây vì nó NUÔI BA CHỈ SỐ (trang Phân loại chi tiêu riêng chỉ là lối đi
// nhanh)". Ba chỗ ăn `cost_type`:
//
//   · quỹ dự phòng ở tab Sức khỏe — mẫu số là chi CỐ ĐỊNH mỗi tháng;
//   · trục Thiết yếu/Linh hoạt của tab Ngân sách (qua `need_level`, cùng cặp phân loại);
//   · kịch bản "cắt hết chi linh hoạt" của mô phỏng mất thu nhập.
//
// Trước đây muốn biết một danh mục đã gắn chưa thì phải MỞ TỪNG CÁI ra. Với 17 danh mục
// cha thì đó là 17 lần bấm để trả lời một câu hỏi mà mắt lẽ ra quét một lượt là xong — và
// vì không thấy, phần "chưa gắn" cứ ở lại, rồi ba chỉ số trên kia âm thầm tính thiếu.
import type { CostType } from '../../types/database.types'

export interface CostBadge {
  text: string
  /** true = chưa gắn; nơi hiển thị tô nhạt hơn và đây là thứ đáng đi sửa. */
  missing: boolean
}

/**
 * Nhãn cho một danh mục. `null` = KHÔNG vẽ nhãn nào.
 *
 * Trả `null` cho danh mục THU và cho danh mục DÒNG CHẢY, không phải vì thiếu dữ liệu mà
 * vì câu hỏi "cố định hay biến đổi" không áp vào chúng: lương không phải một khoản chi để
 * chia thành cố định/biến đổi, và trả nợ / điều chỉnh số dư thì 22e đã ghi thẳng là "không
 * phải chi tiêu". Vẽ "CHƯA GẮN" ở đó là dựng ra một việc cần làm không tồn tại — và với
 * người dùng thì một danh sách toàn nhãn vàng "chưa gắn" nhanh chóng thành nhãn để bỏ qua.
 */
export function costBadge(input: {
  type: string
  costType: CostType | null
  /** true = danh mục dòng chảy (trả nợ, điều chỉnh số dư…) — xem `isFlowCategory`. */
  isFlow: boolean
}): CostBadge | null {
  if (input.type !== 'expense' || input.isFlow) return null
  if (input.costType === 'fixed') return { text: 'CỐ ĐỊNH', missing: false }
  if (input.costType === 'variable') return { text: 'BIẾN ĐỔI', missing: false }
  return { text: 'CHƯA GẮN', missing: true }
}

/**
 * "14 chi · 3 thu" — đếm ở tiêu đề trang (22e).
 *
 * Đếm danh mục CHA, không phải mọi dòng: con nằm trong cha, cộng cả hai vào một số làm nó
 * to lên gấp ba mà không nói thêm gì. Bỏ danh mục đã lưu trữ — nơi gọi tự lọc trước.
 */
export function categoryCounts(cats: readonly { type: string; parent_id: string | null }[]): {
  expense: number
  income: number
} {
  const goc = cats.filter((c) => c.parent_id === null)
  return {
    expense: goc.filter((c) => c.type === 'expense').length,
    income: goc.filter((c) => c.type === 'income').length,
  }
}

/**
 * Bao nhiêu danh mục CẦN gắn mà chưa gắn — cho MỘT dòng cảnh báo gộp ở đầu trang.
 *
 * Vì sao cần con số này thay vì để mỗi dòng tự báo động: chạy thật trên dữ liệu demo ra
 * 46 nhãn "CHƯA GẮN" trên 60 dòng. Bốn mươi sáu ô vàng là một bức tường, và một nhãn báo
 * động xuất hiện khắp nơi thì thành nhãn để bỏ qua — đúng điều đoạn chú thích ở
 * `costBadge` phía trên nói phải tránh. Nên: nhãn từng dòng chỉ THÔNG TIN (viền gạch, chữ
 * mờ), còn báo động là một dòng duy nhất có SỐ và có đường đi sửa.
 *
 * Chỉ đếm những dòng mà `costBadge` thật sự trả về nhãn thiếu — tức đã loại danh mục thu
 * và danh mục dòng chảy, nên con số này không bao giờ đòi người dùng gắn một thứ không
 * gắn được.
 */
export function missingCostCount(
  cats: readonly { type: string; cost_type: CostType | null; name: string }[],
  isFlow: (c: { name: string }) => boolean,
): number {
  return cats.filter(
    (c) => costBadge({ type: c.type, costType: c.cost_type, isFlow: isFlow(c) })?.missing,
  ).length
}
