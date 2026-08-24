// Biên và bước của hai thanh trượt TIỀN trong panel Giả định — phần THUẦN.
//
// Trước đây file này còn giữ cả một lớp "đè" ba con số (AssumptionOverride,
// applyOverride, currentPhaseIndex): cách cũ để vặn thử mà không ghi đè dữ liệu. Lớp đó
// đã đi khi bản nháp (draft.ts) trùm lên CẢ kịch bản — nó vặn được cả mốc, chặng và tuổi
// chiếu tới, những thứ ba con số không mang nổi. Giữ lại hai bản cùng làm một việc là để
// chúng trôi lệch nhau.
//
// Cổng hiệu năng (R6) thì Ở LẠI, trong assumptions.test.ts: `projectLifetime` đo được
// 0,063 ms/lần trên bản chiếu 60 năm — dư 252 lần trong một khung 16 ms. Đó chính là
// điều cho phép kéo thanh trượt là chiếu lại NGAY, không đợi thả tay, và luật đó không
// đổi khi lớp đè đổi thành bản nháp.
/**
 * Biên của thanh trượt tiền: 0 → gấp đôi giá trị nền, làm tròn lên một bậc "đẹp".
 *
 * Vì sao suy từ giá trị nền chứ không đặt một hằng số: app trộn ¥ và ₫, mà một biên
 * cứng hợp với ¥5.000.000/năm thì với ₫900.000.000/năm là thanh trượt kẹt ở mép. Gấp
 * đôi cho chỗ vặn cả hai chiều mà vẫn giữ giá trị hiện tại ở khoảng giữa — chỗ dễ kéo.
 *
 * Nền bằng 0 (chưa khai thu) thì không nhân được: rơi về `fallback`, nếu không thanh
 * trượt có min = max = 0 và không kéo được đi đâu.
 */
export function moneySliderMax(baseMinor: number, fallback: number): number {
  const gapDoi = Math.abs(baseMinor) * 2
  if (gapDoi <= 0) return fallback
  // Bậc làm tròn = 1/100 của giá trị, quy về luỹ thừa 10 gần nhất — cho ra 10.000.000
  // chứ không 9.876.543, tức mép thanh trượt là một con số đọc được.
  const bac = 10 ** Math.max(0, Math.floor(Math.log10(gapDoi)) - 1)
  return Math.ceil(gapDoi / bac) * bac
}

/** Bước kéo: 1/200 khoảng, quy về bậc 10 — đủ mịn để vặn, đủ thô để không ra số lẻ xấu. */
export function moneySliderStep(max: number): number {
  const tho = max / 200
  if (tho <= 1) return 1
  return 10 ** Math.max(0, Math.floor(Math.log10(tho)))
}
