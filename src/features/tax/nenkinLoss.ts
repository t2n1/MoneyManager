// Lương hưu 老齢厚生年金 mất bao nhiêu khi 標準報酬月額 tụt — THUẦN, không React.
//
// Đây là MẶT TRÁI của việc đóng 掛金 vào 退職金 (はぐくみ企業年金): 掛金 trích từ lương nên
// 標準報酬 tụt, 社会保険料 giảm — nhưng 厚生年金 sau này cũng giảm theo. Sheet của 基金 nói ra
// điều này, và màn hình phải nói lại; hiện phần lợi mà im phần mất là một nửa sự thật.

/**
 * Hệ số phần 報酬比例 của 老齢厚生年金, cho giai đoạn từ 平成15年4月 (2003/04) trở đi:
 *
 *   年金/năm = 平均標準報酬額 × 5,481/1000 × số tháng tham gia
 *
 * Kiểm được: tụt ¥20.000 trong 12 tháng ra `20.000 × 5,481/1000 × 12 = ¥1.315,44` — đúng
 * con số ¥1.315 mà sheet của 基金 tự in ra cho プラン①.
 */
export const HOSHU_HIREI_COEF = 5.481 / 1000

/**
 * Lương hưu hằng năm mất đi, do 標準報酬月額 thấp hơn `standardDrop` yên trong `months`
 * tháng.
 *
 * Trả **0** khi đầu vào vô nghĩa: một số âm ở đây nghĩa là "được thêm lương hưu nhờ đóng
 * 掛金", điều không xảy ra — thà trả 0 còn hơn để một con số ngược dấu chảy ra màn hình.
 */
export function annualPensionLoss(standardDrop: number, months: number): number {
  if (!Number.isFinite(standardDrop) || !Number.isFinite(months)) return 0
  if (standardDrop <= 0 || months <= 0) return 0
  return Math.round(standardDrop * HOSHU_HIREI_COEF * months)
}
