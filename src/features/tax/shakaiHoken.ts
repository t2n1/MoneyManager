// Bậc 標準報酬月額 của 厚生年金保険 — THUẦN, không React.
//
// Vì sao có file này: `健康保険料` và `厚生年金保険` trên phiếu lương không nói ra BẬC, mà
// bậc là thứ duy nhất cho biết một khoản 掛金 (退職金 — はぐくみ企業年金) có thật sự làm tụt
// 社会保険料 hay không. Xem docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md
//
// Nguồn: bảng 保険料額表 令和8年度 của 日本年金機構
// https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/20200825.html
//
// Thang dưới đây đã KIỂM BẰNG MÁY, không đọc mắt: suy lại từ cột tiền phí của PDF
// (`全額 ÷ 0,183` và `折半額 ÷ 0,0915` khớp nhau tới đồng, 32/32 dòng), và 31/31 biên theo
// luật trung điểm đều xuất hiện nguyên văn trong PDF, tất cả tròn nghìn.

/** 標準報酬月額 của 厚生年金保険, bậc 1 → 32 (令和8年度). */
export const KOSEI_NENKIN_LADDER = [
  88_000, 98_000, 104_000, 110_000, 118_000, 126_000, 134_000, 142_000,
  150_000, 160_000, 170_000, 180_000, 190_000, 200_000, 220_000, 240_000,
  260_000, 280_000, 300_000, 320_000, 340_000, 360_000, 380_000, 410_000,
  440_000, 470_000, 500_000, 530_000, 560_000, 590_000, 620_000, 650_000,
] as const

/**
 * Phần người lao động của 厚生年金保険料: 18,300% ÷ 2. Cố định toàn quốc từ
 * 平成29年9月1日 — không đổi theo tỉnh, không đổi theo năm như suất 健康保険.
 */
export const KOSEI_NENKIN_EMPLOYEE_RATE = 0.0915

/**
 * 報酬月額 → số bậc (1..32); `null` khi ngoài thang đã kiểm.
 *
 * Biên là **trung điểm** hai mức liền nhau. Nhưng luật đó chỉ đúng cho biên TRONG: bậc 1
 * là `93.000円未満` và bậc 32 là `635.000円以上` — hai đầu hở.
 *
 * Ngoài ¥88.000–¥650.000 trả `null` chứ KHÔNG kẹp về hai đầu: 健康保険 còn ba bậc thấp hơn
 * (58.000 / 68.000 / 78.000) và nhiều bậc cao hơn mà spec không kiểm được (PDF của
 * 協会けんぽ lỗi font, rơi dòng), nên kẹp là lặng lẽ trả lời sai cho một mức lương app chưa
 * hề kiểm.
 */
export function gradeOf(rewardMonthly: number): number | null {
  const L = KOSEI_NENKIN_LADDER
  if (!Number.isFinite(rewardMonthly)) return null
  if (rewardMonthly < L[0] || rewardMonthly > L[L.length - 1]) return null
  for (let i = L.length - 1; i >= 1; i--) {
    if (rewardMonthly >= (L[i - 1] + L[i]) / 2) return i + 1
  }
  return 1
}

/** Số bậc → 標準報酬月額; `null` khi bậc ngoài 1..32. */
export function standardMonthlyOf(grade: number): number | null {
  return KOSEI_NENKIN_LADDER[grade - 1] ?? null
}

/**
 * 標準報酬月額 suy từ số 厚生年金保険料 trên phiếu lương.
 *
 * `hasKikinLine` = phiếu có dòng `厚生年金基金`. Người thuộc 厚生年金基金 đóng
 * 13,300%–15,900% theo 免除保険料率, không phải 18,300% — phép chia cho 0,0915 ra một con
 * số SAI, và nó chảy vào cả khối "đã giảm được" lẫn khối lương hưu của màn 退職金. Nên
 * trả `null` và để màn hình nói "không suy được", chứ không đoán.
 */
export function standardMonthlyFromPension(
  pensionPremium: number,
  hasKikinLine: boolean,
): number | null {
  if (hasKikinLine) return null
  if (!Number.isFinite(pensionPremium) || pensionPremium <= 0) return null
  const grade = gradeOf(Math.round(pensionPremium / KOSEI_NENKIN_EMPLOYEE_RATE))
  return grade === null ? null : standardMonthlyOf(grade)
}
