// Thuế suất biên 所得税 — suy NGƯỢC từ tổng thuế đã nộp trong năm, không dựng từ lương gộp.
//
// Vì sao ngược: dựng từ lương gộp cần 給与所得控除, 社会保険料, 基礎控除 và mọi 控除 riêng của
// người dùng — chính những thứ đã làm kikinBenefit.ts dựng từ luật lệch ba lần. Tổng 所得税
// trên 12 phiếu lương (kể cả 過不足税額 của 年末調整) đã là thuế năm THẬT, và bảng 速算表 đảo
// được: mỗi bậc là một đoạn tuyến tính, tìm bậc nào cho nghiệm nằm trong đoạn của nó.
//
// Kết quả vẫn là ƯỚC (màn hình gắn ≈): sai khi năm đó có khấu trừ đặc biệt ngoài bảng.
// THUẦN: không React, không Date.
import type { LuatNam } from './rules/luat'

/** 所得税 (chưa nhân 復興特別所得税) của một mức 課税所得, theo 速算表. */
export function thueTheoBac(thuNhapChiuThue: number, luat: LuatNam): number {
  if (thuNhapChiuThue <= 0) return 0
  const bac = luat.shotokuBac.find((b) => thuNhapChiuThue <= b.toiDa) ?? luat.shotokuBac[luat.shotokuBac.length - 1]
  return Math.round(thuNhapChiuThue * bac.suat - bac.tru)
}

/**
 * Thuế suất biên từ Σ所得税 cả năm (số trên phiếu lương, ĐÃ gồm 2,1% 復興). null khi
 * không nộp thuế — không nộp thì không có bậc, và một bậc đoán ra sẽ chảy thành tiền
 * "tiết kiệm được" giả.
 */
export function suatBienTuThue(thueNam: number, luat: LuatNam): number | null {
  if (!Number.isFinite(thueNam) || thueNam <= 0) return null
  const thueGoc = thueNam / luat.phucHung
  let duoi = 0
  for (const bac of luat.shotokuBac) {
    // Nghiệm của đoạn này: x = (thuế + trừ) / suất. Hợp lệ nếu nằm trong (dưới, tối đa].
    const x = (thueGoc + bac.tru) / bac.suat
    if (x > duoi && x <= bac.toiDa) return bac.suat
    duoi = bac.toiDa
  }
  return luat.shotokuBac[luat.shotokuBac.length - 1].suat
}

/** Tiền thuế bớt được (yên, ƯỚC) khi thêm một khấu trừ 所得税 + 住民税. */
export function tienTietKiem(
  khauTruShotoku: number,
  khauTruJumin: number,
  suatBien: number,
  luat: LuatNam,
): number {
  return Math.round(khauTruShotoku * suatBien * luat.phucHung + khauTruJumin * luat.jumin.suatShotokuWari)
}
