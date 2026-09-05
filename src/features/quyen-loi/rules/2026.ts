// Luật áp dụng cho năm thuế 2023 trở đi (令和5年分〜). Đặt tên 2026 là năm TRA, để năm sau
// ai mở ra biết số đã được kiểm lúc nào. Từng con số có test đối chiếu ở luat.test.ts.
import type { LuatNam } from './luat'

export const LUAT_2026: LuatNam = {
  nam: 2023,
  nguon: [
    // 扶養控除 — mức, điều kiện 国外居住親族 30–69 (38万), thu nhập ≤ 58万 từ 2025
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm',
    // Giấy tờ theo nhóm tuổi (16–29 / 30–69 / 70+)
    'https://www.city.ota.tokyo.jp/seikatsu/zeikin/kazei/kokugaifuyou.html',
    // 還付申告 5 năm
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2030.htm',
    // ふるさと納税 công thức trần
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm',
    // 均等割 5.000 gồm 森林環境税 từ 令和6年度
    'https://www.city.sapporo.jp/citytax/syurui/shiminzei/kojin_2024zeikai.html',
    // 速算表 所得税
    'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
    // NISA
    'https://www.fsa.go.jp/policy/nisa2/know/index.html',
  ],
  fuyo: {
    nguong30_69: 380_000,
    khauTruShotoku: { thuong: 380_000, laoNhan: 480_000 },
    khauTruJumin: { thuong: 330_000, laoNhan: 380_000 },
    thuNhapToiDa: 580_000,
  },
  jumin: { kinhToDan: 5_000, suatShotokuWari: 0.1 },
  phucHung: 1.021,
  shotokuBac: [
    { toiDa: 1_949_000, suat: 0.05, tru: 0 },
    { toiDa: 3_299_000, suat: 0.1, tru: 97_500 },
    { toiDa: 6_949_000, suat: 0.2, tru: 427_500 },
    { toiDa: 8_999_000, suat: 0.23, tru: 636_000 },
    { toiDa: 17_999_000, suat: 0.33, tru: 1_536_000 },
    { toiDa: 39_999_000, suat: 0.4, tru: 2_796_000 },
    { toiDa: Infinity, suat: 0.45, tru: 4_796_000 },
  ],
  furusato: { tuChiu: 2_000, tyLeShotokuWari: 0.2 },
  nisa: { tsumitate: 1_200_000, growth: 2_400_000, tongDoi: 18_000_000 },
  iryohi: {
    nguong: 100_000,
    tranKhauTru: 2_000_000,
    selfMed: { nguong: 12_000, tran: 88_000, hetHan: '2026-12-31' },
  },
}
