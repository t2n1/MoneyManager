// Luật thuế Nhật mà màn Quyền lợi dựa vào — MỘT BỘ MỘT NĂM, mỗi hằng số kèm nguồn.
//
// Vì sao tách theo năm chứ không sửa đè: luật đổi (ngưỡng 38万 chỉ có từ 令和5年分, thu
// nhập tối đa của người thân 48万→58万 từ 2025), mà khoản ② soát lùi 5 năm. Sửa đè là
// soát năm 2021 bằng luật 2026 và bảo người dùng "chưa đủ" một khoản họ đã đủ.
//
// THUẦN: không React, không Date. Bộ luật thông báo và edge function cùng đọc file này.
import { LUAT_2022 } from './2022'
import { LUAT_2026 } from './2026'

export interface BacThue {
  /** 課税所得 tối đa của bậc (yên). Bậc cuối = Infinity. */
  toiDa: number
  suat: number
  /** Số trừ nhanh của 速算表 (yên). */
  tru: number
}

export interface LuatNam {
  /** Năm ĐẦU bộ luật này áp dụng. */
  nam: number
  /** URL đã tra, để màn hình in ra được "theo …". */
  nguon: string[]
  fuyo: {
    /** Người thân 30–69 phải nhận ≥ ngần này trong năm; null = không có ngưỡng (trước 2023). */
    nguong30_69: number | null
    /** Khấu trừ 所得税: 一般 / 老人 (70+). */
    khauTruShotoku: { thuong: number; laoNhan: number }
    /** Khấu trừ 住民税: 一般 / 老人. */
    khauTruJumin: { thuong: number; laoNhan: number }
    /** 合計所得金額 tối đa của người thân — app KHÔNG kiểm, chỉ in ra hỏi. */
    thuNhapToiDa: number
  }
  jumin: { kinhToDan: number; suatShotokuWari: number }
  /** 復興特別所得税: nhân vào 所得税. */
  phucHung: number
  shotokuBac: BacThue[]
  furusato: { tuChiu: number; tyLeShotokuWari: number }
  nisa: { tsumitate: number; growth: number; tongDoi: number }
  iryohi: {
    /** Ngưỡng trừ nhánh chính (yên). Vế min-5%-tổng-thu-nhập cố ý bỏ — mọi số của
     *  khoản ⑤ là CẬN DƯỚI (spec iryohi §4): thu nhập thấp thì ngưỡng thật thấp hơn,
     *  khấu trừ thật chỉ lớn hơn. */
    nguong: number
    tranKhauTru: number
    selfMed: {
      nguong: number
      tran: number
      /** ISO ngày cuối hiệu lực; null = không hạn. 2026-12-31 theo 令和4年度改正. */
      hetHan: string | null
    }
  }
}

/** Bộ luật MỚI NHẤT trước hoặc bằng `year`. Xếp tăng theo `nam`. */
const CAC_BO: LuatNam[] = [LUAT_2022, LUAT_2026]

export function luatChoNam(year: number): LuatNam {
  let chon = CAC_BO[0]
  for (const bo of CAC_BO) if (bo.nam <= year) chon = bo
  return chon
}
