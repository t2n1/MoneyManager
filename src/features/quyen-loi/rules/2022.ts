// Luật cho năm thuế ≤ 2022 (trước 令和5年分): 国外居住親族 CHƯA có ngưỡng 38万 cho nhóm
// 30–69, chỉ cần 親族関係書類 + 送金関係書類. Thu nhập tối đa của người thân còn là 48万.
// Khoản ② (đòi lại 5 năm cũ) soát năm 2021–2022 bằng bộ này.
import { LUAT_2026 } from './2026'
import type { LuatNam } from './luat'

export const LUAT_2022: LuatNam = {
  ...LUAT_2026,
  nam: 0,
  nguon: [
    // Ghi rõ ngưỡng 38万 chỉ từ 令和5年分
    'https://www.city.funabashi.lg.jp/kurashi/zei/001/03/p048568.html',
  ],
  fuyo: {
    ...LUAT_2026.fuyo,
    nguong30_69: null,
    thuNhapToiDa: 480_000,
  },
}
